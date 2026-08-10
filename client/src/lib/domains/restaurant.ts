import { CalendarClock, Phone, UtensilsCrossed, Users } from "lucide-react";
import type { DomainPack } from "./types";
import { genericCreationSteps } from "./shared";

export const restaurantPack: DomainPack = {
  id: "restaurant",
  name: "Restaurants",
  platformName: "AI Restaurant Guest Operations Platform",
  tagline: "For restaurants, bars and dining groups",
  icon: UtensilsCrossed,
  aiEmployeeRoleName: "AI Host",
  aiEmployeeNamePlaceholder: "REMY",

  onboardingIntro: {
    title: "Let's set up your AI Host.",
    description: "A short set of questions about your restaurant and how guests book.",
  },

  onboardingSections: [
    {
      id: "restaurant",
      title: "Your restaurant",
      progressLabel: "Restaurant",
      questions: [
        {
          id: "cuisine_type",
          sectionId: "restaurant",
          type: "text",
          title: "What type of cuisine do you serve?",
          placeholder: "Italian, seasonal small plates, etc.",
          required: true,
        },
        {
          id: "seating_capacity",
          sectionId: "restaurant",
          type: "number",
          title: "Approximately how many covers do you seat?",
          placeholder: "80",
          required: true,
        },
        {
          id: "location_count",
          sectionId: "restaurant",
          type: "number",
          title: "How many locations do you operate?",
          placeholder: "1",
          required: true,
        },
        {
          id: "reservation_platform",
          sectionId: "restaurant",
          type: "single_select",
          title: "How do guests book a table?",
          required: true,
          options: [
            { id: "opentable", label: "OpenTable" },
            { id: "resy", label: "Resy" },
            { id: "phone_only", label: "Phone only" },
            { id: "other", label: "Other" },
          ],
        },
        {
          id: "dietary_accommodations",
          sectionId: "restaurant",
          type: "multi_select",
          title: "Which dietary needs do you accommodate?",
          options: [
            { id: "vegetarian", label: "Vegetarian" },
            { id: "vegan", label: "Vegan" },
            { id: "gluten_free", label: "Gluten-free" },
            { id: "halal", label: "Halal" },
            { id: "kosher", label: "Kosher" },
            { id: "nut_allergies", label: "Nut allergies" },
          ],
        },
      ],
    },
    {
      id: "ai_employee",
      title: "Your AI Host",
      progressLabel: "AI Host",
      questions: [
        {
          id: "ai_name",
          sectionId: "ai_employee",
          type: "text",
          title: "What should your AI Employee be called?",
          placeholder: "REMY",
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
            { id: "large_party", label: "Large party bookings" },
            { id: "complaints", label: "Guest complaints" },
            { id: "allergy", label: "Severe allergy concerns" },
            { id: "explicit_request", label: "Guest explicitly asks for staff" },
          ],
        },
      ],
    },
  ],

  navLabels: { conversations: "Guest Conversations", customers: "Guests" },

  quickActions: [
    {
      id: "review_conversations",
      label: "Review recent guest calls",
      description: "See what your AI Host handled today.",
      icon: Phone,
      href: "/conversations",
    },
    {
      id: "connect_reservations",
      label: "Connect your reservation platform",
      description: "Keep live table availability in sync.",
      icon: CalendarClock,
      href: "/build/tools",
    },
  ],

  suggestedIntegrations: [
    { id: "opentable", name: "OpenTable", description: "Live table availability" },
    { id: "resy", name: "Resy", description: "Live table availability" },
  ],

  dashboard: {
    primaryMetrics: [
      { id: "reservations", label: "Today's reservations", icon: CalendarClock, format: "count", value: 42 },
      { id: "guest_calls", label: "Guest calls today", icon: Phone, format: "count", value: 29 },
      { id: "resolution_rate", label: "AI resolution rate", icon: UtensilsCrossed, format: "percent", value: 0.86, tone: "ai" },
      { id: "escalations", label: "Human escalations", icon: Users, format: "count", value: 3, tone: "warning" },
    ],
    activityTemplates: [
      { id: "act_dietary", headline: "Guest asked about gluten-free options", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
      { id: "act_large_party", headline: "Large party reservation requested", outcomeLabel: "Request created", outcomeTone: "info" },
      { id: "act_complaint", headline: "Guest complaint about wait time", outcomeLabel: "Escalated to manager", outcomeTone: "warning" },
      { id: "act_parking", headline: "Guest asked about parking", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
    ],
    attentionItems: [
      {
        id: "att_complaint",
        title: "Guest complaint needs a person",
        detail: "A party of six raised a wait-time complaint — the AI Host escalated to the floor manager.",
        severity: "medium",
      },
    ],
    insights: [
      "Gluten-free questions are the most common unresolved query this week.",
      "Large-party requests mostly arrive on Friday afternoons.",
    ],
  },

  creationSteps: genericCreationSteps("AI Host"),
};
