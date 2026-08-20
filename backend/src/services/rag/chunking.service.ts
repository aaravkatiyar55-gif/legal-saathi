import { LoadedKnowledgeDocument, RagChunk } from "./rag.types";

const defaultChunkSize = 1000;
const defaultOverlap = 150;

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function chunkKnowledgeDocument(
  document: LoadedKnowledgeDocument,
  options: { chunkSize?: number; overlap?: number } = {},
): RagChunk[] {
  const chunkSize = options.chunkSize ?? defaultChunkSize;
  const overlap = options.overlap ?? defaultOverlap;
  const chunks: RagChunk[] = [];
  let chunkIndex = 0;
  const sections: Array<{ heading: string; text: string }> = [];
  let heading = document.title;
  let body: string[] = [];
  const flush = () => {
    const text = normalizeWhitespace(body.join("\n"));
    if (text) sections.push({ heading, text });
    body = [];
  };
  for (const line of document.content.replace(/\r\n/g, "\n").split("\n")) {
    const match = line.match(/^#{1,4}\s+(.+)$/);
    if (match) {
      flush();
      heading = match[1].trim().slice(0, 200);
    } else {
      body.push(line);
    }
  }
  flush();

  for (const section of sections) {
    let start = 0;
    while (start < section.text.length) {
      const maxEnd = Math.min(start + chunkSize, section.text.length);
      let end = maxEnd;
      if (maxEnd < section.text.length) {
        const sentenceBreak = section.text.lastIndexOf(". ", maxEnd);
        const paragraphBreak = section.text.lastIndexOf("\n\n", maxEnd);
        const naturalBreak = Math.max(sentenceBreak, paragraphBreak);
        if (naturalBreak > start + Math.floor(chunkSize * 0.55)) end = naturalBreak + 1;
      }
      const chunkText = section.text.slice(start, end).trim();
      if (chunkText) {
        chunks.push({
          id: `${document.id}:${document.metadata.version}:${chunkIndex}`,
          text: chunkText,
          metadata: {
            ...document.metadata,
            scope: "global",
            sourceId: document.id,
            sourceTitle: document.title,
            sourcePath: document.path,
            topic: document.topic,
            chunkIndex,
            heading: section.heading,
          },
        });
        chunkIndex++;
      }
      if (end >= section.text.length) break;
      start = Math.max(0, end - overlap);
    }
  }

  return chunks;
}
