import { CalendarClock, Home, Phone, Users } from "lucide-react";
import type { DomainPack } from "./types";
import { genericCreationSteps } from "./shared";

export const realEstatePack: DomainPack = {
  id: "realEstate",
  name: "Real estate",
  platformName: "AI Real Estate Customer Operations Platform",
  tagline: "For agencies, brokerages and property managers",
  icon: Home,
  aiEmployeeRoleName: "AI Leasing Assistant",
  aiEmployeeNamePlaceholder: "SAGE",

  onboardingIntro: {
    title: "Let's set up your AI Leasing Assistant.",
    description: "A short set of questions about your listings and how viewings are booked.",
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
          type: "choice_cards",
          title: "What kind of business do you run?",
          required: true,
          options: [
            { id: "residential_sales", label: "Residential sales" },
            { id: "residential_lettings", label: "Residential lettings" },
            { id: "commercial", label: "Commercial" },
            { id: "property_management", label: "Property management" },
            { id: "other", label: "Other" },
          ],
        },
        {
          id: "listing_count",
          sectionId: "business",
          type: "number",
          title: "Roughly how many active listings do you have?",
          placeholder: "40",
          required: true,
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
          id: "viewing_scheduling",
          sectionId: "business",
          type: "single_select",
          title: "How are viewings scheduled?",
          required: true,
          options: [
            { id: "crm", label: "CRM / scheduling tool" },
            { id: "phone_email", label: "Phone & email" },
            { id: "online_booking", label: "Online booking" },
            { id: "other", label: "Other" },
          ],
        },
      ],
    },
    {
      id: "ai_employee",
      title: "Your AI Leasing Assistant",
      progressLabel: "AI Leasing Assistant",
      questions: [
        {
          id: "ai_name",
          sectionId: "ai_employee",
          type: "text",
          title: "What should your AI Employee be called?",
          placeholder: "SAGE",
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
            { id: "offers", label: "Offers submitted" },
            { id: "disputes", label: "Tenant disputes" },
            { id: "explicit_request", label: "Contact explicitly asks for an agent" },
          ],
        },
      ],
    },
  ],

  navLabels: { conversations: "Contact Conversations" },

  quickActions: [
    {
      id: "review_conversations",
      label: "Review recent enquiries",
      description: "See what your AI Leasing Assistant handled today.",
      icon: Phone,
      href: "/conversations",
    },
    {
      id: "connect_crm",
      label: "Connect your CRM",
      description: "Keep listings and viewing slots in sync.",
      icon: CalendarClock,
      href: "/build/tools",
    },
  ],

  suggestedIntegrations: [
    { id: "crm", name: "Property CRM", description: "Listings and viewing availability" },
  ],

  dashboard: {
    primaryMetrics: [
      { id: "viewings", label: "Viewings today", icon: CalendarClock, format: "count", value: 9 },
      { id: "new_enquiries", label: "New enquiries", icon: Users, format: "count", value: 17 },
      { id: "resolution_rate", label: "AI resolution rate", icon: Home, format: "percent", value: 0.79, tone: "ai" },
      { id: "escalations", label: "Human escalations", icon: Phone, format: "count", value: 5, tone: "warning" },
    ],
    activityTemplates: [
      { id: "act_enquiry", headline: "Enquiry about a 2-bed flat listing", outcomeLabel: "Request created", outcomeTone: "info" },
      { id: "act_reschedule", headline: "Viewing reschedule requested", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
      { id: "act_offer", headline: "Offer submitted on a property", outcomeLabel: "Escalated to agent", outcomeTone: "human" },
      { id: "act_pets", headline: "Enquiry asked about pet policy", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
    ],
    attentionItems: [
      {
        id: "att_offer",
        title: "New offer needs review",
        detail: "An offer came in on the Elm Street listing — routed to the listing agent.",
        severity: "medium",
      },
    ],
    insights: [
      "Pet-policy questions are the most common unresolved query this month.",
      "Weekend enquiries are up sharply for the two newest listings.",
    ],
  },

  creationSteps: genericCreationSteps("AI Leasing Assistant"),
};
