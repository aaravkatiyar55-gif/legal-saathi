import type { Metadata } from "next";
import PublicDemoGuide from "@/components/PublicDemoGuide";
import { isAppLanguage } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "How Legal Saathi works",
  description: "A first-use guide to Legal Saathi's legal-information boundaries, languages, and safer next steps.",
};

export default async function HowItWorksPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const { lang } = await searchParams;
  const requestedLanguage = Array.isArray(lang) ? lang[0] : lang;
  const initialLanguage = isAppLanguage(requestedLanguage) ? requestedLanguage : "en";

  return <PublicDemoGuide initialLanguage={initialLanguage} />;
}
