"use client";

import { create } from "zustand";
import {
  DEFAULT_SOUND_PREFERENCES,
  type SoundEvent,
  type SoundPreferences,
} from "@/lib/tokens/sound";
import type { DisclosureLevel } from "@/lib/domain/types";

/**
 * User interface preferences.
 *
 * These are deliberately not persisted through zustand's middleware. The theme
 * must be correct on the very first paint, which means it is applied by an
 * inline script in the document head before React exists. This store reads the
 * same storage afterwards so the controls agree with what is on screen.
 *
 * Server and first client render both start from DEFAULTS, so there is no
 * hydration mismatch; `hydratePreferences` reconciles immediately after mount.
 */

export type Theme = "light" | "dark" | "system";
export type Density = "comfortable" | "compact";

export type Preferences = {
  theme: Theme;
  density: Density;
  highContrast: boolean;
  /** Collapses motion and silences sound. Separate from OS reduced-motion. */
  reducedSensory: boolean;
  /** How much technical detail surfaces. Orthogonal to role. */
  disclosure: DisclosureLevel;
  sound: SoundPreferences;
  /**
   * Touch press feedback. On rather than off: it is silent, it never competes
   * with call audio, and on a phone it is the only press confirmation that
   * survives a glance away from the screen.
   */
  haptics: boolean;
  sidebarCollapsed: boolean;
};

export const DEFAULTS: Preferences = {
  theme: "system",
  density: "comfortable",
  highContrast: false,
  reducedSensory: false,
  disclosure: "standard",
  sound: DEFAULT_SOUND_PREFERENCES,
  haptics: true,
  sidebarCollapsed: false,
};

export const STORAGE_KEY = "humanoid.preferences";

type PreferencesStore = Preferences & {
  hydrated: boolean;
  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void;
  setSoundEnabled(enabled: boolean): void;
  setInterfaceSoundEnabled(enabled: boolean): void;
  setSoundVolume(volume: number): void;
  toggleSoundEvent(event: SoundEvent): void;
  hydrate(): void;
};

/** Reflect preferences onto <html> so CSS can respond to them. */
function applyToDocument(prefs: Preferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  const resolvedTheme =
    prefs.theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : prefs.theme;

  root.dataset.theme = resolvedTheme;
  root.dataset.density = prefs.density;
  if (prefs.highContrast) root.dataset.contrast = "high";
  else delete root.dataset.contrast;
  if (prefs.reducedSensory) root.dataset.sensory = "reduced";
  else delete root.dataset.sensory;
}

function persist(prefs: Preferences) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be unavailable (private mode, quota). Preferences degrade to
    // session-only rather than breaking the app.
  }
}

function readStored(): Partial<Preferences> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Preferences>) : {};
  } catch {
    return {};
  }
}

export const usePreferences = create<PreferencesStore>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  set(key, value) {
    set({ [key]: value } as Pick<Preferences, typeof key>);
    const next = { ...current(get()), [key]: value };
    applyToDocument(next);
    persist(next);
  },

  setSoundEnabled(enabled) {
    const sound = { ...get().sound, enabled };
    set({ sound });
    persist({ ...current(get()), sound });
  },

  setInterfaceSoundEnabled(interfaceEnabled) {
    const sound = { ...get().sound, interfaceEnabled };
    set({ sound });
    persist({ ...current(get()), sound });
  },

  setSoundVolume(volume) {
    const sound = { ...get().sound, volume };
    set({ sound });
    persist({ ...current(get()), sound });
  },

  toggleSoundEvent(event) {
    const muted = { ...get().sound.muted, [event]: !get().sound.muted[event] };
    const sound = { ...get().sound, muted };
    set({ sound });
    persist({ ...current(get()), sound });
  },

  hydrate() {
    if (get().hydrated) return;
    const stored = readStored();
    // `sound` is merged a level deeper: a preferences blob written before a
    // sound key existed would otherwise replace the whole object and leave the
    // new key undefined.
    const next: Preferences = {
      ...DEFAULTS,
      ...stored,
      sound: { ...DEFAULTS.sound, ...stored.sound },
    };
    set({ ...next, hydrated: true });
    applyToDocument(next);
  },
}));

function current(state: PreferencesStore): Preferences {
  return {
    theme: state.theme,
    density: state.density,
    highContrast: state.highContrast,
    reducedSensory: state.reducedSensory,
    disclosure: state.disclosure,
    sound: state.sound,
    haptics: state.haptics,
    sidebarCollapsed: state.sidebarCollapsed,
  };
}

/**
 * The pre-paint script. Injected as a raw string into <head> so the theme is
 * correct before the first frame — a flash of the wrong theme in a dark clinic
 * at 6am is not acceptable.
 */
export const THEME_SCRIPT = `
(function () {
  try {
    var raw = localStorage.getItem('${STORAGE_KEY}');
    var p = raw ? JSON.parse(raw) : {};
    var theme = p.theme || 'system';
    var resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    var r = document.documentElement;
    r.dataset.theme = resolved;
    r.dataset.density = p.density || 'comfortable';
    if (p.highContrast) r.dataset.contrast = 'high';
    if (p.reducedSensory) r.dataset.sensory = 'reduced';
  } catch (e) {}
})();
`.trim();
