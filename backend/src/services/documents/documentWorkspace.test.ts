import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";

function createXlsxFixture() {
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    "xl/workbook.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Evidence Register" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Document</t></is></c><c r="B1" t="inlineStr"><is><t>Amount</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Legal notice invoice</t></is></c><c r="B2"><v>1250</v></c></row></sheetData></worksheet>',
    ),
  }, { level: 0 }));
}

async function run() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "legal-saathi-document-workspace-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    DOCUMENT_STORAGE_BACKEND: "local",
    DOCUMENT_STORAGE_DIR: temporaryRoot,
  });

  let passed = 0;
  const check = (condition: unknown, label: string) => {
    assert.ok(condition, label);
    passed += 1;
  };

  try {
    const { classifyDocumentCategory } = await import("./documentCategory.service");
    const { extractDocumentText } = await import("./documentProcessing.service");
    const {
      addStoredDocumentAnnotation,
      deleteStoredDocument,
      listStoredDocumentsForCase,
      readStoredDocument,
      storeDocument,
      updateStoredDocumentCase,
      updateStoredDocumentCategory,
    } = await import("./documentStore.service");
    const xlsxFixture = createXlsxFixture();

    check(classifyDocumentCategory({ fileName: "petition-final.pdf" }).category === "Pleadings", "petition filenames auto-sort to Pleadings");
    check(classifyDocumentCategory({ fileName: "camera-upload.png", mimeType: "image/png" }).category === "Evidence", "images auto-sort to Evidence");
    check(classifyDocumentCategory({ fileName: "unknown.bin" }).category === "Other", "unknown files stay in Other");

    const extraction = await extractDocumentText({
      buffer: xlsxFixture,
      fileName: "evidence-register.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    check(extraction.extractionStatus === "complete", "modern spreadsheet extraction completes");
    check(extraction.extractedText?.includes("Worksheet: Evidence Register"), "worksheet name is retained");
    check(extraction.extractedText?.includes("Legal notice invoice") && extraction.extractedText.includes("1250"), "spreadsheet cells are retained");

    const corruptImage = await extractDocumentText({
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
      fileName: "corrupt-evidence.png",
      mimeType: "image/png",
    });
    check(corruptImage.extractionStatus === "failed", "a malformed image fails OCR without terminating the process");

    const owner = "document-owner@example.test";
    const otherOwner = "other-owner@example.test";
    const documentId = "document-0001";
    const caseId = "case-0001";
    await storeDocument({
      id: documentId,
      ownerEmail: owner,
      name: "evidence-register.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: xlsxFixture.length,
      uploadedAt: Date.now(),
      buffer: xlsxFixture,
      extraction,
      category: "Evidence",
      categorySource: "rule",
    });
    check((await readStoredDocument(owner, documentId))?.category === "Evidence", "auto-sorted category persists");
    check(await readStoredDocument(otherOwner, documentId) === null, "document metadata remains owner-scoped");

    const recategorized = await updateStoredDocumentCategory(owner, documentId, "Contracts", "manual");
    check(recategorized?.category === "Contracts" && recategorized.categorySource === "manual", "manual folder override persists");
    const linked = await updateStoredDocumentCase(owner, documentId, caseId);
    check(linked?.caseId === caseId, "document can be linked to a case after chat handoff");
    const listed = await listStoredDocumentsForCase(owner, caseId);
    check(listed.length === 1 && listed[0].category === "Contracts", "refresh listing retains case link and folder");
    const annotation = {
      id: "annotation-0001",
      documentId,
      selectedText: "Legal notice invoice",
      comment: "Controlled QA annotation",
      createdAt: Date.now(),
    };
    await addStoredDocumentAnnotation(owner, documentId, annotation);
    await addStoredDocumentAnnotation(owner, documentId, annotation);
    const annotated = await readStoredDocument(owner, documentId);
    check(annotated?.annotations.length === 1 && annotated.annotations[0].comment === annotation.comment, "document annotations persist idempotently");
    check(await addStoredDocumentAnnotation(otherOwner, documentId, annotation) === null, "document annotations remain owner-scoped");
    check(await deleteStoredDocument(owner, documentId), "test document is deleted cleanly");

    process.stdout.write(`Case workspace document tests passed: ${passed}/15\n`);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

void run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Case workspace document test failed"}\n`);
  process.exitCode = 1;
});
