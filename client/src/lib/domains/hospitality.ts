import {
  BedDouble,
  Building2,
  CalendarClock,
  DoorClosed,
  DoorOpen,
  Phone,
  Sparkles,
  UserCheck,
} from "lucide-react";
import type { DomainPack } from "./types";

/**
 * Hospitality — the Phase 1 reference implementation.
 *
 * Every other pack in this directory proves the architecture holds at low
 * effort. This one proves it holds at full depth: real onboarding sections
 * with conditional follow-ups, a dashboard shaped around what a hotel
 * operator actually watches, and copy that never leaks the word "Humanoid"
 * where "AI Concierge" belongs.
 */
export const hospitalityPack: DomainPack = {
  id: "hospitality",
  name: "Hospitality",
  platformName: "AI Hospitality Operations Platform",
  tagline: "For hotels, resorts and serviced properties",
  icon: BedDouble,
  aiEmployeeRoleName: "AI Concierge",
  aiEmployeeNamePlaceholder: "ARIA",

  onboardingIntro: {
    title: "Let's build your AI Concierge.",
    description:
      "A few questions about your property, your guests and how you run reservations. Humanoid uses this to configure an AI Concierge that already knows how your property works.",
  },

  onboardingSections: [
    {
      id: "property",
      title: "Your property",
      progressLabel: "Property",
      description: "The basics of what you operate and where.",
      questions: [
        {
          id: "property_type",
          sectionId: "property",
          type: "choice_cards",
          title: "What type of property do you operate?",
          required: true,
          options: [
            { id: "hotel", label: "Hotel" },
            { id: "resort", label: "Resort" },
            { id: "boutique", label: "Boutique hotel" },
            { id: "serviced_apartments", label: "Serviced apartments" },
            { id: "hostel", label: "Hostel" },
            { id: "vacation_rental", label: "Vacation rental" },
            { id: "other", label: "Other" },
          ],
        },
        {
          id: "property_count",
          sectionId: "property",
          type: "number",
          title: "How many properties do you operate?",
          placeholder: "1",
          required: true,
        },
        {
          id: "room_count",
          sectionId: "property",
          type: "number",
          title: "Approximately how many rooms?",
          placeholder: "120",
          required: true,
        },
        {
          id: "main_location",
          sectionId: "property",
          type: "text",
          title: "Where is your main property?",
          placeholder: "City, country",
          required: true,
        },
      ],
    },
    {
      id: "guest_experience",
      title: "Guest experience",
      progressLabel: "Guest Experience",
      description: "How guests are looked after, day to day.",
      questions: [
        {
          id: "check_in_time",
          sectionId: "guest_experience",
          type: "time",
          title: "Standard check-in time",
          required: true,
        },
        {
          id: "check_out_time",
          sectionId: "guest_experience",
          type: "time",
          title: "Standard check-out time",
          required: true,
        },
        {
          id: "front_desk_247",
          sectionId: "guest_experience",
          type: "boolean",
          title: "Is your front desk available 24/7?",
          required: true,
        },
        {
          id: "languages",
          sectionId: "guest_experience",
          type: "multi_select",
          title: "Which languages should guests be supported in?",
          required: true,
          options: [
            { id: "en", label: "English" },
            { id: "es", label: "Spanish" },
            { id: "fr", label: "French" },
            { id: "de", label: "German" },
            { id: "hi", label: "Hindi" },
            { id: "zh", label: "Mandarin" },
            { id: "ar", label: "Arabic" },
            { id: "other", label: "Other" },
          ],
        },
        {
          id: "parking_available",
          sectionId: "guest_experience",
          type: "boolean",
          title: "Is parking available?",
        },
        {
          id: "airport_transfer",
          sectionId: "guest_experience",
          type: "boolean",
          title: "Do you offer airport transfers?",
        },
        {
          id: "airport_transfer_type",
          sectionId: "guest_experience",
          type: "single_select",
          title: "Is airport transfer complimentary?",
          conditions: [{ questionId: "airport_transfer", equals: true }],
          options: [
            { id: "complimentary", label: "Complimentary" },
            { id: "paid", label: "Paid" },
            { id: "depends", label: "Depends on booking" },
          ],
        },
        {
          id: "concierge_service",
          sectionId: "guest_experience",
          type: "boolean",
          title: "Is concierge service available?",
        },
      ],
    },
    {
      id: "reservations",
      title: "Reservations",
      progressLabel: "Reservations",
      description: "How bookings are made and changed.",
      questions: [
        {
          id: "reservation_method",
          sectionId: "reservations",
          type: "single_select",
          title: "How do you manage reservations?",
          required: true,
          options: [
            { id: "pms", label: "A property management system" },
            { id: "ota", label: "Booking platforms (OTAs)" },
            { id: "phone_email", label: "Phone & email only" },
            { id: "other", label: "Other" },
          ],
        },
        {
          id: "pms_platform",
          sectionId: "reservations",
          type: "single_select",
          title: "Which PMS or reservation platform do you use?",
          conditions: [{ questionId: "reservation_method", equals: "pms" }],
          options: [
            { id: "opera", label: "Opera" },
            { id: "mews", label: "Mews" },
            { id: "cloudbeds", label: "Cloudbeds" },
            { id: "other", label: "Other" },
            { id: "none", label: "None" },
          ],
        },
        {
          id: "cancellation_policy",
          sectionId: "reservations",
          type: "single_select",
          title: "What is your cancellation policy?",
          required: true,
          options: [
            { id: "flexible", label: "Flexible", description: "Free cancellation up to 24h before" },
            { id: "moderate", label: "Moderate", description: "Free cancellation up to 5 days before" },
            { id: "strict", label: "Strict", description: "Non-refundable or limited refund" },
            { id: "custom", label: "Custom" },
          ],
        },
        {
          id: "early_checkin",
          sectionId: "reservations",
          type: "boolean",
          title: "Do you allow early check-in?",
        },
        {
          id: "late_checkout",
          sectionId: "reservations",
          type: "boolean",
          title: "Do you allow late checkout?",
        },
      ],
    },
    {
      id: "services",
      title: "Services",
      progressLabel: "Services",
      description: "What's on-site, so guests get a straight answer.",
      questions: [
        {
          id: "services",
          sectionId: "services",
          type: "multi_select",
          title: "Which services are available?",
          required: true,
          options: [
            { id: "restaurant", label: "Restaurant" },
            { id: "room_service", label: "Room service" },
            { id: "housekeeping", label: "Housekeeping" },
            { id: "laundry", label: "Laundry" },
            { id: "spa", label: "Spa" },
            { id: "pool", label: "Swimming pool" },
            { id: "gym", label: "Gym" },
            { id: "airport_transfer", label: "Airport transfer" },
            { id: "meeting_rooms", label: "Meeting rooms" },
            { id: "event_spaces", label: "Event spaces" },
          ],
        },
        {
          id: "has_restaurant",
          sectionId: "services",
          type: "boolean",
          title: "Do you have an on-site restaurant?",
          conditions: [{ questionId: "services", includes: "restaurant" }],
        },
        {
          id: "restaurant_style",
          sectionId: "services",
          type: "single_select",
          title: "What style is it?",
          conditions: [{ questionId: "has_restaurant", equals: true }],
          options: [
            { id: "fine_dining", label: "Fine dining" },
            { id: "casual", label: "Casual dining" },
            { id: "buffet", label: "Buffet" },
            { id: "bar_grill", label: "Bar & grill" },
          ],
        },
      ],
    },
    {
      id: "ai_concierge",
      title: "Your AI Concierge",
      progressLabel: "AI Concierge",
      description: "Give it a name and a voice before it meets a guest.",
      questions: [
        {
          id: "ai_name",
          sectionId: "ai_concierge",
          type: "text",
          title: "What should your AI Employee be called?",
          placeholder: "ARIA",
          required: true,
          emphasis: true,
        },
        {
          id: "communication_style",
          sectionId: "ai_concierge",
          type: "choice_cards",
          title: "Preferred communication style",
          required: true,
          options: [
            { id: "warm_professional", label: "Warm & Professional" },
            { id: "luxury_refined", label: "Luxury & Refined" },
            { id: "friendly_casual", label: "Friendly & Casual" },
            { id: "concise_efficient", label: "Concise & Efficient" },
            { id: "custom", label: "Custom" },
          ],
        },
        {
          id: "escalation_triggers",
          sectionId: "ai_concierge",
          type: "multi_select",
          title: "When should Humanoid escalate to a human?",
          required: true,
          options: [
            { id: "billing", label: "Billing disputes" },
            { id: "emergencies", label: "Emergencies" },
            { id: "angry_guests", label: "Angry guests" },
            { id: "reservation_problems", label: "Reservation problems" },
            { id: "vip", label: "VIP guests" },
            { id: "explicit_request", label: "Guest explicitly asks for staff" },
          ],
        },
      ],
    },
  ],

  navLabels: {
    conversations: "Guest Conversations",
    employees: "AI Concierge",
    procedures: "Automations",
  },

  quickActions: [
    {
      id: "review_conversations",
      label: "Review recent guest calls",
      description: "See what your AI Concierge handled today.",
      icon: Phone,
      href: "/conversations",
    },
    {
      id: "connect_pms",
      label: "Connect your PMS",
      description: "Link live availability so reservations stay accurate.",
      icon: Building2,
      href: "/build/tools",
    },
    {
      id: "update_policies",
      label: "Update cancellation policy",
      description: "Keep what guests hear in sync with what's written down.",
      icon: CalendarClock,
      href: "/build/knowledge",
    },
  ],

  suggestedIntegrations: [
    { id: "opera", name: "Opera PMS", description: "Live availability and rates" },
    { id: "mews", name: "Mews", description: "Live availability and rates" },
    { id: "cloudbeds", name: "Cloudbeds", description: "Live availability and rates" },
    { id: "google_calendar", name: "Google Calendar", description: "Meeting room and event space bookings" },
  ],

  dashboard: {
    primaryMetrics: [
      { id: "arrivals", label: "Today's arrivals", icon: DoorOpen, format: "count", value: 18 },
      { id: "departures", label: "Today's departures", icon: DoorClosed, format: "count", value: 14 },
      { id: "occupancy", label: "Occupancy", icon: BedDouble, format: "percent", value: 0.82 },
      { id: "guest_calls", label: "Guest calls today", icon: Phone, format: "count", value: 37 },
      { id: "resolution_rate", label: "AI resolution rate", icon: Sparkles, format: "percent", value: 0.88, tone: "ai" },
      { id: "escalations", label: "Human escalations", icon: UserCheck, format: "count", value: 4, tone: "warning" },
    ],
    activityTemplates: [
      { id: "act_checkout", headline: "Guest asked about late checkout", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
      { id: "act_transfer", headline: "Airport pickup requested", outcomeLabel: "Request created", outcomeTone: "info" },
      { id: "act_modification", headline: "Reservation modification", outcomeLabel: "Transferred to front desk", outcomeTone: "human" },
      { id: "act_pool", headline: "Guest asked about swimming pool hours", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
      { id: "act_towels", headline: "Housekeeping request — extra towels, Room 214", outcomeLabel: "Request created", outcomeTone: "info" },
      { id: "act_spa", headline: "Guest asked about spa opening hours", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
      { id: "act_billing", headline: "Billing dispute raised", outcomeLabel: "Escalated to front desk", outcomeTone: "warning" },
      { id: "act_new_resv", headline: "New reservation enquiry — 2 nights, next weekend", outcomeLabel: "Reservation created", outcomeTone: "success" },
      { id: "act_directions", headline: "Guest asked for directions from the airport", outcomeLabel: "Resolved automatically", outcomeTone: "success" },
    ],
    attentionItems: [
      {
        id: "att_vip",
        title: "VIP guest arriving today",
        detail: "Suite 402 — anniversary stay, requested late check-in.",
        severity: "medium",
      },
      {
        id: "att_billing",
        title: "Billing dispute needs a person",
        detail: "Room 118 disputes a minibar charge — the AI Concierge escalated per policy rather than adjusting it.",
        severity: "high",
      },
    ],
    insights: [
      "Airport transfer requests are up this week, most arriving before 9am — worth checking driver coverage.",
      "Late checkout is the single most-asked question. Adding it to the pre-arrival email could cut call volume.",
    ],
  },

  creationSteps: [
    "Understanding your business",
    "Organizing guest information",
    "Preparing reservation knowledge",
    "Configuring guest workflows",
    "Setting up your AI Concierge",
    "Preparing your workspace",
    "Finalizing",
  ],
};
