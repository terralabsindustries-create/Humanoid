"use client";

import { useState } from "react";
import { Megaphone, PhoneForwarded, Voicemail } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/primitives/button";
import { ChoiceCards } from "@/components/primitives/choice-cards";
import { Field } from "@/components/primitives/field";
import { Input, Textarea } from "@/components/primitives/input";
import { FALLBACK_KIND_LABEL } from "@/lib/domain/labels";
import { describeFallback } from "@/lib/domain/channels";
import type { FallbackBehaviour } from "@/lib/domain/types";

/**
 * The fallback path: what a caller gets when the AI is not the one answering.
 *
 * This is the most consequential setting on the Channels surface and the one
 * least likely to be checked, because nothing goes visibly wrong until the
 * hour nobody is watching. So it is rendered as a sentence about the caller
 * rather than as a field with a value — "Forwards the caller to
 * +44 161 496 0100" can be read against the number on the wall; "forward"
 * cannot.
 */

type Kind = FallbackBehaviour["kind"];

export const FALLBACK_ICON: Record<Kind, LucideIcon> = {
  voicemail: Voicemail,
  forward: PhoneForwarded,
  announce: Megaphone,
};

const KIND_DESCRIPTION: Record<Kind, string> = {
  voicemail: "The caller records a message for someone to pick up.",
  forward: "The call is passed straight to another number.",
  announce: "The caller hears a message, and the call ends there.",
};

const KIND_ORDER: Kind[] = ["forward", "voicemail", "announce"];

export function FallbackSummary({
  fallback,
  className,
}: {
  fallback: FallbackBehaviour;
  className?: string;
}) {
  const Icon = FALLBACK_ICON[fallback.kind];
  const { headline, detail } = describeFallback(fallback);

  return (
    <span className={cn("flex min-w-0 items-baseline gap-2", className)}>
      <Icon className="size-3.5 shrink-0 translate-y-0.5 text-faint" aria-hidden />
      <span className="min-w-0">
        <span className="text-ink">{headline}</span>
        {detail && (
          <>
            {" "}
            <span
              className={cn(
                "text-muted",
                // A number has to be checkable against the one written on the
                // wall, so it keeps the tabular face. A message is prose and
                // would look like a serial number in it.
                fallback.kind === "forward" && "font-mono text-xs tabular",
              )}
            >
              {fallback.kind === "forward" ? detail : `“${detail}”`}
            </span>
          </>
        )}
      </span>
    </span>
  );
}

/**
 * Editing one.
 *
 * The payload fields are revealed by the choice rather than always shown,
 * because an empty "forward to" box under an unselected option is an invitation
 * to fill in something that will never be used. What is typed survives
 * switching between options, so trying two arrangements does not cost the
 * number twice.
 */
export function FallbackEditor({
  fallback,
  pending = false,
  error = null,
  onSave,
  onCancel,
}: {
  fallback: FallbackBehaviour;
  pending?: boolean;
  /** A failure from the save itself, shown verbatim rather than swallowed. */
  error?: string | null;
  onSave: (next: FallbackBehaviour) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<Kind>(fallback.kind);
  const [forwardTo, setForwardTo] = useState(
    fallback.kind === "forward" ? fallback.to : "",
  );
  const [message, setMessage] = useState(
    fallback.kind === "announce" ? fallback.message : "",
  );
  // Validation appears once someone has tried to save, never speculatively:
  // an error on a field nobody has reached yet reads as a fault in the page.
  const [attempted, setAttempted] = useState(false);

  const missing =
    (kind === "forward" && forwardTo.trim() === "") ||
    (kind === "announce" && message.trim() === "");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (missing) return;

    onSave(
      kind === "forward"
        ? { kind: "forward", to: forwardTo.trim() }
        : kind === "announce"
          ? { kind: "announce", message: message.trim() }
          : { kind: "voicemail" },
    );
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <ChoiceCards
        columns={1}
        size="sm"
        ariaLabel="What happens to the caller"
        value={kind}
        onChange={(value) => setKind(value as Kind)}
        options={KIND_ORDER.map((candidate) => ({
          id: candidate,
          label: FALLBACK_KIND_LABEL[candidate],
          description: KIND_DESCRIPTION[candidate],
          icon: FALLBACK_ICON[candidate],
        }))}
      />

      {kind === "forward" && (
        <Field
          className="mt-3"
          label="Forward to"
          htmlFor="fallback-forward-to"
          error={
            attempted && forwardTo.trim() === ""
              ? "Enter the number this should ring instead."
              : null
          }
        >
          <Input
            id="fallback-forward-to"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={forwardTo}
            invalid={attempted && forwardTo.trim() === ""}
            onChange={(event) => setForwardTo(event.target.value)}
            placeholder="+44 161 496 0100"
            className="font-mono text-sm tabular"
          />
        </Field>
      )}

      {kind === "announce" && (
        <Field
          className="mt-3"
          label="What the caller hears"
          htmlFor="fallback-message"
          description="Spoken aloud, so it wants to read the way somebody would say it."
          error={
            attempted && message.trim() === ""
              ? "Enter the message the caller will hear."
              : null
          }
        >
          <Textarea
            id="fallback-message"
            value={message}
            invalid={attempted && message.trim() === ""}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="We're closed at the moment. Please call back after 8am."
            className="min-h-20 text-sm"
          />
        </Field>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs font-medium text-danger">
          {error}
        </p>
      )}

      <div className="mt-3.5 flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" loading={pending}>
          Save fallback
        </Button>
        <Button size="sm" variant="quiet" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
