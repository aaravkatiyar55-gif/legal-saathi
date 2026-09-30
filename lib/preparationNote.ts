export interface PreparationNote {
  timeline: string;
  records: string;
  question: string;
}

export const EMPTY_PREPARATION_NOTE: PreparationNote = { timeline: "", records: "", question: "" };

export function hasPreparationNote(note: PreparationNote): boolean {
  return Object.values(note).some((value) => value.trim().length > 0);
}

export function formatPreparationNote(note: PreparationNote, labels: {
  title: string; timeline: string; records: string; question: string; boundary: string;
}): string {
  return [labels.title, "", ...(["timeline", "records", "question"] as const).flatMap((key) =>
    note[key].trim() ? [labels[key], note[key].trim(), ""] : []), labels.boundary, ""].join("\n");
}
