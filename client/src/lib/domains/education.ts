import { CalendarClock, GraduationCap, Phone, Users } from "lucide-react";
import type { DomainPack } from "./types";
import { genericCreationSteps } from "./shared";

export const educationPack: DomainPack = {
  id: "education",
  name: "Education",
  platformName: "AI Education Admissions Platform",
  tagline: "For schools, training centres and academies",
  icon: GraduationCap,
  aiEmployeeRoleName: "AI Admissions Assistant",
  aiEmployeeNamePlaceholder: "COMET",

  onboardingIntro: {
    title: "Let's set up your AI Admissions Assistant.",
    description: "A short set of questions about your programs and how enquiries come in.",
  },

  onboardingSections: [
    {
      id: "business",
      title: "Your institution",
      progressLabel: "Institution",
      questions: [
        {
          id: "institution_type",
          sectionId: "business",
          type: "choice_cards",
          title: "What type of institution do you run?",
          required: true,
          options: [
            { id: "language_school", label: "Language school" },
            { id: "tutoring", label: "Tutoring centre" },
            { id: "vocational", label: "Vocational training" },
            { id: "online_academy", label: "Online academy" },
            { id: "other", label: "Other" },
          ],
        },
        {
          id: "program_count",
          sectionId: "business",
          type: "number",
          title: "How many programs or courses do you offer?",
          placeholder: "12",
          required: true,
        },
        {
          id: "campus_count",
          sectionId: "business",
          type: "number",
          title: "How many campuses or locations do you operate?",
          placeholder: "1",
          required: true,
        },
        {
          id: "enrollment_method",
          sectionId: "business",
          type: "single_select",
          title: "How do students usually enrol?",
          required: true,
          options: [
            { id: "online", label: "Online application" },
            { id: "phone_email", label: "Phone & email" },
            { id: "in_person", label: "In person" },
            { id: "any", label: "Any of the above" },
          ],
        },
      ],
    },
    {
      id: "ai_employee",
      title: "Your AI Admissions Assistant",
      progressLabel: "AI Admissions Assistant",
      questions: [
        {
          id: "ai_name",
          sectionId: "ai_employee",
          type: "text",
          title: "What should your AI Employee be called?",
          placeholder: "COMET",
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
            { id: "grading_disputes", label: "Grading disputes" },
            { id: "financial_aid", label: "Financial aid questions" },
            { id: "explicit_request", label: "Caller explicitly asks for staff" },
          ],
        },
      ],
    },
  ],

  navLabels: {},

  quickActions: [
    {
      id: "review_conversations",
      label: "Review recent enquiry calls",
      description: "See what your AI Admissions Assistant handled today.",
      icon: Phone,
      href: "/conversations",
    },
    {
      id: "connect_sis",
      label: "Connect your student system",
      description: "Keep programs and schedules in sync.",
      icon: CalendarClock,
      href: "/build/tools",
    },
  ],

  suggestedIntegrations: [
    { id: "sis", name: "Student information system", description: "Programs and enrolment" },
  ],

  dashboard: {
    primaryMetrics: [
      { id: "enquiries", label: "Enquiries today", icon: Users, format: "count", value: 26 },
      { id: "enrolments", label: "Enrolments this week", icon: GraduationCap, format: "count", value: 9 },
      { id: "resolution_rate", label: "AI resolution rate", icon: GraduationCap, format: "percent", value: 0.84, tone: "ai" },
      { id: "escalations", label: "Human escalations", icon: Phone, format: "count", value: 2, tone: "warning" },
    ],
    activityTemplates: [
      { id: "act_tuition", headline: "Prospective student asked about tuition fees", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
      { id: "act_application", headline: "New enrolment application started", outcomeLabel: "Request created", outcomeTone: "info" },
      { id: "act_grading", headline: "Student disputed a grading decision", outcomeLabel: "Escalated to staff", outcomeTone: "warning" },
      { id: "act_schedule", headline: "Prospective student asked about class schedules", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
    ],
    attentionItems: [
      {
        id: "att_grading",
        title: "Grading dispute needs a person",
        detail: "A student queried a course grade — escalated to academic staff.",
        severity: "medium",
      },
    ],
    insights: [
      "Tuition-fee questions are the most common unresolved query this month.",
      "Evening-class enquiries are up ahead of the new term.",
    ],
  },

  creationSteps: genericCreationSteps("AI Admissions Assistant"),
};
