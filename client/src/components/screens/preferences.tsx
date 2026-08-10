"use client";

import * as Switch from "@radix-ui/react-switch";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { usePreferences } from "@/lib/store/preferences";
import { useAuth } from "@/lib/store/auth";
import { authService } from "@/lib/services/auth";
import { previewSound } from "@/lib/sound/player";
import { previewInterfaceSound } from "@/lib/sound/interface";
import { SOUND_LABELS, type SoundEvent } from "@/lib/tokens/sound";
import { Button } from "@/components/primitives/button";
import type { DisclosureLevel } from "@/lib/domain/types";

/**
 * Preferences.
 *
 * Accessibility settings sit alongside ordinary ones rather than in a separate
 * "accessibility" section, because reduced motion and high contrast are things
 * plenty of people want for reasons that have nothing to do with disability,
 * and hiding them implies otherwise.
 */
export function Preferences() {
  const prefs = usePreferences();

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="font-display text-3xl text-ink">Preferences</h1>
      <p className="mt-2 text-md text-muted">
        These apply to you on this device, not to your workspace.
      </p>

      <Section title="Appearance">
        <Choice
          label="Theme"
          description="System follows your operating system."
          value={prefs.theme}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ]}
          onChange={(value) => prefs.set("theme", value)}
        />

        <Choice
          label="Density"
          description="Compact fits more rows on screen for full-day operational work."
          value={prefs.density}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
          onChange={(value) => prefs.set("density", value)}
        />

        <Toggle
          label="High contrast"
          description="Strengthens text and borders. Colour meanings stay the same, so nothing you have learned changes."
          checked={prefs.highContrast}
          onChange={(value) => prefs.set("highContrast", value)}
        />

        <Toggle
          label="Reduced sensory mode"
          description="Removes motion and silences sound. Separate from your system's reduced-motion setting, which is always respected."
          checked={prefs.reducedSensory}
          onChange={(value) => prefs.set("reducedSensory", value)}
        />
      </Section>

      <Section title="Detail">
        <Choice
          label="How much detail to show"
          description="Independent of your role. Developer adds latency, tool payloads, model versions and numeric confidence."
          value={prefs.disclosure}
          options={[
            { value: "standard", label: "Standard" },
            { value: "advanced", label: "Advanced" },
            { value: "developer", label: "Developer" },
          ]}
          onChange={(value) => prefs.set("disclosure", value as DisclosureLevel)}
        />
      </Section>

      <Section title="Feedback">
        <Toggle
          label="Haptics"
          description="A short tick when you press a control, on touch devices that support it. Silent, so it works in a room where calls are being monitored."
          checked={prefs.haptics}
          onChange={(value) => prefs.set("haptics", value)}
        />

        <Toggle
          label="Interface sounds"
          description="A quiet click when you press a control. Off by default: this product is used while listening to live calls, and press sounds compete with the audio that matters. Nothing is only announced by a sound."
          checked={prefs.sound.interfaceEnabled}
          onChange={prefs.setInterfaceSoundEnabled}
          action={
            <Button
              size="sm"
              variant="quiet"
              icon={<Play className="size-3" />}
              data-tactile="off"
              onClick={() => previewInterfaceSound("commit", prefs.sound.volume)}
            >
              Hear it
            </Button>
          }
        />
      </Section>

      <Section title="Sound">
        <Toggle
          label="Alert sounds"
          description="Off by default. Sound marks moments that change what you should do next — a handoff arriving, an approval needed — never navigation or typing."
          checked={prefs.sound.enabled}
          onChange={prefs.setSoundEnabled}
        />

        {(prefs.sound.enabled || prefs.sound.interfaceEnabled) && (
          <div className="py-3">
            <label
              htmlFor="volume"
              className="block text-sm font-medium text-ink"
            >
              Volume
            </label>
            <p className="mt-0.5 text-xs text-muted">
              Applies to alerts and interface sounds. Interface sounds are
              always the quieter of the two.
            </p>
            <input
              id="volume"
              type="range"
              min={0}
              max={100}
              value={Math.round(prefs.sound.volume * 100)}
              onChange={(e) =>
                prefs.setSoundVolume(Number(e.target.value) / 100)
              }
              className="mt-2 w-full max-w-xs accent-[var(--accent)]"
            />
          </div>
        )}

        {prefs.sound.enabled && (
          <div className="py-3">
            <p className="text-sm font-medium text-ink">Which events</p>
            <p className="mt-1 text-xs text-muted">
              Every sound has a visual equivalent. Turning one off never hides
              the event itself.
            </p>
            <ul className="mt-3 space-y-1.5">
              {(Object.keys(SOUND_LABELS) as SoundEvent[]).map((event) => (
                <li key={event} className="flex items-center gap-3">
                  <Switch.Root
                    id={`sound-${event}`}
                    checked={!prefs.sound.muted[event]}
                    onCheckedChange={() => prefs.toggleSoundEvent(event)}
                    className={cn(
                      "relative h-4 w-7 shrink-0 rounded-full transition-colors",
                      "data-[state=checked]:bg-accent data-[state=unchecked]:bg-inset",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    )}
                  >
                    <Switch.Thumb className="block size-3 translate-x-0.5 rounded-full bg-elevated transition-transform data-[state=checked]:translate-x-3.5" />
                  </Switch.Root>
                  <label
                    htmlFor={`sound-${event}`}
                    className="flex-1 text-sm text-ink"
                  >
                    {SOUND_LABELS[event]}
                  </label>
                  <Button
                    size="sm"
                    variant="quiet"
                    icon={<Play className="size-3" />}
                    data-tactile="off"
                    onClick={() => previewSound(event, prefs.sound.volume)}
                  >
                    Play
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <AccountSection />
    </div>
  );
}

function AccountSection() {
  const router = useRouter();
  const email = useAuth((s) => s.email);
  const signOut = useAuth((s) => s.signOut);

  return (
    <Section title="Account">
      <div className="flex items-center justify-between gap-4 py-3.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Signed in</p>
          <p className="mt-0.5 truncate text-xs text-muted">{email ?? "Unknown"}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await authService.logout().catch(() => {});
            signOut();
            router.push("/login");
          }}
        >
          Sign out
        </Button>
      </div>
    </Section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 border-t border-line pt-5">
      <h2 className="font-mono text-2xs tracking-wide text-faint uppercase">
        {title}
      </h2>
      <div className="mt-2 divide-y divide-[var(--line-subtle)]">
        {children}
      </div>
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  action,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Optional control beside the switch — a preview, a link to detail. */
  action?: React.ReactNode;
}) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div className="flex items-start justify-between gap-6 py-3.5">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors",
          "data-[state=checked]:bg-accent data-[state=unchecked]:bg-inset",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        )}
      >
        <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-elevated shadow-raised transition-transform data-[state=checked]:translate-x-4.5" />
      </Switch.Root>
    </div>
  );
}

function Choice<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex shrink-0 gap-0.5 rounded-input bg-subtle p-0.5"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-[9px] px-2.5 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
              value === option.value
                ? "bg-elevated text-ink shadow-raised"
                : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
