import {
  Activity,
  BookOpen,
  Boxes,
  Building2,
  CalendarCheck,
  CircleDollarSign,
  ClipboardList,
  FlaskConical,
  Gauge,
  ListChecks,
  MessagesSquare,
  Phone,
  Plug,
  Rocket,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Lexicon } from "@/lib/lexicon";

/**
 * Navigation.
 *
 * Three modes rather than eleven flat items (interface-architecture.md §3.3,
 * §7.1). Each mode is a coherent job — running the business today, changing
 * what the AI does, controlling and accounting for it — and nothing has more
 * than six sections.
 *
 * The known risk is hunting: "which mode was Knowledge in?". The mitigations
 * are structural and live elsewhere in the shell — the command palette and
 * search cross all modes, deep links switch mode automatically, and the two
 * urgent signals (live rail, review count) persist in every mode so nothing
 * urgent is ever mode-dependent.
 */

export type ModeId = "operate" | "build" | "govern";

export type NavItem = {
  id: string;
  href: string;
  icon: LucideIcon;
  /** A function when the word changes by industry; a string when it doesn't. */
  label: string | ((lex: Lexicon) => string);
  /** Second key of the `g` chord, e.g. "g c" for conversations. */
  chord?: string;
  /** Hidden when the user lacks this capability. */
  capability?: string;
  /** Renders the open-review count or live count beside the item. */
  badge?: "review" | "live";
};

export type Mode = {
  id: ModeId;
  label: string;
  description: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const MODES: Mode[] = [
  {
    id: "operate",
    label: "Operate",
    description: "Running the business today",
    icon: Activity,
    items: [
      { id: "today", href: "/today", icon: Gauge, label: "Today", chord: "t" },
      {
        id: "conversations",
        href: "/conversations",
        icon: MessagesSquare,
        label: (lex) => lex.conversation.many,
        chord: "c",
        badge: "live",
      },
      {
        id: "records",
        href: "/records",
        icon: CalendarCheck,
        label: (lex) => lex.visit.many,
        chord: "r",
      },
      {
        id: "customers",
        href: "/customers",
        icon: Users,
        label: (lex) => lex.party.many,
        chord: "p",
      },
      {
        id: "review",
        href: "/review",
        icon: ListChecks,
        label: "Review",
        chord: "v",
        badge: "review",
      },
    ],
  },
  {
    id: "build",
    label: "Build",
    description: "Changing what the AI does",
    icon: Sparkles,
    items: [
      {
        id: "employees",
        href: "/build/employees",
        icon: Boxes,
        label: (lex) => lex.employee.many,
        chord: "e",
        capability: "employee.read",
      },
      {
        id: "knowledge",
        href: "/build/knowledge",
        icon: BookOpen,
        label: "Knowledge",
        chord: "k",
        capability: "knowledge.read",
      },
      {
        id: "procedures",
        href: "/build/procedures",
        icon: ClipboardList,
        label: (lex) => lex.procedure.many,
        chord: "d",
        capability: "procedure.read",
      },
      {
        id: "tools",
        href: "/build/tools",
        icon: Plug,
        label: "Tools & integrations",
        chord: "i",
        capability: "tool.read",
      },
      {
        id: "simulator",
        href: "/build/simulator",
        icon: FlaskConical,
        label: "Simulator",
        chord: "s",
        capability: "simulation.run",
      },
      {
        id: "releases",
        href: "/build/releases",
        icon: Rocket,
        label: "Releases",
        chord: "l",
        capability: "employee.read",
      },
    ],
  },
  {
    id: "govern",
    label: "Govern",
    description: "Control and accountability",
    icon: ShieldCheck,
    items: [
      {
        id: "performance",
        href: "/govern/performance",
        icon: Gauge,
        label: "Performance",
        chord: "f",
      },
      {
        id: "channels",
        href: "/govern/channels",
        icon: Phone,
        label: "Channels & numbers",
        chord: "n",
        capability: "channel.manage",
      },
      {
        id: "people",
        href: "/govern/people",
        icon: Users,
        label: "People & roles",
        chord: "o",
        capability: "people.manage",
      },
      {
        id: "compliance",
        href: "/govern/compliance",
        icon: ShieldCheck,
        label: "Compliance",
        chord: "y",
        capability: "compliance.read",
      },
      {
        id: "audit",
        href: "/govern/audit",
        icon: ScrollText,
        label: "Audit log",
        chord: "a",
        capability: "audit.read",
      },
      {
        id: "usage",
        href: "/govern/usage",
        icon: CircleDollarSign,
        label: "Usage & billing",
        chord: "u",
        capability: "billing.read",
      },
      {
        id: "workspace",
        href: "/govern/workspace",
        icon: Building2,
        label: "Workspace",
        chord: "w",
        capability: "workspace.manage",
      },
    ],
  },
];

export const WRENCH_ICON = Wrench;

/** Which mode a path belongs to, so deep links land in the right mode. */
export function modeForPath(pathname: string): ModeId {
  if (pathname.startsWith("/build")) return "build";
  if (pathname.startsWith("/govern")) return "govern";
  return "operate";
}

export function resolveLabel(
  label: NavItem["label"],
  lexicon: Lexicon,
): string {
  return typeof label === "function" ? label(lexicon) : label;
}

/** Capability check. "*" is the owner wildcard. */
export function hasCapability(
  userCapabilities: string[],
  required?: string,
): boolean {
  if (!required) return true;
  return (
    userCapabilities.includes("*") || userCapabilities.includes(required)
  );
}

export function accessibleItems(
  mode: Mode,
  userCapabilities: string[],
): NavItem[] {
  return mode.items.filter((item) =>
    hasCapability(userCapabilities, item.capability),
  );
}

/**
 * Modes the user can actually work in.
 *
 * A mode with nothing in it is worse than no mode: it offers a door that opens
 * onto a wall. An operations lead has no business in Build, so Build does not
 * appear for them at all — the same rule that keeps the shell honest also keeps
 * it small for the people who only do one job here.
 */
export function accessibleModes(userCapabilities: string[]): Mode[] {
  return MODES.filter(
    (mode) => accessibleItems(mode, userCapabilities).length > 0,
  );
}
