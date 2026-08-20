export function autoResizeTextarea(textarea: HTMLTextAreaElement | null, maxHeight: number) {
  if (!textarea) return;

  textarea.style.height = "auto";

  const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}
