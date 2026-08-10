"use client";

import { useEffect } from "react";
import {
  isTypingTarget,
  resolveTactileKind,
  tactile,
} from "@/lib/interaction/tactile";
import { suppressInterfaceSound } from "@/lib/sound/interface";
import type { InterfaceSound } from "@/lib/tokens/interface-sound";

/**
 * The tactile layer.
 *
 * One document-level listener gives every control in the product press
 * feedback, including ones that do not exist yet. The alternative — wiring a
 * callback into each component — guarantees the feel is inconsistent within a
 * month, because the feel would then be something each author has to remember.
 *
 * Two things it is careful about:
 *
 * **Scrolling is not pressing.** On touch, a press begins the same way a scroll
 * does. Feedback therefore waits for the finger to lift and fires only if it
 * barely moved. On mouse and pen there is no such ambiguity, so feedback is
 * immediate on the way down, which is where it belongs.
 *
 * **Keyboard is not second class.** Enter and Space on a focused control feel
 * identical to a click. In a product whose primary navigation is a command
 * palette, feedback that only exists for the mouse would be feedback that most
 * of its power users never get.
 *
 * It also silences itself whenever audio is playing anywhere on the page, so a
 * recording, a live listen-in or a voice preview is never clicked over. That is
 * enforced here rather than left to each audio surface to remember.
 */
export function TactileLayer() {
  useEffect(() => {
    /** Movement past this in CSS pixels means the finger was scrolling. */
    const TAP_SLOP_PX = 10;
    /** A press held longer than this is a long-press, not a tap. */
    const TAP_TIMEOUT_MS = 700;

    type PendingTap = {
      id: number;
      x: number;
      y: number;
      at: number;
      element: HTMLElement;
      kind: InterfaceSound;
    };

    let pending: PendingTap | null = null;

    const onPointerDown = (event: PointerEvent) => {
      pending = null;
      if (!event.isTrusted || event.button !== 0) return;

      const hit = resolveTactileKind(event.target);
      if (!hit) return;

      if (event.pointerType === "touch") {
        pending = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          at: Date.now(),
          element: hit.element,
          kind: hit.kind,
        };
        return;
      }

      tactile(hit.kind);
    };

    const onPointerUp = (event: PointerEvent) => {
      const tap = pending;
      pending = null;
      if (!tap || event.pointerId !== tap.id) return;
      if (Date.now() - tap.at > TAP_TIMEOUT_MS) return;
      if (
        Math.abs(event.clientX - tap.x) > TAP_SLOP_PX ||
        Math.abs(event.clientY - tap.y) > TAP_SLOP_PX
      ) {
        return;
      }
      // The finger can leave the control before lifting, which is a cancel.
      if (!tap.element.contains(event.target as Node)) return;

      tactile(tap.kind);
    };

    const onPointerCancel = () => {
      pending = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.isTrusted || event.repeat) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      if (isTypingTarget(event.target)) return;

      const hit = resolveTactileKind(event.target);
      if (hit) tactile(hit.kind);
    };

    // Media events do not bubble, so they are only observable from the
    // document in the capture phase. Tracked by element rather than counted,
    // because `ended` and `pause` both fire at the end of a recording and a
    // counter would drift negative.
    const audible = new Set<EventTarget>();
    const onPlay = (event: Event) => {
      if (event.target) audible.add(event.target);
      suppressInterfaceSound(audible.size > 0);
    };
    const onStop = (event: Event) => {
      if (event.target) audible.delete(event.target);
      suppressInterfaceSound(audible.size > 0);
    };

    // Capture phase: components legitimately stop propagation on pointerdown
    // (drag handles, Radix dismissable layers), and a control going quiet
    // because of an unrelated implementation detail is the kind of
    // inconsistency this layer exists to prevent.
    const options = { capture: true, passive: true } as const;
    document.addEventListener("pointerdown", onPointerDown, options);
    document.addEventListener("pointerup", onPointerUp, options);
    document.addEventListener("pointercancel", onPointerCancel, options);
    document.addEventListener("keydown", onKeyDown, options);
    document.addEventListener("play", onPlay, options);
    document.addEventListener("pause", onStop, options);
    document.addEventListener("ended", onStop, options);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, options);
      document.removeEventListener("pointerup", onPointerUp, options);
      document.removeEventListener("pointercancel", onPointerCancel, options);
      document.removeEventListener("keydown", onKeyDown, options);
      document.removeEventListener("play", onPlay, options);
      document.removeEventListener("pause", onStop, options);
      document.removeEventListener("ended", onStop, options);
      suppressInterfaceSound(false);
    };
  }, []);

  return null;
}
