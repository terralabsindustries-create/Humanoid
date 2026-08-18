/**
 * Capability names.
 *
 * Deliberately not in `domain/labels.ts`. That file states its own rule at the
 * top — the enums in it "mean the same thing in every industry" — and more than
 * half of these do not: `book_visit` is *Book appointments* in a clinic, *Book
 * reservations* in a hotel and *Book viewings* at an estate agency. So a
 * capability's name is a function of the lexicon rather than a constant, and it
 * lives here where that dependency is obvious.
 *
 * Every name is plural and starts with a verb, which is not a style choice: a
 * capability is read as an answer to "what is this AI allowed to do", and the
 * plural sidesteps the a/an problem that would otherwise need an article
 * helper per industry noun.
 */

import type { CapabilityId } from "./types";
import { lower, type Lexicon } from "@/lib/lexicon";

const CAPABILITY_LABEL: Record<CapabilityId, (lex: Lexicon) => string> = {
  book_visit: (lex) => `Book ${lower(lex.visit.many)}`,
  reschedule_visit: (lex) => `Move ${lower(lex.visit.many)}`,
  cancel_visit: (lex) => `Cancel ${lower(lex.visit.many)}`,
  answer_from_knowledge: () => "Answer from approved sources",
  collect_intake: (lex) => `Collect details from ${lower(lex.party.many)}`,
  verify_identity: () => "Verify who is calling",
  send_confirmation: () => "Send confirmations",
  create_case: (lex) => `Raise ${lower(lex.case.many)}`,
  update_party_record: (lex) => `Update ${lower(lex.party.one)} records`,
  transfer_call: (lex) => `Transfer ${lower(lex.call.many)}`,
  take_payment: () => "Take payments",
  clinical_advice: () => "Give clinical advice",
};

export function capabilityLabel(id: CapabilityId, lexicon: Lexicon): string {
  return CAPABILITY_LABEL[id](lexicon);
}
