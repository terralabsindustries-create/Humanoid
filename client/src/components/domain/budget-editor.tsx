"use client";

import { useState } from "react";
import { Bell, PhoneOff, Voicemail } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/primitives/button";
import { ChoiceCards } from "@/components/primitives/choice-cards";
import { Field } from "@/components/primitives/field";
import { Input } from "@/components/primitives/input";
import { CAP_BEHAVIOUR_DETAIL, CAP_BEHAVIOUR_LABEL } from "@/lib/domain/labels";
import { parseMoneyInput, toMoneyInput } from "@/lib/domain/usage";
import { money } from "@/lib/utils/time";
import type { UsageSnapshot } from "@/lib/domain/types";

/**
 * The budget and the behaviour at the cap: the one control this screen has,
 * and the whole reason §3.12 exists — "what happens when I hit the cap" has
 * to be an explicit, visible choice rather than a default nobody picked.
 *
 * Mirrors `fallback-path.tsx`: a plain-English summary when settled, a form
 * with the same save/cancel shape when open.
 */

type AtCap = UsageSnapshot["atCap"];

export const CAP_ICON: Record<AtCap, LucideIcon> = {
  notify: Bell,
  voicemail: Voicemail,
  stop: PhoneOff,
};

const CAP_ORDER: AtCap[] = ["notify", "voicemail", "stop"];

export function BudgetSummary({
  budgetMonth,
  atCap,
  currency,
  className,
}: {
  budgetMonth: number | null;
  atCap: AtCap;
  currency: string;
  className?: string;
}) {
  const Icon = CAP_ICON[atCap];

  return (
    <span className={cn("flex min-w-0 items-baseline gap-2", className)}>
      <Icon
        className="size-3.5 shrink-0 translate-y-0.5 text-faint"
        aria-hidden
      />
      <span className="min-w-0">
        {budgetMonth === null ? (
          <span className="text-ink">No monthly budget set</span>
        ) : (
          <>
            <span className="text-ink">{money(budgetMonth, currency)}</span>
            <span className="text-muted"> a month</span>
          </>
        )}
        <span className="text-muted">
          {" · at the cap, "}
          {CAP_BEHAVIOUR_LABEL[atCap].toLowerCase()}
        </span>
      </span>
    </span>
  );
}

export function BudgetEditor({
  budgetMonth,
  atCap,
  currency,
  pending = false,
  error = null,
  onSave,
  onCancel,
}: {
  budgetMonth: number | null;
  atCap: AtCap;
  currency: string;
  pending?: boolean;
  /** A failure from the save itself, shown verbatim rather than swallowed. */
  error?: string | null;
  onSave: (next: { budgetMonth: number | null; atCap: AtCap }) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(toMoneyInput(budgetMonth));
  const [cap, setCap] = useState<AtCap>(atCap);
  // Validation appears once someone has tried to save, never speculatively —
  // an error under a field nobody has touched yet reads as a fault in the page.
  const [attempted, setAttempted] = useState(false);

  const trimmed = amount.trim();
  const invalid = trimmed !== "" && parseMoneyInput(trimmed) === null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (invalid) return;
    onSave({ budgetMonth: parseMoneyInput(amount), atCap: cap });
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <Field
        label="Monthly budget"
        htmlFor="usage-budget"
        description={`In ${currency}. Leave blank for no cap — spend is still tracked, but nothing below ever triggers.`}
        error={
          attempted && invalid
            ? "Enter a whole amount, or leave it blank."
            : null
        }
      >
        <Input
          id="usage-budget"
          inputMode="decimal"
          value={amount}
          invalid={attempted && invalid}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="250.00"
          className="font-mono text-sm tabular"
        />
      </Field>

      <div className="mt-3.5">
        <p className="mb-2 text-sm font-medium text-ink">At the cap</p>
        <ChoiceCards
          columns={1}
          size="sm"
          ariaLabel="What happens once spend reaches the budget"
          value={cap}
          onChange={(value) => setCap(value as AtCap)}
          options={CAP_ORDER.map((candidate) => ({
            id: candidate,
            label: CAP_BEHAVIOUR_LABEL[candidate],
            description: CAP_BEHAVIOUR_DETAIL[candidate],
            icon: CAP_ICON[candidate],
          }))}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs font-medium text-danger">
          {error}
        </p>
      )}

      <div className="mt-3.5 flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" loading={pending}>
          Save budget
        </Button>
        <Button size="sm" variant="quiet" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
