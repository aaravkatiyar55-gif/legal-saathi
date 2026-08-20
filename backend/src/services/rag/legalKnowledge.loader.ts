import fs from "fs/promises";
import path from "path";
import { createHash } from "node:crypto";
import { LoadedKnowledgeDocument } from "./rag.types";

const knowledgeDirectory = path.resolve(__dirname, "../../../legal-knowledge");

function slugFromFilename(filePath: string) {
  return path.basename(filePath, path.extname(filePath)).toLowerCase();
}

function titleFromMarkdown(content: string, fallback: string) {
  const heading = content.split(/\r?\n/).find((line) => line.trim().startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : fallback;
}

function topicFromMarkdown(content: string) {
  const match = content.match(/^topic:\s*(.+)$/im);
  return match?.[1]?.trim();
}

const curatedSources: Record<string, {
  sourceUrl?: string;
  issuingAuthority: string;
  jurisdiction: string;
  documentType: string;
  citationLabel: string;
  trustTier: 1 | 2 | 3;
}> = {
  "cyber-complaint-basics-india": { sourceUrl: "https://cybercrime.gov.in/", issuingAuthority: "Ministry of Home Affairs", jurisdiction: "India", documentType: "curated_official_guidance", citationLabel: "National Cyber Crime Reporting Portal", trustTier: 2 },
  "consumer-rights-basics-india": { sourceUrl: "https://consumerhelpline.gov.in/", issuingAuthority: "Department of Consumer Affairs", jurisdiction: "India", documentType: "curated_official_guidance", citationLabel: "National Consumer Helpline", trustTier: 2 },
  "fir-basics-india": { sourceUrl: "https://www.indiacode.nic.in/", issuingAuthority: "Legislative Department", jurisdiction: "India", documentType: "curated_statutory_overview", citationLabel: "India Code", trustTier: 2 },
  "rental-agreement-basics-india": { sourceUrl: "https://legislative.gov.in/", issuingAuthority: "Legislative Department", jurisdiction: "India; state law may vary", documentType: "curated_legal_overview", citationLabel: "Legislative Department", trustTier: 2 },
  "cheque-bounce-basics-india": { sourceUrl: "https://www.indiacode.nic.in/", issuingAuthority: "Legislative Department", jurisdiction: "India", documentType: "curated_statutory_overview", citationLabel: "India Code", trustTier: 2 },
  "workplace-rights-basics-india": { sourceUrl: "https://labour.gov.in/", issuingAuthority: "Ministry of Labour and Employment", jurisdiction: "India; state law may vary", documentType: "curated_official_guidance", citationLabel: "Ministry of Labour and Employment", trustTier: 2 },
  disclaimer: { issuingAuthority: "Legal Saathi", jurisdiction: "India", documentType: "internal_policy", citationLabel: "Legal Saathi legal information disclaimer", trustTier: 3 },
};

function allowedSourceUrl(value: string | undefined) {
  if (!value) return true;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.protocol === "https:" && (
      host.endsWith(".gov.in") ||
      host.endsWith(".nic.in") ||
      host === "indiacode.nic.in" ||
      host === "rbi.org.in" ||
      host === "sebi.gov.in"
    );
  } catch {
    return false;
  }
}

export async function loadLegalKnowledgeDocuments(): Promise<LoadedKnowledgeDocument[]> {
  const files = await fs.readdir(knowledgeDirectory);
  const markdownFiles = files.filter((file) => file.toLowerCase().endsWith(".md")).sort();

  const documents: LoadedKnowledgeDocument[] = [];
  for (const file of markdownFiles) {
    const absolutePath = path.join(knowledgeDirectory, file);
    const content = await fs.readFile(absolutePath, "utf8");
    const id = slugFromFilename(file);
    const source = curatedSources[id];
    if (!source || !allowedSourceUrl(source.sourceUrl)) continue;
    const checksum = createHash("sha256").update(content, "utf8").digest("hex");
    documents.push({
      id,
      title: titleFromMarkdown(content, id),
      topic: topicFromMarkdown(content),
      path: absolutePath,
      content,
      metadata: {
        ...source,
        retrievalDate: new Date().toISOString(),
        language: "en",
        checksum,
        version: checksum.slice(0, 16),
        superseded: false,
      },
    });
  }

  return documents;
}
