import PublicPolicyPage from "@/components/PublicPolicyPage";
import { termsSections } from "@/lib/policyContent";
export default function TermsPage() { return <PublicPolicyPage title="Terms of Use" summary="Rules for using Legal Saathi lawfully and understanding the limits of AI-assisted legal preparation." sections={termsSections} />; }
