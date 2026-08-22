import PublicPolicyPage from "@/components/PublicPolicyPage";
import { exportSections } from "@/lib/policyContent";
export default function ExportPage() { return <PublicPolicyPage title="Data Export Request" summary="Download an owner-scoped JSON export after signing in." sections={exportSections} dataRightsAction="export" />; }
