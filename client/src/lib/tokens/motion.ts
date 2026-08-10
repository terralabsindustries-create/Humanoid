/**
 * Motion tokens.
 *
 * Mirrors the CSS custom properties in app/globals.css so that JS-driven
 * animation (Motion for React) and CSS transitions stay in step. Changing a
 * duration means changing it in both places — they are asserted equal by the
 * token test.
 *
 * The rule that governs every value here: motion communicates a state change,
 * a spatial relationship, or a system response. It never decorates, and it
 * never delays an action. Anything the user initiated must respond within
 * DURATION.feedback regardless of how long the resulting work takes.
 */

export const DURATION = {
  /** Press, toggle, hover — perceived as instant. */
  feedback: 0.1,
  /** Small state transitions: badge change, inline reveal. */
  fast: 0.16,
  /** Standard component transition: popover, dropdown, tab content. */
  standard: 0.24,
  /** Panel and drawer transitions. */
  panel: 0.3,
  /** Large spatial moves: route change, mode switch, focus mode. */
  spatial: 0.42,
  /** Onboarding sequences only. Never used inside operational screens. */
  cinematic: 0.7,
} as const;

export const EASE = {
  /** Default for entrances and most transitions. */
  out: [0.25, 1, 0.5, 1],
  /** Symmetric moves where the element travels and settles. */
  inOut: [0.76, 0, 0.24, 1],
  /** Exits — quicker off the screen than onto it. */
  in: [0.5, 0, 0.75, 0],
} as const;

/**
 * Springs for anything the user is physically manipulating: pressing,
 * dragging, reordering, selecting. Springs make a control feel engaged;
 * easing makes a surface feel moved. Use accordingly.
 */
export const SPRING = {
  /** Buttons, toggles, selection indicators. */
  press: { type: "spring", stiffness: 520, damping: 34, mass: 0.7 },
  /** Shared-layout indicators: active tab, active nav item. */
  indicator: { type: "spring", stiffness: 420, damping: 38, mass: 0.8 },
  /** Drag and reorder feedback. */
  drag: { type: "spring", stiffness: 600, damping: 42, mass: 0.6 },
  /** Popovers and menus originating from a trigger. */
  origin: { type: "spring", stiffness: 460, damping: 36, mass: 0.75 },
} as const;

/** Standard transition objects, ready to spread into Motion props. */
export const TRANSITION = {
  feedback: { duration: DURATION.feedback, ease: EASE.out },
  fast: { duration: DURATION.fast, ease: EASE.out },
  standard: { duration: DURATION.standard, ease: EASE.out },
  panel: { duration: DURATION.panel, ease: EASE.inOut },
  spatial: { duration: DURATION.spatial, ease: EASE.inOut },
  exit: { duration: DURATION.fast, ease: EASE.in },
} as const;

/**
 * Press compression. Applied to controls so they feel physically engaged.
 * Deliberately small — this is a product people use for eight hours, not a
 * landing page.
 */
export const PRESS = {
  whileTap: { scale: 0.97 },
  transition: SPRING.press,
} as const;

/**
 * Distances for entrance offsets, in pixels. Kept small: operational UI should
 * settle, not fly. Larger values are reserved for onboarding.
 */
export const OFFSET = {
  nudge: 2,
  small: 6,
  panel: 12,
  page: 20,
} as const;
