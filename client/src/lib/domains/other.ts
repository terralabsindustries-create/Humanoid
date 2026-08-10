import { Building2, MessagesSquare, Phone, Users } from "lucide-react";
import type { DomainPack } from "./types";
import { genericCreationSteps } from "./shared";

/**
 * The fallback pack for any business that doesn't fit the named verticals.
 * Deliberately industry-neutral — the base lexicon rather than a guessed
 * substitute, per the same principle that governs `BASE_LEXICON` itself.
 */
export const otherPack: DomainPack = {
  id: "other",
  name: "Other",
  platformName: "AI Customer Care Platform",
  tagline: "For businesses outside the categories above",
  icon: Building2,
  aiEmployeeRoleName: "AI Assistant",
  aiEmployeeNamePlaceholder: "ECHO",

  onboardingIntro: {
    title: "Let's set up your AI Assistant.",
    description: "A short set of questions about your business and how customers reach you.",
  },

  onboardingSections: [
    {
      id: "business",
      title: "Your business",
      progressLabel: "Business",
      questions: [
        {
          id: "business_type",
          sectionId: "business",
          type: "text",
          title: "What kind of business do you run?",
          placeholder: "A brief description",
          required: true,
        },
        {
          id: "location_count",
          sectionId: "business",
          type: "number",
          title: "How many locations do you operate?",
          placeholder: "1",
          required: true,
        },
        {
          id: "primary_contact_method",
          sectionId: "business",
          type: "single_select",
          title: "How do customers usually reach you?",
          required: true,
          options: [
            { id: "phone", label: "Phone" },
            { id: "email", label: "Email" },
            { id: "web_chat", label: "Web chat" },
            { id: "multiple", label: "A mix of channels" },
          ],
        },
        {
          id: "common_requests",
          sectionId: "business",
          type: "textarea",
          title: "What do customers usually contact you about?",
          placeholder: "Booking, order status, general questions…",
          required: true,
        },
      ],
    },
    {
      id: "ai_employee",
      title: "Your AI Assistant",
      progressLabel: "AI Assistant",
      questions: [
        {
          id: "ai_name",
          sectionId: "ai_employee",
          type: "text",
          title: "What should your AI Employee be called?",
          placeholder: "ECHO",
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
            { id: "friendly_casual", label: "Friendly & Casual" },
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
            { id: "complaints", label: "Complaints" },
            { id: "billing", label: "Billing disputes" },
            { id: "explicit_request", label: "Customer explicitly asks for staff" },
          ],
        },
      ],
    },
  ],

  navLabels: {},

  quickActions: [
    {
      id: "review_conversations",
      label: "Review recent conversations",
      description: "See what your AI Assistant handled today.",
      icon: Phone,
      href: "/conversations",
    },
  ],

  suggestedIntegrations: [],

  dashboard: {
    primaryMetrics: [
      { id: "conversations", label: "Conversations today", icon: MessagesSquare, format: "count", value: 19 },
      { id: "new_enquiries", label: "New enquiries", icon: Users, format: "count", value: 12 },
      { id: "resolution_rate", label: "AI resolution rate", icon: Building2, format: "percent", value: 0.82, tone: "ai" },
      { id: "escalations", label: "Human escalations", icon: Phone, format: "count", value: 3, tone: "warning" },
    ],
    activityTemplates: [
      { id: "act_general", headline: "Customer asked a general question", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
      { id: "act_enquiry", headline: "New enquiry received", outcomeLabel: "Request created", outcomeTone: "info" },
      { id: "act_person", headline: "Customer requested to speak with a person", outcomeLabel: "Escalated to staff", outcomeTone: "human" },
      { id: "act_hours", headline: "Customer asked about business hours", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
    ],
    attentionItems: [],
    insights: [
      "Most unresolved questions this week were about business hours and pricing.",
    ],
  },

  creationSteps: genericCreationSteps("AI Assistant"),
};
