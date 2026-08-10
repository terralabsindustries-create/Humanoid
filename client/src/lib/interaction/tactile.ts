"use client";

import { usePreferences } from "@/lib/store/preferences";
import { playInterfaceSound } from "@/lib/sound/interface";
import type { InterfaceSound } from "@/lib/tokens/interface-sound";

/**
 * Press feedback: one entry point, one policy.
 *
 * Feedback is attached to *controls*, not to the page. Clicking a heading, a
 * paragraph, a table cell or empty space does nothing, because a product that
 * responds to every click is telling you nothing about which things respond.
 *
 * Most components never call this. A delegated listener on the document
 * (components/providers/tactile-layer.tsx) classifies presses automatically, so
 * a new button is tactile the moment it is written. Call it directly only for
 * interactions the DOM cannot classify — a command palette selection made with
 * the keyboard, a surface opening, an optimistic action committing.
 */

/**
 * Fire press feedback. Reads preferences from the store rather than a hook so
 * it is callable from event handlers, zustand actions and the delegated
 * listener alike — all places React state is not available.
 */
export function tactile(kind: InterfaceSound): void {
  const prefs = usePreferences.getState();

  // Reduced sensory mode is a single promise: no motion, no sound, no buzz.
  if (prefs.reducedSensory) return;

  playInterfaceSound(kind, {
    enabled: prefs.sound.interfaceEnabled,
    volume: prefs.sound.volume,
    haptics: prefs.haptics,
  });
}

/**
 * Elements that get press feedback. Roles rather than component names, so
 * anything built on Radix, cmdk or plain HTML is covered without registration.
 */
const INTERACTIVE = [
  "button",
  "summary",
  "a[href]",
  "input[type='checkbox']",
  "input[type='radio']",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
  "[role='option']",
  "[role='tab']",
  "[role='radio']",
  "[role='switch']",
  "[role='checkbox']",
  "[data-tactile]",
].join(",");

/**
 * Classify a press. Returns null when the element should stay silent.
 *
 * Any element can override the choice with `data-tactile="commit"` and opt out
 * entirely with `data-tactile="off"` — the opt-out is inherited, so putting it
 * on a container silences everything inside it (a transcript, a chart, an
 * audio scrubber).
 */
export function resolveTactileKind(target: EventTarget | null): {
  element: HTMLElement;
  kind: InterfaceSound;
} | null {
  if (!(target instanceof Element)) return null;

  const element = target.closest<HTMLElement>(INTERACTIVE);
  if (!element) return null;

  if (element.closest("[data-tactile='off']")) return null;
  if (element.hasAttribute("disabled")) return null;
  if (element.getAttribute("aria-disabled") === "true") return null;

  const override = element.dataset.tactile;
  if (override && override !== "off" && override !== "on") {
    return { element, kind: override as InterfaceSound };
  }

  const role = element.getAttribute("role");
  const tag = element.tagName.toLowerCase();
  const type = element.getAttribute("type");

  // Toggles report direction. Read the state *before* the press and invert:
  // the sound describes where the control is going, not where it was.
  const isToggle =
    role === "switch" ||
    role === "checkbox" ||
    role === "menuitemcheckbox" ||
    (tag === "input" && type === "checkbox");
  if (isToggle) {
    const on =
      element.getAttribute("aria-checked") === "true" ||
      (element as HTMLInputElement).checked === true;
    return { element, kind: on ? "toggleOff" : "toggleOn" };
  }

  if (tag === "summary") {
    const open = element.closest("details")?.open ?? false;
    return { element, kind: open ? "close" : "open" };
  }

  if (
    role === "option" ||
    role === "menuitem" ||
    role === "menuitemradio" ||
    role === "tab" ||
    role === "radio" ||
    role === "link" ||
    tag === "a" ||
    (tag === "input" && type === "radio")
  ) {
    return { element, kind: "select" };
  }

  // A primary or destructive button is a commitment, and weight is how a
  // control says so. Variant is exposed as a data attribute for exactly this.
  const variant = element.dataset.variant;
  if (variant === "primary" || variant === "danger") {
    return { element, kind: "commit" };
  }
  if (element.getAttribute("type") === "submit") {
    return { element, kind: "commit" };
  }

  return { element, kind: "tap" };
}

/**
 * Typing must never make noise, including Enter inside a field. Checkboxes and
 * radios are inputs but are operated with Space, not typed into, so they stay
 * eligible.
 */
const OPERABLE_INPUT_TYPES = ["checkbox", "radio", "button", "submit", "reset"];

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target.tagName === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !OPERABLE_INPUT_TYPES.includes(type);
  }
  return false;
}
