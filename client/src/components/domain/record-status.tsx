import {
  ArrowRightLeft,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Check,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CircleSlash,
  FileText,
  Hourglass,
  PhoneOutgoing,
  Sparkles,
  TriangleAlert,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { Status, StatusPill } from "@/components/primitives/status";
import { recordStatusLabel, recordStatusTone } from "@/lib/domain/labels";

/**
 * A record's status, rendered the one way it is allowed to be rendered.
 *
 * The status primitives already pair a tone with text. This adds the third
 * channel: a shape that differs per status rather than a dot that differs only
 * by hue. Cancelled and "did not attend" are both bad news and would sit one
 * colour step apart in a list of eighty rows — the icon is what separates them
 * at a glance, and it is what survives greyscale.
 *
 * Statuses nobody has mapped fall back to a neutral tone and a question mark,
 * which reads as "unrecognised" rather than quietly borrowing another state's
 * appearance.
 */
const RECORD_STATUS_ICON: Record<string, LucideIcon> = {
  // Visits
  scheduled: CalendarClock,
  confirmed: CalendarCheck,
  pending_confirmation: Hourglass,
  rescheduled: ArrowRightLeft,
  completed: Check,
  cancelled: CalendarX,
  no_show: UserX,
  // Cases
  open: CircleDot,
  in_progress: CircleDashed,
  resolved: CircleCheck,
  closed: CircleSlash,
  // Leads
  new: Sparkles,
  contacted: PhoneOutgoing,
  converted: CircleCheck,
  lost: CircleSlash,
  // Orders
  issued: FileText,
  paid: CircleCheck,
  overdue: TriangleAlert,
  void: CircleSlash,
};

/** Filled pill, for list rows where the state has to carry weight. */
export function RecordStatus({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  // Indexed rather than looked up through a helper: a call returning a
  // component reads to the lint rule as a component *defined* during render,
  // which is the one thing that would actually remount these on every keypress.
  const Icon = RECORD_STATUS_ICON[status] ?? CircleHelp;

  return (
    <StatusPill
      tone={recordStatusTone(status)}
      icon={<Icon className="size-3 shrink-0" aria-hidden />}
      className={className}
    >
      {recordStatusLabel(status)}
    </StatusPill>
  );
}

/** Quiet variant, for the detail panel where a filled pill would shout. */
export function RecordStatusInline({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const Icon = RECORD_STATUS_ICON[status] ?? CircleHelp;

  return (
    <Status
      tone={recordStatusTone(status)}
      icon={<Icon className="size-3.5 shrink-0" aria-hidden />}
      className={className}
    >
      {recordStatusLabel(status)}
    </Status>
  );
}
