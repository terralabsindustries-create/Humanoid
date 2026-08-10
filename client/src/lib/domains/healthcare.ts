import { CalendarClock, Phone, Stethoscope, Users } from "lucide-react";
import type { DomainPack } from "./types";
import { genericCreationSteps } from "./shared";

export const healthcarePack: DomainPack = {
  id: "healthcare",
  name: "Healthcare",
  platformName: "AI Healthcare Customer Care Platform",
  tagline: "For clinics, practices and outpatient care",
  icon: Stethoscope,
  aiEmployeeRoleName: "AI Care Coordinator",
  aiEmployeeNamePlaceholder: "NOVA",

  onboardingIntro: {
    title: "Let's set up your AI Care Coordinator.",
    description:
      "A short set of questions about your practice and how patients reach you.",
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
            { id: "general", label: "General practice" },
            { id: "outpatient", label: "Outpatient clinic" },
            { id: "specialist", label: "Specialist clinic" },
            { id: "urgent_care", label: "Urgent care" },
            { id: "other", label: "Other" },
          ],
        },
        {
          id: "location_count",
          sectionId: "practice",
          type: "number",
          title: "How many locations do you operate?",
          placeholder: "1",
          required: true,
        },
        {
          id: "main_location",
          sectionId: "practice",
          type: "text",
          title: "Where is your main location?",
          placeholder: "City, country",
          required: true,
        },
        {
          id: "appointment_types",
          sectionId: "practice",
          type: "multi_select",
          title: "What kinds of appointments do you offer?",
          required: true,
          options: [
            { id: "consultations", label: "Consultations" },
            { id: "follow_ups", label: "Follow-ups" },
            { id: "vaccinations", label: "Vaccinations" },
            { id: "screenings", label: "Screenings" },
            { id: "referrals", label: "Referral visits" },
          ],
        },
        {
          id: "insurance_accepted",
          sectionId: "practice",
          type: "boolean",
          title: "Do you accept insurance directly?",
        },
      ],
    },
    {
      id: "ai_employee",
      title: "Your AI Care Coordinator",
      progressLabel: "AI Care Coordinator",
      questions: [
        {
          id: "ai_name",
          sectionId: "ai_employee",
          type: "text",
          title: "What should your AI Employee be called?",
          placeholder: "NOVA",
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
            { id: "clinical_precise", label: "Clinical & Precise" },
            { id: "friendly_efficient", label: "Friendly & Efficient" },
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
            { id: "clinical", label: "Clinical questions" },
            { id: "emergencies", label: "Emergencies" },
            { id: "distressed", label: "Distressed patients" },
            { id: "billing", label: "Billing disputes" },
            { id: "explicit_request", label: "Patient explicitly asks for staff" },
          ],
        },
      ],
    },
  ],

  navLabels: {
    conversations: "Patient Conversations",
    employees: "AI Care Team",
  },

  quickActions: [
    {
      id: "review_conversations",
      label: "Review recent patient calls",
      description: "See what your AI Care Coordinator handled today.",
      icon: Phone,
      href: "/conversations",
    },
    {
      id: "connect_ehr",
      label: "Connect your practice system",
      description: "Link live appointment availability.",
      icon: CalendarClock,
      href: "/build/tools",
    },
  ],

  suggestedIntegrations: [
    { id: "cliniko", name: "Cliniko", description: "Appointments and patient records" },
    { id: "practice_mgmt", name: "Practice management system", description: "Appointments and billing" },
  ],

  dashboard: {
    primaryMetrics: [
      { id: "appointments", label: "Today's appointments", icon: CalendarClock, format: "count", value: 24 },
      { id: "new_patients", label: "New patient enquiries", icon: Users, format: "count", value: 6 },
      { id: "resolution_rate", label: "AI resolution rate", icon: Stethoscope, format: "percent", value: 0.85, tone: "ai" },
      { id: "escalations", label: "Escalations to staff", icon: Phone, format: "count", value: 3, tone: "warning" },
    ],
    activityTemplates: [
      { id: "act_reschedule", headline: "Patient asked to reschedule Tuesday's appointment", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
      { id: "act_registration", headline: "New patient registration started", outcomeLabel: "Request created", outcomeTone: "info" },
      { id: "act_symptom", headline: "Patient described chest pain", outcomeLabel: "Escalated to on-call nurse", outcomeTone: "danger" },
      { id: "act_refill", headline: "Prescription refill requested", outcomeLabel: "Request created", outcomeTone: "info" },
      { id: "act_hours", headline: "Patient asked about clinic hours", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
    ],
    attentionItems: [
      {
        id: "att_symptom",
        title: "Urgent symptom reported",
        detail: "A caller described chest pain during triage — escalated immediately per policy.",
        severity: "high",
      },
    ],
    insights: [
      "Reschedule requests spike on Monday mornings — extra staffed hours then may help.",
      "Vaccination questions are the most common unresolved query this week.",
    ],
  },

  creationSteps: genericCreationSteps("AI Care Coordinator"),
};
