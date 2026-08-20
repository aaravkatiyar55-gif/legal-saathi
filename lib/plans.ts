export type FrontendPlanId = "free" | "plus" | "pro" | "advocate";

export type FrontendPlan = {
  id: FrontendPlanId;
  title: string;
  price: string;
  billingCycle: "monthly" | "one_time";
  description: string;
  cta: string;
  features: string[];
};

export type PaidFrontendPlan = Omit<FrontendPlan, "id"> & {
  id: Exclude<FrontendPlanId, "free">;
};

export const frontendPlans: Record<FrontendPlanId, FrontendPlan> = {
  free: {
    id: "free",
    title: "Free",
    price: "₹0/month",
    billingCycle: "monthly",
    description: "For trying Legal Saathi responsibly.",
    cta: "Start free",
    features: ["1 case folder / 30 days", "10 AI chats / 24h", "Basic legal preparation", "Evidence checklist preview", "Advanced tools locked"],
  },
  plus: {
    id: "plus",
    title: "Plus",
    price: "₹499/month",
    billingCycle: "monthly",
    description: "More preparation room for active matters.",
    cta: "Choose Plus",
    features: ["2 case folders / 7 days", "30 AI chats / 24h", "Opponent arguments", "Weak points plan", "Higher preparation limits"],
  },
  pro: {
    id: "pro",
    title: "Pro",
    price: "₹999/month",
    billingCycle: "monthly",
    description: "Deeper preparation before advocate meetings.",
    cta: "Choose Pro",
    features: ["4 case folders / 7 days", "50 AI chats / 2h", "Advanced AI tools", "Lawyer brief planning", "Export and print tools"],
  },
  advocate: {
    id: "advocate",
    title: "Advocate Prep",
    price: "Starting ₹3,999/case",
    billingCycle: "one_time",
    description: "Future human-assisted preparation support.",
    cta: "Request Advocate Prep",
    features: ["10 case folders / 7 days", "100 AI chats / 1h", "Human-assisted support planned", "Custom team pricing", "Business admin options planned"],
  },
};

export const paidFrontendPlans: PaidFrontendPlan[] = [
  frontendPlans.plus as PaidFrontendPlan,
  frontendPlans.pro as PaidFrontendPlan,
  frontendPlans.advocate as PaidFrontendPlan,
];
