/**
 * Cuts a stream of model deltas into frames worth speaking.
 *
 * Two costs are being traded here. Forwarding every delta the moment it
 * arrives minimises time-to-first-audio but hands the synthesiser sub-word
 * fragments, which flattens prosody. Waiting for whole sentences reads
 * beautifully and puts a second of silence at the front of every turn, which
 * on a phone call is the more expensive mistake.
 *
 * So the first frame leaves as soon as there is a word boundary worth
 * speaking — that one is racing the caller's patience — and every frame after
 * it waits for a clause or sentence boundary, by which point audio is already
 * playing and there is nothing left to race.
 */

/** Enough of a phrase to be worth starting on; below this, prosody suffers for nothing. */
const FIRST_FRAME_MIN_CHARS = 12;
/** A frame this long without punctuation gets cut at a word boundary anyway. */
const FRAME_SOFT_MAX_CHARS = 160;

const SENTENCE_END = /[.!?…]/;
const CLAUSE_END = /[,;:—–]/;

export class TtsChunker {
  private buffer = "";
  private framesEmitted = 0;

  /** Feed one model delta; returns whatever is now ready to speak. */
  push(text: string): string[] {
    this.buffer += text;
    const frames: string[] = [];

    for (;;) {
      const cut = this.findCut();
      if (cut === null) break;
      const frame = this.buffer.slice(0, cut);
      this.buffer = this.buffer.slice(cut);
      if (frame.trim().length > 0) {
        frames.push(frame);
        this.framesEmitted += 1;
      }
    }

    return frames;
  }

  /** Everything still held back. Call once the model stream has ended. */
  flush(): string[] {
    const remainder = this.buffer;
    this.buffer = "";
    if (remainder.trim().length === 0) return [];
    this.framesEmitted += 1;
    return [remainder];
  }

  private findCut(): number | null {
    const boundary = this.findBoundary();
    if (boundary !== null) return boundary;

    if (this.buffer.length > FRAME_SOFT_MAX_CHARS) {
      const wordBreak = lastWordBreakBefore(this.buffer, FRAME_SOFT_MAX_CHARS);
      if (wordBreak !== null) return wordBreak;
    }

    return null;
  }

  private findBoundary(): number | null {
    // The first frame is the one racing the caller's patience: any word
    // boundary past the minimum will do, punctuation or not.
    const minimum = this.framesEmitted === 0 ? FIRST_FRAME_MIN_CHARS : 1;

    for (let i = minimum; i < this.buffer.length; i += 1) {
      const character = this.buffer[i - 1];
      if (character === undefined) continue;

      const punctuated = SENTENCE_END.test(character) || CLAUSE_END.test(character);
      // Punctuation only ends a phrase when whitespace follows it — otherwise
      // "3.30pm" and "Dr. Ellis" get sliced down the middle.
      if (punctuated && isSpace(this.buffer[i])) return i;

      if (this.framesEmitted === 0 && isSpace(this.buffer[i])) return i;
    }

    return null;
  }
}

function isSpace(character: string | undefined): boolean {
  return character !== undefined && /\s/.test(character);
}

function lastWordBreakBefore(text: string, limit: number): number | null {
  for (let i = Math.min(limit, text.length - 1); i > 0; i -= 1) {
    if (isSpace(text[i])) return i;
  }
  return null;
}
