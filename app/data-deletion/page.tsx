import PublicPolicyPage from "@/components/PublicPolicyPage";
import { deletionSections } from "@/lib/policyContent";
export default function DeletionPage() { return <PublicPolicyPage title="Account Deletion Request" summary="Submit a verified request for deletion or anonymization review." sections={deletionSections} dataRightsAction="deletion" />; }
