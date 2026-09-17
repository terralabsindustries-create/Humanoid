import { describe, it, expect } from "vitest";
import { ReasoningStripper } from "../src/modules/telephony/llm.js";

/**
 * Guards the one model failure that reaches the caller's ear directly.
 * Observed for real on Groq: qwen3.6-27b without `reasoning_effort: "none"`
 * opens its reply with "<think> Here's a thinking process: 1. Analyze User
 * Input" — every word of which the synthesiser would read aloud.
 */
describe("ReasoningStripper", () => {
  const run = (chunks: string[]): string => {
    const stripper = new ReasoningStripper();
    return chunks.map((c) => stripper.feed(c)).join("") + stripper.flush();
  };

  it("passes ordinary speech through untouched", () => {
    expect(run(["We're open ", "nine to five."])).toBe("We're open nine to five.");
  });

  it("removes a think block delivered in one piece", () => {
    expect(run(["<think>reasoning here</think>We're open nine to five."])).toBe(
      "We're open nine to five.",
    );
  });

  it("removes a think block split across deltas, tag and all", () => {
    // The case a regex over the finished string would handle but a streaming
    // consumer cannot: the tag itself arrives in fragments.
    expect(run(["<thi", "nk>", "step one", " step two", "</thi", "nk>", "Hello there."])).toBe(
      "Hello there.",
    );
  });

  it("never emits a partial opening tag while it is still ambiguous", () => {
    const stripper = new ReasoningStripper();
    // "<thi" could still become "<think>" — speaking it would be wrong.
    expect(stripper.feed("Sure. <thi")).toBe("Sure. ");
    expect(stripper.feed("nk>hidden</think> Done.")).toBe(" Done.");
  });

  it("keeps text that only looks like the start of a tag", () => {
    expect(run(["Sure. <thi", "s is fine."])).toBe("Sure. <this is fine.");
  });

  it("handles <thinking> as well as <think>", () => {
    expect(run(["<thinking>x</thinking>Yes."])).toBe("Yes.");
  });

  it("emits nothing when the stream dies inside a think block", () => {
    // Better silence — which the session turns into a spoken fallback — than
    // reading half of the model's private reasoning to the caller.
    expect(run(["<think>never closed"])).toBe("");
  });

  it("strips a block that starts mid-sentence", () => {
    expect(run(["Let me check. <think>hmm</think> We open at nine."])).toBe(
      "Let me check.  We open at nine.",
    );
  });
});
