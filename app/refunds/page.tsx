import PublicPolicyPage from "@/components/PublicPolicyPage";
import { refundSections } from "@/lib/policyContent";
export default function RefundPage() { return <PublicPolicyPage title="Refund and Cancellation Policy" summary="How cancelled, failed, verified, refunded, and disputed payments affect access and units." sections={refundSections} />; }
