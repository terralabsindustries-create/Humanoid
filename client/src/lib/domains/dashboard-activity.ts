import type { Conversation } from "@/lib/domain/types";
import { isLiveStatus } from "@/lib/domain/types";
import { OUTCOME_LABEL, OUTCOME_TONE } from "@/lib/domain/labels";
import { relativeAgo } from "@/lib/utils/time";
import type { Tone } from "@/components/primitives/status";

export type ActivityEntry = {
  id: string;
  timeLabel: string;
  headline: string;
  outcomeLabel: string;
  outcomeTone: Tone;
};

/**
 * "What your AI employee is doing", built from calls it actually took.
 *
 * This band used to render `DomainPack.activityTemplates` — authored strings
 * with baked-in time labels, written before conversations were real. On a
 * tenant with a live phone line that is no longer a placeholder but a
 * fabrication: it showed a clinic's invented patients on a dashboard whose
 * entire claim is "here is what happened here".
 *
 * The headline is the caller's own first sentence, which the backend already
 * stores as the conversation summary. That is deliberately not a generated
 * description — it is the closest thing to "why they rang" that exists without
 * a summarisation pass, and it has the advantage of being true.
 */
export function buildActivityFromConversations(
  conversations: Conversation[],
  atMs: number,
  count = 6,
): ActivityEntry[] {
  return [...conversations]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, count)
    .map((conversation) => {
      const live = isLiveStatus(conversation.status);

      return {
        id: conversation.id,
        // Measured against the real clock: the fixture anchor is a fixed past
        // instant, and a real timestamp read against it says "just now" for
        // ever. Safe here because this dashboard renders nothing until it has
        // hydrated on the client.
        timeLabel: relativeAgo(conversation.startedAt, atMs),
        headline: headlineFor(conversation),
        outcomeLabel: live ? "In progress" : OUTCOME_LABEL[conversation.outcome],
        outcomeTone: live ? "ai" : OUTCOME_TONE[conversation.outcome],
      };
    });
}

function headlineFor(conversation: Conversation): string {
  const said = conversation.summary?.trim() || conversation.intent?.trim();
  if (said) return said.length > 90 ? `${said.slice(0, 89)}…` : said;

  // A call with nothing transcribed still happened, and saying so is better
  // than inventing a reason for it.
  return isLiveStatus(conversation.status)
    ? `Call in progress with ${conversation.fromLabel}`
    : `Call from ${conversation.fromLabel}`;
}
