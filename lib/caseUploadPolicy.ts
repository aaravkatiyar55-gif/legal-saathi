export const CASE_UPLOAD_EXTENSIONS = [
  "pdf",
  "docx",
  "doc",
  "xlsx",
  "xls",
  "txt",
  "md",
  "csv",
  "json",
  "rtf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "mp4",
  "m4v",
  "mov",
  "webm",
  "avi",
  "mpeg",
  "mpg",
] as const;

export const CASE_UPLOAD_ACCEPT = CASE_UPLOAD_EXTENSIONS
  .map((extension) => `.${extension}`)
  .join(",");

export function supportsCaseUploadName(fileName: string) {
  const extension = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return Boolean(extension && CASE_UPLOAD_EXTENSIONS.includes(extension as (typeof CASE_UPLOAD_EXTENSIONS)[number]));
}
