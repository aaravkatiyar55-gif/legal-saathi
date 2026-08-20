import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

type StoredDocumentInput = {
  id: string;
  caseId?: string;
  name: string;
  mimeType?: string;
  size: number;
  uploadedAt: number;
  buffer: Buffer;
  extractedText?: string;
};

type StoredQuestionInput = {
  id: string;
  caseId: string;
  documentId?: string;
  scope: "document" | "case";
  text: string;
  createdAt: number;
  sourceDocumentIds: string[];
  retrievedDocumentIds: string[];
};

const storageRoot = () => process.env.LEGAL_SATHI_STORAGE_DIR ?? path.join(process.cwd(), ".legal-sathi-data");

const getSafeExtension = (fileName: string) => {
  const extension = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
};

const writeJson = async (filePath: string, payload: unknown) => {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(temporaryPath, filePath);
};

const ensureDirectories = async () => {
  const root = storageRoot();
  await Promise.all([
    fs.mkdir(path.join(root, "documents"), { recursive: true }),
    fs.mkdir(path.join(root, "metadata"), { recursive: true }),
    fs.mkdir(path.join(root, "questions"), { recursive: true })
  ]);
  return root;
};

export const storeDocumentAsset = async (input: StoredDocumentInput) => {
  const root = await ensureDirectories();
  const extension = getSafeExtension(input.name);
  const serverStorageKey = path.posix.join("documents", `${input.id}${extension}`);
  const assetPath = path.join(root, "documents", `${input.id}${extension}`);
  const metadataPath = path.join(root, "metadata", `${input.id}.json`);

  await fs.writeFile(assetPath, input.buffer);
  await writeJson(metadataPath, {
    id: input.id,
    caseId: input.caseId,
    name: input.name,
    mimeType: input.mimeType,
    size: input.size,
    uploadedAt: input.uploadedAt,
    serverStorageKey,
    extractedText: input.extractedText,
    storedAt: Date.now()
  });

  return serverStorageKey;
};

export const storeQuestionRecord = async (input: StoredQuestionInput) => {
  const root = await ensureDirectories();
  await writeJson(path.join(root, "questions", `${input.id}.json`), input);
};
