"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TRANSITION } from "@/lib/tokens/motion";
import type { DomainPack } from "@/lib/domains/registry";
import type { IndustryPackId } from "@/lib/lexicon";

/**
 * The industry grid. Not a boring card list: each option carries an icon, a
 * one-line description of who it's for, and a selected state that visibly
 * commits — because choosing here is the moment Humanoid starts sounding like
 * it was built for this specific business, and the interaction should feel
 * like that much.
 */
export function IndustrySelector({
  packs,
  value,
  onChange,
}: {
  packs: DomainPack[];
  value: IndustryPackId | null;
  onChange: (id: IndustryPackId) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Industry"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {packs.map((pack, index) => {
        const Icon = pack.icon;
        const selected = value === pack.id;
        return (
          <motion.button
            key={pack.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(pack.id)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...TRANSITION.standard, delay: index * 0.025 }}
            whileTap={{ scale: 0.98 }}
            whileHover={{ y: -2 }}
            className={cn(
              "group relative flex items-start gap-3.5 rounded-panel border p-4 text-left",
              "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              selected
                ? "border-ink bg-accent-surface"
                : "border-line-strong bg-elevated hover:bg-subtle",
            )}
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-panel transition-colors",
                selected ? "bg-ink text-app" : "bg-subtle text-muted group-hover:text-ink",
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="block text-sm font-medium text-ink">{pack.name}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                {pack.tagline}
              </span>
            </span>
            {selected && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={TRANSITION.feedback}
                className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-ink"
              >
                <Check className="size-3 text-app" strokeWidth={3} aria-hidden />
              </motion.span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
