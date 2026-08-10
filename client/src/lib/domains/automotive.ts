import { Car, Phone, Users, Wrench } from "lucide-react";
import type { DomainPack } from "./types";
import { genericCreationSteps } from "./shared";

export const automotivePack: DomainPack = {
  id: "automotive",
  name: "Automotive service",
  platformName: "AI Automotive Service Platform",
  tagline: "For dealership service centres and independent garages",
  icon: Car,
  aiEmployeeRoleName: "AI Service Advisor",
  aiEmployeeNamePlaceholder: "TORQUE",

  onboardingIntro: {
    title: "Let's set up your AI Service Advisor.",
    description: "A short set of questions about your service centre and how bookings work.",
  },

  onboardingSections: [
    {
      id: "business",
      title: "Your business",
      progressLabel: "Business",
      questions: [
        {
          id: "service_type",
          sectionId: "business",
          type: "choice_cards",
          title: "What type of service centre do you run?",
          required: true,
          options: [
            { id: "dealership", label: "Dealership service" },
            { id: "independent", label: "Independent garage" },
            { id: "tyre_exhaust", label: "Tyre & exhaust centre" },
            { id: "body_shop", label: "Body shop" },
            { id: "other", label: "Other" },
          ],
        },
        {
          id: "bay_count",
          sectionId: "business",
          type: "number",
          title: "How many service bays do you have?",
          placeholder: "6",
          required: true,
        },
        {
          id: "branch_count",
          sectionId: "business",
          type: "number",
          title: "How many locations do you operate?",
          placeholder: "1",
          required: true,
        },
        {
          id: "booking_method",
          sectionId: "business",
          type: "single_select",
          title: "How do customers book a service?",
          required: true,
          options: [
            { id: "online", label: "Online booking system" },
            { id: "phone_only", label: "Phone only" },
            { id: "both", label: "Both" },
          ],
        },
      ],
    },
    {
      id: "ai_employee",
      title: "Your AI Service Advisor",
      progressLabel: "AI Service Advisor",
      questions: [
        {
          id: "ai_name",
          sectionId: "ai_employee",
          type: "text",
          title: "What should your AI Employee be called?",
          placeholder: "TORQUE",
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
            { id: "friendly_efficient", label: "Friendly & Efficient" },
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
            { id: "invoice_disputes", label: "Invoice disputes" },
            { id: "complex_diagnosis", label: "Complex diagnosis questions" },
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
      label: "Review recent customer calls",
      description: "See what your AI Service Advisor handled today.",
      icon: Phone,
      href: "/conversations",
    },
    {
      id: "connect_booking",
      label: "Connect your booking system",
      description: "Keep bay availability in sync.",
      icon: Wrench,
      href: "/build/tools",
    },
  ],

  suggestedIntegrations: [
    { id: "booking_system", name: "Service booking system", description: "Live bay availability" },
  ],

  dashboard: {
    primaryMetrics: [
      { id: "bookings", label: "Today's bookings", icon: Wrench, format: "count", value: 22 },
      { id: "quote_requests", label: "Quote requests", icon: Users, format: "count", value: 13 },
      { id: "resolution_rate", label: "AI resolution rate", icon: Car, format: "percent", value: 0.81, tone: "ai" },
      { id: "escalations", label: "Human escalations", icon: Phone, format: "count", value: 4, tone: "warning" },
    ],
    activityTemplates: [
      { id: "act_mot", headline: "Customer asked for an MOT price", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
      { id: "act_brakes", headline: "Booking requested for brake inspection", outcomeLabel: "Request created", outcomeTone: "info" },
      { id: "act_dispute", headline: "Customer disputed an invoice", outcomeLabel: "Escalated to service manager", outcomeTone: "warning" },
      { id: "act_courtesy", headline: "Customer asked about courtesy car availability", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
    ],
    attentionItems: [
      {
        id: "att_dispute",
        title: "Invoice dispute needs a person",
        detail: "A customer queried a labour charge on today's invoice — escalated to the service manager.",
        severity: "medium",
      },
    ],
    insights: [
      "MOT price questions are the most common unresolved query this month.",
      "Courtesy car requests are up ahead of the school holidays.",
    ],
  },

  creationSteps: genericCreationSteps("AI Service Advisor"),
};
