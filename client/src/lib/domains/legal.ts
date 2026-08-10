import { CalendarClock, Phone, Scale, Users } from "lucide-react";
import type { DomainPack } from "./types";
import { genericCreationSteps } from "./shared";

export const legalPack: DomainPack = {
  id: "legal",
  name: "Legal",
  platformName: "AI Legal Client Services Platform",
  tagline: "For law firms and legal practices",
  icon: Scale,
  aiEmployeeRoleName: "AI Intake Assistant",
  aiEmployeeNamePlaceholder: "ATLAS",

  onboardingIntro: {
    title: "Let's set up your AI Intake Assistant.",
    description: "A short set of questions about your practice areas and how consultations work.",
  },

  onboardingSections: [
    {
      id: "business",
      title: "Your practice",
      progressLabel: "Practice",
      questions: [
        {
          id: "practice_area",
          sectionId: "business",
          type: "multi_select",
          title: "Which practice areas do you cover?",
          required: true,
          options: [
            { id: "family", label: "Family law" },
            { id: "personal_injury", label: "Personal injury" },
            { id: "corporate", label: "Corporate" },
            { id: "real_estate", label: "Real estate" },
            { id: "immigration", label: "Immigration" },
            { id: "criminal", label: "Criminal defense" },
          ],
        },
        {
          id: "office_count",
          sectionId: "business",
          type: "number",
          title: "How many offices do you operate?",
          placeholder: "1",
          required: true,
        },
        {
          id: "consultation_method",
          sectionId: "business",
          type: "single_select",
          title: "How are initial consultations usually held?",
          required: true,
          options: [
            { id: "in_person", label: "In person" },
            { id: "video", label: "Video" },
            { id: "phone", label: "Phone" },
            { id: "any", label: "Any of the above" },
          ],
        },
      ],
    },
    {
      id: "ai_employee",
      title: "Your AI Intake Assistant",
      progressLabel: "AI Intake Assistant",
      questions: [
        {
          id: "ai_name",
          sectionId: "ai_employee",
          type: "text",
          title: "What should your AI Employee be called?",
          placeholder: "ATLAS",
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
            { id: "urgent_matters", label: "Urgent legal matters" },
            { id: "existing_clients", label: "Existing client case questions" },
            { id: "explicit_request", label: "Caller explicitly asks for an attorney" },
          ],
        },
      ],
    },
  ],

  navLabels: {},

  quickActions: [
    {
      id: "review_conversations",
      label: "Review recent intake calls",
      description: "See what your AI Intake Assistant handled today.",
      icon: Phone,
      href: "/conversations",
    },
    {
      id: "connect_calendar",
      label: "Connect your calendar",
      description: "Keep consultation availability in sync.",
      icon: CalendarClock,
      href: "/build/tools",
    },
  ],

  suggestedIntegrations: [
    { id: "practice_mgmt", name: "Practice management system", description: "Matters and scheduling" },
  ],

  dashboard: {
    primaryMetrics: [
      { id: "consultations", label: "Consultations today", icon: CalendarClock, format: "count", value: 11 },
      { id: "new_intakes", label: "New intakes", icon: Users, format: "count", value: 8 },
      { id: "resolution_rate", label: "AI resolution rate", icon: Scale, format: "percent", value: 0.8, tone: "ai" },
      { id: "escalations", label: "Human escalations", icon: Phone, format: "count", value: 3, tone: "warning" },
    ],
    activityTemplates: [
      { id: "act_fees", headline: "Prospective client asked about consultation fees", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
      { id: "act_intake", headline: "New intake started — personal injury", outcomeLabel: "Request created", outcomeTone: "info" },
      { id: "act_urgent", headline: "Caller described an urgent legal matter", outcomeLabel: "Escalated to duty attorney", outcomeTone: "warning" },
      { id: "act_reschedule", headline: "Client asked to reschedule a consultation", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
    ],
    attentionItems: [
      {
        id: "att_urgent",
        title: "Urgent matter reported",
        detail: "A caller described a time-sensitive filing deadline — escalated to the duty attorney.",
        severity: "high",
      },
    ],
    insights: [
      "Consultation-fee questions are the most common unresolved query this month.",
      "Immigration enquiries have risen sharply this quarter.",
    ],
  },

  creationSteps: genericCreationSteps("AI Intake Assistant"),
};
