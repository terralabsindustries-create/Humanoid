import { FileText, Phone, ShieldCheck, Users } from "lucide-react";
import type { DomainPack } from "./types";
import { genericCreationSteps } from "./shared";

export const insurancePack: DomainPack = {
  id: "insurance",
  name: "Insurance",
  platformName: "AI Insurance Customer Care Platform",
  tagline: "For brokers, agencies and claims teams",
  icon: ShieldCheck,
  aiEmployeeRoleName: "AI Claims Assistant",
  aiEmployeeNamePlaceholder: "IRIS",

  onboardingIntro: {
    title: "Let's set up your AI Claims Assistant.",
    description: "A short set of questions about your policies and how claims come in.",
  },

  onboardingSections: [
    {
      id: "business",
      title: "Your business",
      progressLabel: "Business",
      questions: [
        {
          id: "insurance_type",
          sectionId: "business",
          type: "multi_select",
          title: "Which lines of insurance do you handle?",
          required: true,
          options: [
            { id: "auto", label: "Auto" },
            { id: "home", label: "Home" },
            { id: "life", label: "Life" },
            { id: "health", label: "Health" },
            { id: "commercial", label: "Commercial" },
          ],
        },
        {
          id: "branch_count",
          sectionId: "business",
          type: "number",
          title: "How many branches do you operate?",
          placeholder: "1",
          required: true,
        },
        {
          id: "claim_intake_method",
          sectionId: "business",
          type: "single_select",
          title: "How are claims usually reported?",
          required: true,
          options: [
            { id: "online_portal", label: "Online portal" },
            { id: "phone_only", label: "Phone only" },
            { id: "both", label: "Both" },
          ],
        },
      ],
    },
    {
      id: "ai_employee",
      title: "Your AI Claims Assistant",
      progressLabel: "AI Claims Assistant",
      questions: [
        {
          id: "ai_name",
          sectionId: "ai_employee",
          type: "text",
          title: "What should your AI Employee be called?",
          placeholder: "IRIS",
          required: true,
          emphasis: true,
        },
        {
          id: "communication_style",
          sectionId: "ai_employee",
          type: "choice_cards",
          title: "Preferred communication style",
          required: true,
          options: [
            { id: "warm_professional", label: "Warm & Professional" },
            { id: "concise_efficient", label: "Concise & Efficient" },
            { id: "custom", label: "Custom" },
          ],
        },
        {
          id: "escalation_triggers",
          sectionId: "ai_employee",
          type: "multi_select",
          title: "When should Humanoid escalate to a human?",
          required: true,
          options: [
            { id: "claim_disputes", label: "Claim disputes" },
            { id: "high_value_claims", label: "High-value claims" },
            { id: "explicit_request", label: "Policyholder explicitly asks for an agent" },
          ],
        },
      ],
    },
  ],

  navLabels: {},

  quickActions: [
    {
      id: "review_conversations",
      label: "Review recent policyholder calls",
      description: "See what your AI Claims Assistant handled today.",
      icon: Phone,
      href: "/conversations",
    },
    {
      id: "connect_claims_system",
      label: "Connect your claims system",
      description: "Keep policy and claim status in sync.",
      icon: FileText,
      href: "/build/tools",
    },
  ],

  suggestedIntegrations: [
    { id: "claims_system", name: "Claims management system", description: "Policy and claim status" },
  ],

  dashboard: {
    primaryMetrics: [
      { id: "claims_filed", label: "Claims filed today", icon: FileText, format: "count", value: 7 },
      { id: "quote_requests", label: "New quote requests", icon: Users, format: "count", value: 15 },
      { id: "resolution_rate", label: "AI resolution rate", icon: ShieldCheck, format: "percent", value: 0.77, tone: "ai" },
      { id: "escalations", label: "Human escalations", icon: Phone, format: "count", value: 6, tone: "warning" },
    ],
    activityTemplates: [
      { id: "act_coverage", headline: "Policyholder asked about coverage limits", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
      { id: "act_collision", headline: "New claim reported — vehicle collision", outcomeLabel: "Request created", outcomeTone: "info" },
      { id: "act_dispute", headline: "Policyholder disputed a claim decision", outcomeLabel: "Escalated to adjuster", outcomeTone: "warning" },
      { id: "act_quote", headline: "Quote requested for a home policy", outcomeLabel: "Request created", outcomeTone: "info" },
    ],
    attentionItems: [
      {
        id: "att_dispute",
        title: "Claim dispute needs a person",
        detail: "A policyholder disputed a partial-loss valuation — escalated to the assigned adjuster.",
        severity: "high",
      },
    ],
    insights: [
      "Coverage-limit questions are the most common unresolved query this month.",
      "Home quote requests are up ahead of the renewal season.",
    ],
  },

  creationSteps: genericCreationSteps("AI Claims Assistant"),
};
