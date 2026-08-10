/**
 * The lexicon layer.
 *
 * Every user-visible domain noun resolves through here. No component may
 * contain a domain string literal — not "Patient", not "Appointment", not
 * "Call". This is what lets one application serve a hospital, a hotel and a
 * law firm without forking: the interface is written in terms of archetypes,
 * and the workspace supplies the words.
 *
 * Interface chrome ("Save", "Cancel", "Filter") is NOT in the lexicon. That is
 * ordinary copy, and later, ordinary localisation. The lexicon is only for
 * words that change meaning between industries.
 */

/** Singular and plural are stored explicitly. No algorithmic pluralisation —
 *  it breaks on Matter/Matters vs Person/People and reads wrong in prose. */
export type Term = {
  one: string;
  many: string;
  /** Optional short form for dense table headers and the live rail. */
  short?: string;
};

/**
 * Archetype keys. These map to the six record archetypes in
 * interface-architecture.md §5.4, plus the organisational and conversational
 * nouns that also shift by industry.
 */
export type LexiconKey =
  // The six record archetypes
  | "party"
  | "visit"
  | "case"
  | "lead"
  | "order"
  | "resource"
  // Organisation
  | "location"
  | "department"
  // Conversation and work
  | "conversation"
  | "call"
  | "employee"
  | "procedure";

export type Lexicon = Record<LexiconKey, Term>;

/** An industry pack may override any subset; the rest falls back to base. */
export type LexiconOverrides = Partial<Record<LexiconKey, Partial<Term>>>;
