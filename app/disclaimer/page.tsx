import PublicPolicyPage from "@/components/PublicPolicyPage";
import { disclaimerSections } from "@/lib/policyContent";
export default function DisclaimerPage() { return <PublicPolicyPage title="Legal Information Disclaimer" summary="Legal Saathi is an information and preparation tool, not a substitute for a licensed advocate." sections={disclaimerSections} />; }
