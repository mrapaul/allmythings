import { type QualityVerdict, adviceFor } from './image-quality';

/**
 * Live capture coaching: turns a stream of noisy per-frame signals into the
 * ONE hint worth showing, or silence.
 *
 * Hysteresis is the whole game. A viewfinder verdict flickers as the user
 * pans, the lens hunts focus, and auto-exposure settles. Showing a hint the
 * instant one sample dips would produce a strobing sign that is worse than no
 * sign at all, so a hint must be corroborated before it appears and must be
 * clearly gone before it leaves. Appearing is deliberately slower than
 * disappearing is: a wrong hint costs more than a late one.
 */

export type CoachHintKind = QualityVerdict | 'unsteady' | 'tilted' | 'overlap';

export interface CoachHint {
  kind: Exclude<CoachHintKind, 'ok'> | 'server_advice';
  message: string;
}

// --- Hysteresis --------------------------------------------------------------
/** Samples a verdict must hold before its hint appears (~2s at 1.2–1.5Hz). */
export const APPEAR_AFTER = 3;
/** Samples it must be absent before the hint leaves (~3.5s) — no strobing. */
export const DISAPPEAR_AFTER = 5;
/** Nothing older than this is considered; keeps the window honest. */
export const WINDOW = 8;

// --- Motion ------------------------------------------------------------------
// Accelerometer magnitude is expressed in g. At rest the device reads ~1g
// (gravity), so instability is |magnitude - 1|. A hand-held phone idles around
// 0.02–0.05g of tremor; a deliberate reframing move spikes well past 0.15g.
// The threshold sits above natural tremor so the hint means "you are actually
// moving", not "you are human".
export const UNSTEADY_G = 0.12;
/**
 * Tilt is measured from gravity's direction. Below this the framing reads as
 * intentional; beyond it the photo will be visibly skewed. 12° is roughly
 * where a rectangular subject starts looking wrong in frame.
 */
export const TILT_DEGREES = 12;

export const MOTION_COPY = {
  unsteady: 'Hold still a moment',
  tilted: 'Straighten up a little',
} as const;

/** Overlap memory (lib/frame-fingerprint): the viewfinder is back on a shot area. */
export const OVERLAP_COPY = 'You already shot this area';

export interface MotionSample {
  /** Accelerometer magnitude in g (sqrt(x²+y²+z²)). */
  magnitude: number;
  /** Absolute tilt from upright/flat, in degrees. */
  tiltDegrees: number;
}

/** Instantaneous motion read — no hysteresis applied yet. */
export function motionVerdict(sample: MotionSample): 'unsteady' | 'tilted' | null {
  if (Math.abs(sample.magnitude - 1) > UNSTEADY_G) return 'unsteady';
  if (sample.tiltDegrees > TILT_DEGREES) return 'tilted';
  return null;
}

/**
 * Tilt from accelerometer gravity. With the phone held upright to shoot, the
 * z axis points backwards and gravity sits mostly on y; roll shows up as x.
 * atan2(x, y) therefore gives the in-plane rotation we care about.
 */
export function tiltFromGravity(x: number, y: number): number {
  const degrees = Math.abs(Math.atan2(x, -y) * (180 / Math.PI));
  return degrees > 90 ? 180 - degrees : degrees;
}

export function magnitudeOf(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/**
 * Priority mirrors analyzeQuality's deliberate ordering, with motion ahead of
 * image faults because motion is PREVENTABLE: telling someone to hold still
 * before the shutter is worth more than telling them afterwards that their
 * photo came out blurry. Within image faults, exposure precedes focus for the
 * same reason it does in analyzeQuality — a dark frame also measures as
 * unfocused, and "add light" is the actionable half.
 */
const PRIORITY: Array<Exclude<CoachHintKind, 'ok'>> = [
  'unsteady',
  'tilted',
  'too_dark',
  'too_bright',
  'too_blurry',
  'low_detail',
  // Advice, not a fault: only shown when nothing else needs fixing.
  'overlap',
];

/** Copy comes from the post-capture gate so the two can never contradict. */
export function messageFor(kind: Exclude<CoachHintKind, 'ok'>): string {
  if (kind === 'unsteady' || kind === 'tilted') return MOTION_COPY[kind];
  if (kind === 'overlap') return OVERLAP_COPY;
  return adviceFor(kind) ?? '';
}

/**
 * Server guidance (density/scene advice from the precheck) is transient by
 * design: it borrows the hint slot for a few samples, then yields back to
 * the live motion/quality signals. Corroborated MOTION still outranks it —
 * "hold still" is always the more urgent, more actionable message.
 */
export const SERVER_ADVICE_TTL = 4;

export interface CoachState {
  /** Newest-last ring of observations; 'ok' means nothing was wrong. */
  window: CoachHintKind[];
  /** The hint currently on screen, if any. */
  active: Exclude<CoachHintKind, 'ok'> | null;
  /** Borrowed-slot server advice; counts down per observation. */
  serverAdvice: { message: string; remaining: number } | null;
}

export function initialCoachState(): CoachState {
  return { window: [], active: null, serverAdvice: null };
}

/** Injects transient server advice (density guidance etc.) into the slot. */
export function pushServerAdvice(state: CoachState, message: string): CoachState {
  const trimmed = message.trim();
  if (!trimmed) return state;
  return { ...state, serverAdvice: { message: trimmed, remaining: SERVER_ADVICE_TTL } };
}

function countRecent(window: CoachHintKind[], kind: CoachHintKind, samples: number): number {
  return window.slice(-samples).filter((v) => v === kind).length;
}

/**
 * Folds one observation into the coaching state and decides what to show.
 *
 * - A hint appears once its kind holds APPEAR_AFTER of the last APPEAR_AFTER
 *   samples (unanimous corroboration, not a majority — panning briefly past a
 *   dark wall must not trigger it).
 * - The active hint persists until it is absent for DISAPPEAR_AFTER straight
 *   samples, so it never strobes while the reading hovers on a threshold.
 * - A higher-priority problem can take over immediately once corroborated.
 */
export function pushObservation(state: CoachState, observation: CoachHintKind): CoachState {
  const window = [...state.window, observation].slice(-WINDOW);

  // Server advice ages by one sample per observation.
  const serverAdvice =
    state.serverAdvice && state.serverAdvice.remaining > 1
      ? { ...state.serverAdvice, remaining: state.serverAdvice.remaining - 1 }
      : null;

  // Which kinds are corroborated right now, in priority order?
  const corroborated = PRIORITY.filter(
    (kind) => countRecent(window, kind, APPEAR_AFTER) === APPEAR_AFTER,
  );
  const top = corroborated[0] ?? null;

  if (top) return { window, active: top, serverAdvice };

  if (state.active) {
    const absentFor = countRecent(window, state.active, DISAPPEAR_AFTER) === 0;
    const enoughSamples = window.length >= DISAPPEAR_AFTER;
    if (absentFor && enoughSamples) return { window, active: null, serverAdvice };
    return { window, active: state.active, serverAdvice };
  }

  return { window, active: null, serverAdvice };
}

/**
 * The single thing to render, or null for silence. Corroborated motion wins
 * outright; server advice borrows the slot next; image faults follow.
 */
export function currentHint(state: CoachState): CoachHint | null {
  const motionActive = state.active === 'unsteady' || state.active === 'tilted';
  if (motionActive && state.active) {
    return { kind: state.active, message: messageFor(state.active) };
  }
  if (state.serverAdvice) {
    return { kind: 'server_advice', message: state.serverAdvice.message };
  }
  if (!state.active) return null;
  return { kind: state.active, message: messageFor(state.active) };
}

/**
 * Whether the frame is good enough to encourage a shot. Used to soften — never
 * disable — the shutter: the user always keeps the final say.
 */
export function isFrameReady(state: CoachState): boolean {
  return state.active === null && state.window.length > 0;
}

// ---------------------------------------------------------------------------
// Live count pill ("~12 items"): stability rules.
//
// The count comes from a slow model on sparse samples, so raw readings jump.
// The pill only updates when two consecutive readings agree (within tolerance)
// and shows "Looking…" while readings disagree — a number that flickers
// 12→7→14 teaches the user to ignore it, which is worse than no number.
// ---------------------------------------------------------------------------

/** Readings within this relative band (or ±1 absolute) count as agreeing. */
export const COUNT_AGREE_FRACTION = 0.25;

export interface CountState {
  /** The number currently on the pill, or null before the first stable pair. */
  display: number | null;
  /** Last raw reading, awaiting corroboration. */
  candidate: number | null;
  /** True while the latest readings disagree — render "Looking…". */
  uncertain: boolean;
}

export function initialCountState(): CountState {
  return { display: null, candidate: null, uncertain: false };
}

function countsAgree(a: number, b: number): boolean {
  if (Math.abs(a - b) <= 1) return true;
  return Math.abs(a - b) / Math.max(a, b) <= COUNT_AGREE_FRACTION;
}

/**
 * Folds one server count reading in. `null` (feature off / failed call) keeps
 * whatever is displayed and never flips the pill to "Looking…" on its own —
 * absence of data is not evidence of change.
 */
export function pushCountSample(state: CountState, reading: number | null): CountState {
  if (reading === null || !Number.isFinite(reading) || reading < 0) return state;
  const count = Math.round(reading);

  if (state.candidate !== null && countsAgree(state.candidate, count)) {
    // Two consecutive agreeing readings: show the newer one.
    return { display: count, candidate: count, uncertain: false };
  }
  // Disagreement (or first reading): hold the previous number if we have one,
  // flag uncertainty only when this contradicts what is currently shown.
  const contradictsDisplay = state.display !== null && !countsAgree(state.display, count);
  return {
    display: state.display,
    candidate: count,
    uncertain: state.display === null || contradictsDisplay,
  };
}

/**
 * Defensive read of the precheck's visibleObjectCount — the server ships it
 * separately from this client, so a missing/garbage field silently turns the
 * feature off rather than breaking capture.
 */
export function parseVisibleCount(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as { visibleObjectCount?: unknown }).visibleObjectCount;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/** Density guidance copy when the server flags a crowded frame. */
export const DENSITY_ADVICE = 'Lots here — move closer and shoot in sections.';
/** The model can see things but cannot name them: distance is the fix. */
export const TOO_FAR_ADVICE = 'Move closer — items are too small to identify.';
/** A wall, a floor, the ceiling: nothing to inventory in this frame. */
export const EMPTY_FRAME_ADVICE = 'Point at a shelf, a drawer, or a corner with things in it.';

/**
 * The single piece of server guidance worth borrowing the hint slot for, or
 * null. Explicit advice wins; a bare too_many density gets the stock line.
 */
export function serverGuidance(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as { advice?: unknown; objectDensity?: unknown; quality?: unknown };
  if (typeof p.advice === 'string' && p.advice.trim()) return p.advice.trim();
  if (p.objectDensity === 'too_many') return DENSITY_ADVICE;
  if (p.quality === 'too_far') return TOO_FAR_ADVICE;
  if (p.objectDensity === 'none') return EMPTY_FRAME_ADVICE;
  return null;
}

// ---------------------------------------------------------------------------
// Always-on readiness: three plain signals the viewfinder shows at all times,
// so guidance is visible even when nothing is wrong. Hints stay rare and
// corroborated; these are the honest instantaneous read behind them.
// ---------------------------------------------------------------------------

export type SignalState = 'ok' | 'warn' | 'unknown';

export interface ReadinessSignals {
  /** Phone held still and level. */
  steady: SignalState;
  /** Focus and detail. */
  sharp: SignalState;
  /** Exposure. */
  light: SignalState;
}

const STEADY_FAULTS: CoachHintKind[] = ['unsteady', 'tilted'];
const SHARP_FAULTS: CoachHintKind[] = ['too_blurry', 'low_detail'];
const LIGHT_FAULTS: CoachHintKind[] = ['too_dark', 'too_bright'];

/**
 * Each signal warns when the LATEST sample shows its fault or when a
 * corroborated hint of that kind is still active (so the strip agrees with
 * the hint pill and never flickers green under a standing warning).
 */
export function signalStates(state: CoachState): ReadinessSignals {
  const latest = state.window[state.window.length - 1];
  if (latest === undefined) return { steady: 'unknown', sharp: 'unknown', light: 'unknown' };
  const warn = (faults: CoachHintKind[]): SignalState =>
    faults.includes(latest) || (state.active !== null && faults.includes(state.active))
      ? 'warn'
      : 'ok';
  return { steady: warn(STEADY_FAULTS), sharp: warn(SHARP_FAULTS), light: warn(LIGHT_FAULTS) };
}
