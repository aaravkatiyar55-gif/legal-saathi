import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { env } from "../../config/env";

export type DocumentExtractionStatus = "complete" | "unavailable" | "failed";
export type DocumentExtractionResult = {
  extractedText?: string;
  extractionStatus: DocumentExtractionStatus;
  extractionMessage?: string;
};

const MAX_EXTRACTED_CHARACTERS = 200_000;
const MAX_PDF_PAGES = 100;
const PDF_INFO_TIMEOUT_MS = 10_000;
const PDF_TEXT_TIMEOUT_MS = 25_000;
const OCR_TIMEOUT_MS = 30_000;
const VIDEO_FRAME_TIMEOUT_MS = 25_000;
const textExtensions = new Set([".txt", ".md", ".csv", ".json", ".rtf"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const spreadsheetExtensions = new Set([".xlsx"]);
const videoExtensions = new Set([".mp4", ".m4v", ".mov", ".webm", ".avi", ".mpeg", ".mpg"]);

function limitText(text: string) {
  return text.replace(/\u0000/g, "").trim().slice(0, MAX_EXTRACTED_CHARACTERS);
}

function completed(text: string, emptyMessage: string): DocumentExtractionResult {
  const extractedText = limitText(text);
  return extractedText
    ? { extractedText, extractionStatus: "complete" }
    : { extractionStatus: "unavailable", extractionMessage: emptyMessage };
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("DOCUMENT_PROCESSING_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function extractPdfText(buffer: Buffer): Promise<DocumentExtractionResult> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const info = await withTimeout(parser.getInfo({ first: 1 }), PDF_INFO_TIMEOUT_MS);
      if (info.total > MAX_PDF_PAGES) {
        return { extractionStatus: "unavailable", extractionMessage: `PDFs are limited to ${MAX_PDF_PAGES} pages for safe processing.` };
      }
      const result = await withTimeout(parser.getText({ first: MAX_PDF_PAGES }), PDF_TEXT_TIMEOUT_MS);
      return completed(result.text, "This PDF does not contain an embedded text layer.");
    } finally {
      await parser.destroy();
    }
  } catch {
    console.warn("[Document processing] extraction failed", { category: "pdf_extraction_failure" });
    return { extractionStatus: "failed", extractionMessage: "The server could not extract text from this PDF." };
  }
}

async function extractDocxText(buffer: Buffer): Promise<DocumentExtractionResult> {
  try {
    const mammoth = await import("mammoth");
    const result = await withTimeout(mammoth.extractRawText({ buffer }), PDF_TEXT_TIMEOUT_MS);
    return completed(result.value, "No readable text was found in this DOCX file.");
  } catch {
    console.warn("[Document processing] extraction failed", { category: "docx_extraction_failure" });
    return { extractionStatus: "failed", extractionMessage: "The server could not extract text from this DOCX file." };
  }
}

async function extractImageBuffersText(buffers: Buffer[]): Promise<DocumentExtractionResult> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(
      env.ocrLanguage,
      1,
      {
        ...(env.ocrLanguagePath ? { langPath: env.ocrLanguagePath } : {}),
        // Tesseract otherwise rethrows rejected worker jobs on the event loop,
        // which can terminate the server for a malformed image.
        errorHandler: () => undefined,
      },
    );
    try {
      const text: string[] = [];
      for (const buffer of buffers.slice(0, 3)) {
        const result = await withTimeout(worker.recognize(buffer), OCR_TIMEOUT_MS);
        if (result.data.text.trim()) text.push(result.data.text);
      }
      return completed(text.join("\n\n"), "OCR could not find readable text in this image.");
    } finally {
      await worker.terminate();
    }
  } catch {
    console.warn("[Document processing] extraction failed", { category: "ocr_failure" });
    return { extractionStatus: "failed", extractionMessage: "The OCR service could not read this image." };
  }
}

async function extractImageText(buffer: Buffer): Promise<DocumentExtractionResult> {
  return extractImageBuffersText([buffer]);
}

async function extractSpreadsheetText(buffer: Buffer): Promise<DocumentExtractionResult> {
  try {
    const { default: readXlsxFile } = await import("read-excel-file/node");
    const sheets = await withTimeout(readXlsxFile(buffer), PDF_TEXT_TIMEOUT_MS);
    let remainingRows = 5_000;
    const text = sheets
      .map((sheet) => {
        const rows = sheet.data
          .slice(0, remainingRows)
          .map((row) => row.map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim()).join("\t"));
        remainingRows -= rows.length;
        return rows.length > 0 ? [`Worksheet: ${sheet.sheet}`, ...rows].join("\n") : "";
      })
      .filter(Boolean)
      .join("\n\n");
    return completed(text, "No readable cells were found in this spreadsheet.");
  } catch {
    console.warn("[Document processing] extraction failed", { category: "spreadsheet_extraction_failure" });
    return { extractionStatus: "failed", extractionMessage: "The server could not extract cells from this spreadsheet." };
  }
}

async function extractVideoText(buffer: Buffer, extension: string): Promise<DocumentExtractionResult> {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "legal-saathi-video-"));
  const inputPath = path.join(temporaryDirectory, `input${extension}`);
  const outputPattern = path.join(temporaryDirectory, "frame-%02d.png");
  try {
    await fs.writeFile(inputPath, buffer, { flag: "wx" });
    await new Promise<void>((resolve, reject) => {
      const process = spawn("ffmpeg", [
        "-nostdin",
        "-hide_banner",
        "-loglevel", "error",
        "-t", "30",
        "-i", inputPath,
        "-vf", "fps=1/10,scale=1280:-2",
        "-frames:v", "3",
        "-y",
        outputPattern,
      ], {
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"],
      });
      const timer = setTimeout(() => {
        process.kill();
        reject(new Error("VIDEO_FRAME_EXTRACTION_TIMEOUT"));
      }, VIDEO_FRAME_TIMEOUT_MS);
      const finish = (operation: () => void) => {
        clearTimeout(timer);
        operation();
      };
      process.stderr?.on("data", () => undefined);
      process.once("error", (error) => finish(() => reject(error)));
      process.once("exit", (code) => finish(() => code === 0 ? resolve() : reject(new Error("VIDEO_FRAME_EXTRACTION_FAILED"))));
    });
    const frameNames = (await fs.readdir(temporaryDirectory))
      .filter((name) => /^frame-\d+\.png$/.test(name))
      .sort()
      .slice(0, 3);
    if (frameNames.length === 0) {
      return {
        extractionStatus: "unavailable",
        extractionMessage: "The video is stored, but no readable preview frames were found. Add a transcript for spoken content.",
      };
    }
    const frames = await Promise.all(frameNames.map((name) => fs.readFile(path.join(temporaryDirectory, name))));
    const ocr = await extractImageBuffersText(frames);
    return ocr.extractedText
      ? { ...ocr, extractionMessage: "On-screen text was extracted from up to three bounded video frames. Spoken audio still needs a transcript." }
      : {
          extractionStatus: "unavailable",
          extractionMessage: "The video is stored, but no readable on-screen text was found. Add a transcript for spoken content.",
        };
  } catch {
    console.warn("[Document processing] extraction failed", { category: "video_frame_extraction_failure" });
    return {
      extractionStatus: "unavailable",
      extractionMessage: "The video is stored, but safe frame analysis is unavailable. Add screenshots or a transcript for semantic review.",
    };
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

export async function extractDocumentText(input: { buffer: Buffer; fileName: string; mimeType?: string }): Promise<DocumentExtractionResult> {
  const extension = path.extname(input.fileName).toLowerCase();
  if (input.mimeType?.startsWith("text/") || textExtensions.has(extension)) {
    return completed(input.buffer.toString("utf8"), "No readable text was found in this file.");
  }
  if (input.mimeType === "application/pdf" || extension === ".pdf") return extractPdfText(input.buffer);
  if (input.mimeType?.includes("wordprocessingml") || extension === ".docx") return extractDocxText(input.buffer);
  if (input.mimeType?.includes("spreadsheetml") || spreadsheetExtensions.has(extension)) return extractSpreadsheetText(input.buffer);
  if (input.mimeType?.startsWith("image/") || imageExtensions.has(extension)) return extractImageText(input.buffer);
  if (input.mimeType?.startsWith("video/") || videoExtensions.has(extension)) return extractVideoText(input.buffer, extension);
  return { extractionStatus: "unavailable", extractionMessage: "Text extraction is not available for this file type." };
}
