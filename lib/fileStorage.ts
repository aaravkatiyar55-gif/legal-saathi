import type { DocumentPreviewKind } from "@/lib/types";

const DB_NAME = "legalSathi_file_store";
const DB_VERSION = 1;
const STORE_NAME = "document_files";

export type StoredDocumentFile = {
  storageKey: string;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  updatedAt: number;
};

const getExtension = (name: string) => {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
};

const openFileDatabase = () => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "storageKey" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the file store."));
  });
};

export const makeDocumentStorageKey = (documentId: string) => `document-file:${documentId}`;

export const getPreviewKind = (file: Pick<File, "name" | "type">): DocumentPreviewKind => {
  const mimeType = file.type.toLowerCase();
  const extension = getExtension(file.name);

  if (mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(extension)) {
    return "image";
  }

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (
    mimeType.startsWith("text/") ||
    ["txt", "md", "markdown", "csv", "json", "xml", "html", "log"].includes(extension) ||
    ["application/json", "application/xml"].includes(mimeType)
  ) {
    return "text";
  }

  if (
    ["doc", "docx", "odt"].includes(extension) ||
    [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.oasis.opendocument.text"
    ].includes(mimeType)
  ) {
    return "office";
  }

  if (
    ["xls", "xlsx", "ods"].includes(extension) ||
    [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.oasis.opendocument.spreadsheet"
    ].includes(mimeType)
  ) {
    return "spreadsheet";
  }

  if (mimeType.startsWith("video/") || ["mp4", "m4v", "mov", "webm", "avi", "mpeg", "mpg"].includes(extension)) {
    return "video";
  }

  return "unknown";
};

export const readTextIfSupported = async (file: File, previewKind: DocumentPreviewKind) => {
  if (previewKind !== "text") return undefined;

  try {
    return await file.text();
  } catch {
    return undefined;
  }
};

export const storeDocumentFile = async (storageKey: string, file: File) => {
  const database = await openFileDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const record: StoredDocumentFile = {
      storageKey,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      blob: file,
      updatedAt: Date.now()
    };

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Unable to store the document file."));
    };

    store.put(record);
  });
};

export const loadDocumentFile = async (storageKey?: string) => {
  if (!storageKey) return null;

  const database = await openFileDatabase();

  return new Promise<StoredDocumentFile | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(storageKey);
    let result: StoredDocumentFile | null = null;

    request.onsuccess = () => {
      result = (request.result as StoredDocumentFile | undefined) ?? null;
    };

    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Unable to load the document file."));
    };
  });
};

export const deleteDocumentFile = async (storageKey?: string) => {
  if (!storageKey) return;

  const database = await openFileDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Unable to delete the document file."));
    };

    store.delete(storageKey);
  });
};
