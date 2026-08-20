import "server-only";

export type RetrievalDocument = {
  id: string;
  name: string;
  extractedText?: string;
};

export type RetrievalResult = {
  documentId: string;
  score: number;
};

const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "that", "the", "to", "with"
]);

const tokenize = (value: string) => value
  .toLowerCase()
  .match(/[a-z0-9]{2,}/g)
  ?.filter(token => !stopWords.has(token)) ?? [];

const countMatches = (queryTokens: string[], sourceTokens: string[]) => {
  const source = new Set(sourceTokens);
  return queryTokens.reduce((total, token) => total + (source.has(token) ? 1 : 0), 0);
};

export const retrieveRelevantDocuments = (query: string, documents: RetrievalDocument[]) => {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  return documents
    .map(document => {
      const nameMatches = countMatches(queryTokens, tokenize(document.name));
      const textMatches = countMatches(queryTokens, tokenize(document.extractedText ?? ""));
      return { documentId: document.id, score: nameMatches * 4 + textMatches };
    })
    .filter(result => result.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, 8);
};
