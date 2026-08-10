import { CalendarClock, Phone, Smile, Users } from "lucide-react";
import type { DomainPack } from "./types";
import { genericCreationSteps } from "./shared";

export const dentalPack: DomainPack = {
  id: "dental",
  name: "Dental",
  platformName: "AI Dental Practice Platform",
  tagline: "For dental practices and orthodontic clinics",
  icon: Smile,
  aiEmployeeRoleName: "AI Front Desk",
  aiEmployeeNamePlaceholder: "LUNA",

  onboardingIntro: {
    title: "Let's set up your AI Front Desk.",
    description: "A short set of questions about your practice and its services.",
  },

  onboardingSections: [
    {
      id: "practice",
      title: "Your practice",
      progressLabel: "Practice",
      questions: [
        {
          id: "practice_type",
          sectionId: "practice",
          type: "choice_cards",
          title: "What type of practice do you operate?",
          required: true,
          options: [
            { id: "general", label: "General dentistry" },
            { id: "orthodontics", label: "Orthodontics" },
            { id: "cosmetic", label: "Cosmetic dentistry" },
            { id: "pediatric", label: "Pediatric dentistry" },
            { id: "other", label: "Other" },
          ],
        },
        {
          id: "location_count",
          sectionId: "practice",
          type: "number",
          title: "How many practices do you operate?",
          placeholder: "1",
          required: true,
        },
        {
          id: "services",
          sectionId: "practice",
          type: "multi_select",
          title: "Which services do you offer?",
          required: true,
          options: [
            { id: "checkups", label: "Check-ups & cleaning" },
            { id: "fillings", label: "Fillings" },
            { id: "root_canals", label: "Root canals" },
            { id: "whitening", label: "Whitening" },
            { id: "orthodontics", label: "Orthodontics" },
            { id: "emergency", label: "Emergency care" },
          ],
        },
        {
          id: "nhs_or_private",
          sectionId: "practice",
          type: "single_select",
          title: "Do you take NHS patients, private, or both?",
          required: true,
          options: [
            { id: "nhs", label: "NHS only" },
            { id: "private", label: "Private only" },
            { id: "both", label: "Both" },
          ],
        },
      ],
    },
    {
      id: "ai_employee",
      title: "Your AI Front Desk",
      progressLabel: "AI Front Desk",
      questions: [
        {
          id: "ai_name",
          sectionId: "ai_employee",
          type: "text",
          title: "What should your AI Employee be called?",
          placeholder: "LUNA",
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
            { id: "warm_reassuring", label: "Warm & Reassuring" },
            { id: "friendly_efficient", label: "Friendly & Efficient" },
            { id: "concise", label: "Concise & Efficient" },
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
            { id: "emergency_pain", label: "Emergency pain reports" },
            { id: "billing", label: "Billing disputes" },
            { id: "clinical", label: "Clinical questions" },
            { id: "explicit_request", label: "Patient explicitly asks for staff" },
          ],
        },
      ],
    },
  ],

  navLabels: { conversations: "Patient Conversations" },

  quickActions: [
    {
      id: "review_conversations",
      label: "Review recent patient calls",
      description: "See what your AI Front Desk handled today.",
      icon: Phone,
      href: "/conversations",
    },
    {
      id: "connect_pms",
      label: "Connect your practice system",
      description: "Link live appointment availability.",
      icon: CalendarClock,
      href: "/build/tools",
    },
  ],

  suggestedIntegrations: [
    { id: "dentally", name: "Dentally", description: "Appointments and patient records" },
    { id: "practice_mgmt", name: "Practice management system", description: "Appointments and billing" },
  ],

  dashboard: {
    primaryMetrics: [
      { id: "appointments", label: "Today's appointments", icon: CalendarClock, format: "count", value: 18 },
      { id: "new_patients", label: "New patient enquiries", icon: Users, format: "count", value: 4 },
      { id: "resolution_rate", label: "AI resolution rate", icon: Smile, format: "percent", value: 0.83, tone: "ai" },
      { id: "escalations", label: "Escalations to staff", icon: Phone, format: "count", value: 2, tone: "warning" },
    ],
    activityTemplates: [
      { id: "act_pricing", headline: "Patient asked about NHS vs private pricing", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
      { id: "act_emergency", headline: "Emergency toothache reported", outcomeLabel: "Escalated to duty dentist", outcomeTone: "danger" },
      { id: "act_whitening", headline: "New patient enquiry — teeth whitening", outcomeLabel: "Request created", outcomeTone: "info" },
      { id: "act_reschedule", headline: "Appointment reschedule requested", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
    ],
    attentionItems: [
      {
        id: "att_emergency",
        title: "Emergency pain reported",
        detail: "A caller described severe toothache — escalated to the duty dentist.",
        severity: "high",
      },
    ],
    insights: [
      "NHS-vs-private questions are the most common unresolved query this month.",
      "Whitening enquiries have doubled since last quarter.",
    ],
  },

  creationSteps: genericCreationSteps("AI Front Desk"),
};
