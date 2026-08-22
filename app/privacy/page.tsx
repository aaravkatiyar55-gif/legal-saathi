import PublicPolicyPage from "@/components/PublicPolicyPage";
import { privacySections } from "@/lib/policyContent";
export default function PrivacyPage() { return <PublicPolicyPage title="Privacy Notice" summary="How Legal Saathi handles account, case, document, AI, usage, and payment information." sections={privacySections} />; }
