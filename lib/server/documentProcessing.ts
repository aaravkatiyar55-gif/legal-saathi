import "server-only";

import type { DocumentExtractionStatus } from "@/lib/types";

export type DocumentExtractionResult = {
  extractedText?: string;
  extractionStatus: DocumentExtractionStatus;
  extractionMessage?: string;
};

type DocumentProcessingInput = {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
};

const MAX_EXTRACTED_CHARACTERS = 200_000;

const textExtensions = new Set([".txt", ".md", ".csv", ".json", ".rtf"]);
const officeExtensions = new Set([".docx"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const getExtension = (fileName: string) => {
  const matches = /\.[a-z0-9]+$/i.exec(fileName);
  return matches?.[0].toLowerCase() ?? "";
};

const limitText = (text: string) => text.replace(/\u0000/g, "").trim().slice(0, MAX_EXTRACTED_CHARACTERS);

const completed = (text: string, emptyMessage: string): DocumentExtractionResult => {
  const extractedText = limitText(text);
  return extractedText
    ? { extractedText, extractionStatus: "complete" }
    : { extractionStatus: "unavailable", extractionMessage: emptyMessage };
};

const extractPdfText = async (buffer: Buffer): Promise<DocumentExtractionResult> => {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return completed(result.text, "This PDF does not contain an embedded text layer.");
    } finally {
      await parser.destroy();
    }
  } catch {
    console.warn("[Document processing] PDF extraction failed", { category: "pdf_extraction_failure" });
    return { extractionStatus: "failed", extractionMessage: "The server could not extract text from this PDF." };
  }
};

const extractDocxText = async (buffer: Buffer): Promise<DocumentExtractionResult> => {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return completed(result.value, "No readable text was found in this DOCX file.");
  } catch {
    console.warn("[Document processing] DOCX extraction failed", { category: "docx_extraction_failure" });
    return { extractionStatus: "failed", extractionMessage: "The server could not extract text from this DOCX file." };
  }
};

const extractImageText = async (buffer: Buffer): Promise<DocumentExtractionResult> => {
  const langPath = process.env.LEGAL_SATHI_OCR_LANG_PATH;
  if (!langPath) {
    return {
      extractionStatus: "unavailable",
      extractionMessage: "OCR is ready but needs LEGAL_SATHI_OCR_LANG_PATH before image text can be read."
    };
  }

  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(process.env.LEGAL_SATHI_OCR_LANGUAGE ?? "eng", 1, { langPath });
    try {
      const result = await worker.recognize(buffer);
      return completed(result.data.text, "OCR could not find readable text in this image.");
    } finally {
      await worker.terminate();
    }
  } catch {
    console.warn("[Document processing] OCR failed", { category: "ocr_failure" });
    return { extractionStatus: "failed", extractionMessage: "The OCR service could not read this image." };
  }
};

export const extractDocumentText = async ({ buffer, fileName, mimeType }: DocumentProcessingInput): Promise<DocumentExtractionResult> => {
  const extension = getExtension(fileName);

  if (mimeType?.startsWith("text/") || textExtensions.has(extension)) {
    return completed(buffer.toString("utf8"), "No readable text was found in this file.");
  }

  if (mimeType === "application/pdf" || extension === ".pdf") {
    return extractPdfText(buffer);
  }

  if (mimeType?.includes("wordprocessingml") || officeExtensions.has(extension)) {
    return extractDocxText(buffer);
  }

  if (mimeType?.startsWith("image/") || imageExtensions.has(extension)) {
    return extractImageText(buffer);
  }

  return {
    extractionStatus: "unavailable",
    extractionMessage: "Text extraction is not available for this file type yet."
  };
};
