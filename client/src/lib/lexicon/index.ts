import type {
  Lexicon,
  LexiconKey,
  LexiconOverrides,
  Term,
} from "./types";

export type { Lexicon, LexiconKey, LexiconOverrides, Term };

/**
 * The base lexicon: deliberately generic. A workspace with no industry pack
 * gets neutral, defensible language rather than a wrong guess.
 */
export const BASE_LEXICON: Lexicon = {
  party: { one: "Customer", many: "Customers" },
  visit: { one: "Appointment", many: "Appointments", short: "Appt" },
  case: { one: "Case", many: "Cases" },
  lead: { one: "Enquiry", many: "Enquiries" },
  order: { one: "Order", many: "Orders" },
  resource: { one: "Resource", many: "Resources" },
  location: { one: "Location", many: "Locations" },
  department: { one: "Team", many: "Teams" },
  conversation: { one: "Conversation", many: "Conversations" },
  call: { one: "Call", many: "Calls" },
  employee: { one: "AI employee", many: "AI employees" },
  procedure: { one: "Procedure", many: "Procedures" },
};

export const INDUSTRY_PACKS = {
  healthcare: {
    label: "Healthcare",
    lexicon: {
      party: { one: "Patient", many: "Patients" },
      visit: { one: "Appointment", many: "Appointments", short: "Appt" },
      case: { one: "Referral", many: "Referrals" },
      lead: { one: "New patient enquiry", many: "New patient enquiries" },
      order: { one: "Invoice", many: "Invoices" },
      resource: { one: "Clinician", many: "Clinicians" },
      department: { one: "Department", many: "Departments" },
      location: { one: "Site", many: "Sites" },
      procedure: { one: "Protocol", many: "Protocols" },
    },
  },
  hospitality: {
    label: "Hotels & hospitality",
    lexicon: {
      party: { one: "Guest", many: "Guests" },
      visit: { one: "Reservation", many: "Reservations", short: "Resv" },
      case: { one: "Service request", many: "Service requests" },
      lead: { one: "Enquiry", many: "Enquiries" },
      order: { one: "Folio", many: "Folios" },
      resource: { one: "Room", many: "Rooms" },
      location: { one: "Property", many: "Properties" },
      procedure: { one: "Playbook", many: "Playbooks" },
    },
  },
  legal: {
    label: "Legal",
    lexicon: {
      party: { one: "Client", many: "Clients" },
      visit: { one: "Consultation", many: "Consultations" },
      case: { one: "Matter", many: "Matters" },
      lead: { one: "Intake", many: "Intakes" },
      order: { one: "Invoice", many: "Invoices" },
      resource: { one: "Attorney", many: "Attorneys" },
      location: { one: "Office", many: "Offices" },
      procedure: { one: "Playbook", many: "Playbooks" },
    },
  },
  realEstate: {
    label: "Real estate",
    lexicon: {
      party: { one: "Contact", many: "Contacts" },
      visit: { one: "Viewing", many: "Viewings" },
      case: { one: "Case", many: "Cases" },
      lead: { one: "Lead", many: "Leads" },
      order: { one: "Offer", many: "Offers" },
      resource: { one: "Property", many: "Properties" },
      location: { one: "Branch", many: "Branches" },
      procedure: { one: "Playbook", many: "Playbooks" },
    },
  },
  automotive: {
    label: "Automotive service",
    lexicon: {
      party: { one: "Customer", many: "Customers" },
      visit: { one: "Service booking", many: "Service bookings" },
      case: { one: "Repair order", many: "Repair orders", short: "RO" },
      lead: { one: "Quote request", many: "Quote requests" },
      order: { one: "Estimate", many: "Estimates" },
      resource: { one: "Technician", many: "Technicians" },
      location: { one: "Centre", many: "Centres" },
      procedure: { one: "Playbook", many: "Playbooks" },
    },
  },
  dental: {
    label: "Dental",
    lexicon: {
      party: { one: "Patient", many: "Patients" },
      visit: { one: "Appointment", many: "Appointments", short: "Appt" },
      case: { one: "Treatment plan", many: "Treatment plans" },
      lead: { one: "New patient enquiry", many: "New patient enquiries" },
      order: { one: "Invoice", many: "Invoices" },
      resource: { one: "Dentist", many: "Dentists" },
      department: { one: "Surgery", many: "Surgeries" },
      location: { one: "Practice", many: "Practices" },
      procedure: { one: "Protocol", many: "Protocols" },
    },
  },
  restaurant: {
    label: "Restaurants",
    lexicon: {
      party: { one: "Guest", many: "Guests" },
      visit: { one: "Reservation", many: "Reservations", short: "Resv" },
      case: { one: "Service issue", many: "Service issues" },
      lead: { one: "Enquiry", many: "Enquiries" },
      order: { one: "Order", many: "Orders" },
      resource: { one: "Table", many: "Tables" },
      location: { one: "Restaurant", many: "Restaurants" },
      procedure: { one: "Playbook", many: "Playbooks" },
    },
  },
  insurance: {
    label: "Insurance",
    lexicon: {
      party: { one: "Policyholder", many: "Policyholders" },
      visit: { one: "Appointment", many: "Appointments" },
      case: { one: "Claim", many: "Claims" },
      lead: { one: "Quote request", many: "Quote requests" },
      order: { one: "Policy", many: "Policies" },
      resource: { one: "Adjuster", many: "Adjusters" },
      location: { one: "Branch", many: "Branches" },
      procedure: { one: "Playbook", many: "Playbooks" },
    },
  },
  education: {
    label: "Education",
    lexicon: {
      party: { one: "Student", many: "Students" },
      visit: { one: "Session", many: "Sessions" },
      case: { one: "Enrolment case", many: "Enrolment cases" },
      lead: { one: "Prospective student", many: "Prospective students" },
      order: { one: "Invoice", many: "Invoices" },
      resource: { one: "Instructor", many: "Instructors" },
      location: { one: "Campus", many: "Campuses" },
      procedure: { one: "Playbook", many: "Playbooks" },
    },
  },
  other: {
    label: "Other",
    lexicon: {},
  },
} as const satisfies Record<
  string,
  { label: string; lexicon: LexiconOverrides }
>;

export type IndustryPackId = keyof typeof INDUSTRY_PACKS;

/**
 * Resolve the effective lexicon: base, then the industry pack, then any
 * workspace-specific overrides an admin has set. Workspace overrides always
 * win — a clinic that calls its patients "Members" gets "Members".
 */
export function resolveLexicon(
  pack: IndustryPackId | null,
  workspaceOverrides: LexiconOverrides = {},
): Lexicon {
  const packOverrides: LexiconOverrides = pack
    ? INDUSTRY_PACKS[pack].lexicon
    : {};

  const keys = Object.keys(BASE_LEXICON) as LexiconKey[];
  return keys.reduce((acc, key) => {
    acc[key] = {
      ...BASE_LEXICON[key],
      ...packOverrides[key],
      ...workspaceOverrides[key],
    };
    return acc;
  }, {} as Lexicon);
}

/**
 * Lowercase a term for mid-sentence use: "3 patients waiting", not
 * "3 Patients waiting". Terms are stored in the casing used for navigation
 * and headings, so prose needs this.
 */
export function lower(value: string): string {
  // A term whose first two characters are both uppercase starts with an
  // acronym — "AI employee", "SMS", "NHS referral". "aI employee" is not a
  // sentence-case version of that, it is a typo, and it reaches the screen in
  // every sentence that embeds the employee term.
  if (/^\p{Lu}\p{Lu}/u.test(value)) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/**
 * "an appointment" / "a reservation" — the indefinite article for a noun that
 * changes with the industry.
 *
 * Sentences in shared components cannot hardcode "a", because the word it sits
 * in front of is chosen by the workspace's pack: the same string is "a
 * Reservation" in a hotel and "an Appointment" in a clinic.
 *
 * It is the sound that decides, not the letter — "a unit", "an hour" — but
 * every vowel-initial term across the ten packs today (Appointment, Attorney,
 * Enquiry, Estimate, Intake, Invoice, Offer, Office, Order, Adjuster, AI
 * employee) takes "an", so the letter rule is correct for all of them. A pack
 * introducing a "Unit" or an "Hour" would need the exception listed here.
 */
export function withArticle(term: string, lowercase = true): string {
  const word = lowercase ? lower(term) : term;
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
}

/** "1 appointment" / "4 appointments" — count and term agreeing. */
export function count(n: number, term: Term, lowercase = true): string {
  const word = n === 1 ? term.one : term.many;
  return `${n} ${lowercase ? lower(word) : word}`;
}
