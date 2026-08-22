import PublicPolicyPage from "@/components/PublicPolicyPage";
import { supportSections } from "@/lib/policyContent";
export default function SupportPage() { return <PublicPolicyPage title="Support" summary="Safe ways to request technical help without sharing confidential legal or account information." sections={supportSections} />; }
