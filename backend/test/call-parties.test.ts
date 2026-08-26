import { describe, it, expect } from "vitest";
import { callParties } from "../src/modules/telephony/twilio-request.js";

/**
 * `From` and `To` are not "caller" and "callee" — they are two ends, and which
 * one holds the human depends on who dialled.
 *
 * Getting this wrong printed the AI's own Twilio number into the "Phone" field
 * of a booking, which is the field a human being rings back. It also labelled
 * the conversation with that number, so the whole call looked like it came
 * from the business to itself.
 */
describe("callParties", () => {
  const TWILIO = "+19044909120";
  const PERSON = "+918590740343";

  it("puts the human on `from` for an inbound call", () => {
    const parties = callParties("inbound", PERSON, TWILIO);
    expect(parties).toEqual({ human: PERSON, business: TWILIO, direction: "inbound" });
  });

  it("puts the human on `to` for an outbound call — the bug this exists for", () => {
    // Twilio dials *from* the business number, so `from` is us, not them.
    const parties = callParties("outbound-api", TWILIO, PERSON);
    expect(parties).toEqual({ human: PERSON, business: TWILIO, direction: "outbound" });
  });

  it("treats every outbound spelling Twilio uses the same way", () => {
    // The webhook says "outbound-api"/"outbound-dial"; the relay says "outbound".
    for (const direction of ["outbound", "outbound-api", "outbound-dial", "OUTBOUND-API"]) {
      expect(callParties(direction, TWILIO, PERSON).human).toBe(PERSON);
    }
  });

  it("assumes inbound when Twilio says nothing", () => {
    // The safer default: inbound is the overwhelmingly common case, and it is
    // what every call before this field was read behaved as.
    expect(callParties(undefined, PERSON, TWILIO).human).toBe(PERSON);
    expect(callParties("", PERSON, TWILIO).direction).toBe("inbound");
  });

  it("never invents a number when an end is missing", () => {
    expect(callParties("inbound", undefined, TWILIO).human).toBeNull();
    expect(callParties("outbound", TWILIO, undefined).human).toBeNull();
  });

  it("keeps the business end stable across directions", () => {
    // Routing depends on this: the same workspace must answer whether it
    // dialled out or was dialled.
    expect(callParties("inbound", PERSON, TWILIO).business).toBe(TWILIO);
    expect(callParties("outbound", TWILIO, PERSON).business).toBe(TWILIO);
  });
});
