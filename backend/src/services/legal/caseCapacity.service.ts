export class CaseFolderLimitError extends Error {
  readonly code = "CASE_FOLDER_LIMIT_REACHED";
  readonly activeCount: number;
  readonly limit: number;

  constructor(activeCount: number, limit: number) {
    super("Case-folder limit reached");
    this.name = "CaseFolderLimitError";
    this.activeCount = activeCount;
    this.limit = limit;
  }
}

export function assertCaseFolderCapacity(activeCount: number, limit: number) {
  const safeLimit = Math.max(0, Math.floor(limit));
  if (activeCount >= safeLimit) {
    throw new CaseFolderLimitError(activeCount, safeLimit);
  }
}
