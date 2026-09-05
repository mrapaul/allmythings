import { describe, expect, it } from 'vitest';
import { adviceFor } from './image-quality';
import {
  APPEAR_AFTER,
  type CoachHintKind,
  type CoachState,
  DENSITY_ADVICE,
  DISAPPEAR_AFTER,
  EMPTY_FRAME_ADVICE,
  SERVER_ADVICE_TTL,
  TILT_DEGREES,
  TOO_FAR_ADVICE,
  UNSTEADY_G,
  currentHint,
  initialCoachState,
  initialCountState,
  isFrameReady,
  magnitudeOf,
  messageFor,
  motionVerdict,
  parseVisibleCount,
  pushCountSample,
  pushObservation,
  pushServerAdvice,
  serverGuidance,
  signalStates,
  tiltFromGravity,
} from './live-coaching';

/** Feeds a sequence of observations through the reducer. */
function feed(observations: CoachHintKind[], from: CoachState = initialCoachState()): CoachState {
  return observations.reduce((state, o) => pushObservation(state, o), from);
}

const repeat = (kind: CoachHintKind, n: number): CoachHintKind[] =>
  Array.from({ length: n }, () => kind);

describe('hysteresis — appearing', () => {
  it('stays silent until a fault is corroborated', () => {
    for (let n = 1; n < APPEAR_AFTER; n++) {
      expect(currentHint(feed(repeat('too_dark', n)))).toBeNull();
    }
    expect(currentHint(feed(repeat('too_dark', APPEAR_AFTER)))?.kind).toBe('too_dark');
  });

  it('ignores an isolated bad sample amid good ones (panning past a dark wall)', () => {
    const state = feed(['ok', 'ok', 'too_dark', 'ok', 'ok', 'too_dark', 'ok']);
    expect(currentHint(state)).toBeNull();
  });

  it('requires the fault to be unanimous, not merely frequent', () => {
    // 2 of the last 3 are dark — not enough.
    expect(currentHint(feed(['too_dark', 'ok', 'too_dark']))).toBeNull();
  });
});

describe('hysteresis — disappearing', () => {
  it('keeps the hint while the reading flickers around the threshold', () => {
    let state = feed(repeat('too_blurry', APPEAR_AFTER));
    expect(currentHint(state)?.kind).toBe('too_blurry');
    // Intermittent recovery must not clear it.
    state = feed(['ok', 'ok', 'too_blurry', 'ok', 'ok'], state);
    expect(currentHint(state)?.kind).toBe('too_blurry');
  });

  it('clears only after a sustained run of clean samples', () => {
    let state = feed(repeat('too_blurry', APPEAR_AFTER));
    state = feed(repeat('ok', DISAPPEAR_AFTER - 1), state);
    expect(currentHint(state)?.kind).toBe('too_blurry');
    state = pushObservation(state, 'ok');
    expect(currentHint(state)).toBeNull();
  });

  it('is slower to appear than to disappear is forgiving — no strobing', () => {
    expect(DISAPPEAR_AFTER).toBeGreaterThan(APPEAR_AFTER);
  });
});

describe('priority', () => {
  it('prefers preventable motion over image faults', () => {
    const state = feed(
      Array.from({ length: APPEAR_AFTER }, () => 'unsteady' as CoachHintKind).concat(
        repeat('too_dark', 0),
      ),
    );
    expect(currentHint(state)?.kind).toBe('unsteady');
  });

  it('lets a higher-priority fault take over once corroborated', () => {
    let state = feed(repeat('too_blurry', APPEAR_AFTER));
    expect(currentHint(state)?.kind).toBe('too_blurry');
    state = feed(repeat('too_dark', APPEAR_AFTER), state);
    expect(currentHint(state)?.kind).toBe('too_dark');
  });

  it('mirrors analyzeQuality ordering: exposure before focus', () => {
    // Alternating dark/blurry never corroborates either; feed dark solidly.
    const state = feed(repeat('too_dark', APPEAR_AFTER));
    expect(currentHint(state)?.kind).toBe('too_dark');
  });
});

describe('copy', () => {
  it('reuses the post-capture advice verbatim so the two never contradict', () => {
    expect(messageFor('too_dark')).toBe(adviceFor('too_dark'));
    expect(messageFor('too_blurry')).toBe(adviceFor('too_blurry'));
    expect(messageFor('low_detail')).toBe(adviceFor('low_detail'));
  });

  it('has its own copy for the motion hints', () => {
    expect(messageFor('unsteady')).toBe('Hold still a moment');
    expect(messageFor('tilted')).toBe('Straighten up a little');
  });
});

describe('silence as the reward', () => {
  it('reports the frame ready only once something has been observed', () => {
    expect(isFrameReady(initialCoachState())).toBe(false);
    expect(isFrameReady(feed(repeat('ok', 3)))).toBe(true);
    expect(isFrameReady(feed(repeat('too_dark', APPEAR_AFTER)))).toBe(false);
  });
});

describe('server advice — borrowed slot with TTL', () => {
  it('takes the hint slot when nothing is corroborated, then yields back', () => {
    let state = pushServerAdvice(feed(repeat('ok', 3)), DENSITY_ADVICE);
    expect(currentHint(state)?.kind).toBe('server_advice');
    expect(currentHint(state)?.message).toBe(DENSITY_ADVICE);

    // Ages by one per observation; expires after SERVER_ADVICE_TTL.
    state = feed(repeat('ok', SERVER_ADVICE_TTL), state);
    expect(currentHint(state)).toBeNull();
  });

  it('yields the slot to corroborated motion — hold-still outranks density', () => {
    let state = pushServerAdvice(initialCoachState(), DENSITY_ADVICE);
    state = feed(repeat('unsteady', APPEAR_AFTER), state);
    expect(currentHint(state)?.kind).toBe('unsteady');
  });

  it('outranks a mere image fault while alive', () => {
    let state = feed(repeat('too_blurry', APPEAR_AFTER));
    state = pushServerAdvice(state, DENSITY_ADVICE);
    expect(currentHint(state)?.kind).toBe('server_advice');
    // …and the image hint resurfaces once the advice expires.
    state = feed(repeat('too_blurry', SERVER_ADVICE_TTL), state);
    expect(currentHint(state)?.kind).toBe('too_blurry');
  });

  it('ignores blank advice', () => {
    expect(pushServerAdvice(initialCoachState(), '  ').serverAdvice).toBeNull();
  });
});

describe('count pill stability', () => {
  it('shows nothing until two consecutive readings agree', () => {
    let state = pushCountSample(initialCountState(), 12);
    expect(state.display).toBeNull();
    expect(state.uncertain).toBe(true); // "Looking…"
    state = pushCountSample(state, 13);
    expect(state.display).toBe(13);
    expect(state.uncertain).toBe(false);
  });

  it('holds the shown number through a single outlier, then follows a stable new pair', () => {
    let state = pushCountSample(pushCountSample(initialCountState(), 12), 12);
    expect(state.display).toBe(12);
    // One wild reading: keep 12, mark uncertain.
    state = pushCountSample(state, 30);
    expect(state.display).toBe(12);
    expect(state.uncertain).toBe(true);
    // The wild reading corroborated: move.
    state = pushCountSample(state, 31);
    expect(state.display).toBe(31);
    expect(state.uncertain).toBe(false);
  });

  it('treats close readings as agreement (±1 or 25%)', () => {
    let state = pushCountSample(initialCountState(), 4);
    state = pushCountSample(state, 5); // diff 1 → agree
    expect(state.display).toBe(5);
  });

  it('ignores null/garbage readings without disturbing the pill', () => {
    let state = pushCountSample(pushCountSample(initialCountState(), 10), 10);
    state = pushCountSample(state, null);
    state = pushCountSample(state, Number.NaN);
    state = pushCountSample(state, -3);
    expect(state.display).toBe(10);
    expect(state.uncertain).toBe(false);
  });
});

describe('defensive precheck parsing', () => {
  it('reads visibleObjectCount only when it is a sane number', () => {
    expect(parseVisibleCount({ visibleObjectCount: 12 })).toBe(12);
    expect(parseVisibleCount({ visibleObjectCount: 11.6 })).toBe(12);
    expect(parseVisibleCount({})).toBeNull(); // server hasn't shipped it
    expect(parseVisibleCount({ visibleObjectCount: 'many' })).toBeNull();
    expect(parseVisibleCount({ visibleObjectCount: -2 })).toBeNull();
    expect(parseVisibleCount(null)).toBeNull();
  });

  it('extracts the single guidance line: advice first, then density', () => {
    expect(serverGuidance({ advice: 'Step back a little.' })).toBe('Step back a little.');
    expect(serverGuidance({ advice: '', objectDensity: 'too_many' })).toBe(DENSITY_ADVICE);
    expect(serverGuidance({ objectDensity: 'many' })).toBeNull();
    expect(serverGuidance(undefined)).toBeNull();
  });
});

describe('motion thresholds', () => {
  it('treats resting tremor as steady and real movement as unsteady', () => {
    expect(motionVerdict({ magnitude: 1.0, tiltDegrees: 0 })).toBeNull();
    expect(motionVerdict({ magnitude: 1 + UNSTEADY_G / 2, tiltDegrees: 0 })).toBeNull();
    expect(motionVerdict({ magnitude: 1 + UNSTEADY_G * 2, tiltDegrees: 0 })).toBe('unsteady');
    // Free-fall / sharp downward jerk is just as unsteady as an upward one.
    expect(motionVerdict({ magnitude: 1 - UNSTEADY_G * 2, tiltDegrees: 0 })).toBe('unsteady');
  });

  it('flags tilt only past the threshold, and after steadiness', () => {
    expect(motionVerdict({ magnitude: 1, tiltDegrees: TILT_DEGREES - 1 })).toBeNull();
    expect(motionVerdict({ magnitude: 1, tiltDegrees: TILT_DEGREES + 5 })).toBe('tilted');
    // Movement dominates: no point straightening a phone that is still moving.
    expect(motionVerdict({ magnitude: 1.5, tiltDegrees: 45 })).toBe('unsteady');
  });

  it('derives tilt from gravity for upright and rolled phones', () => {
    expect(tiltFromGravity(0, -1)).toBeCloseTo(0, 1);
    expect(tiltFromGravity(0.5, -0.866)).toBeCloseTo(30, 0);
    expect(tiltFromGravity(-0.5, -0.866)).toBeCloseTo(30, 0);
    // Upside-down still reads as a small tilt, not 180°.
    expect(tiltFromGravity(0, 1)).toBeCloseTo(0, 1);
  });

  it('computes accelerometer magnitude', () => {
    expect(magnitudeOf(0, -1, 0)).toBeCloseTo(1, 5);
    expect(magnitudeOf(0.6, 0.8, 0)).toBeCloseTo(1, 5);
  });
});

describe('readiness signals', () => {
  it('reports unknown before any sample', () => {
    expect(signalStates(initialCoachState())).toEqual({
      steady: 'unknown',
      sharp: 'unknown',
      light: 'unknown',
    });
  });

  it('flags the one signal behind the latest observation', () => {
    expect(signalStates(feed(['ok', 'too_dark']))).toEqual({
      steady: 'ok',
      sharp: 'ok',
      light: 'warn',
    });
    expect(signalStates(feed(['ok', 'unsteady'])).steady).toBe('warn');
    expect(signalStates(feed(['ok', 'tilted'])).steady).toBe('warn');
    expect(signalStates(feed(['ok', 'too_blurry'])).sharp).toBe('warn');
    expect(signalStates(feed(['ok', 'low_detail'])).sharp).toBe('warn');
    expect(signalStates(feed(['ok', 'too_bright'])).light).toBe('warn');
  });

  it('keeps a corroborated hint warning until it clears, even on a single ok sample', () => {
    const state = feed([...repeat('too_dark', APPEAR_AFTER), 'ok']);
    expect(signalStates(state).light).toBe('warn');
    expect(
      signalStates(feed([...repeat('too_dark', APPEAR_AFTER), ...repeat('ok', DISAPPEAR_AFTER)]))
        .light,
    ).toBe('ok');
  });
});

describe('framing guidance from the precheck', () => {
  it('asks the user to move closer when the server says too far', () => {
    expect(serverGuidance({ quality: 'too_far' })).toBe(TOO_FAR_ADVICE);
  });

  it('asks for a real scene when nothing is in frame', () => {
    expect(serverGuidance({ objectDensity: 'none' })).toBe(EMPTY_FRAME_ADVICE);
  });

  it('still prefers explicit server advice', () => {
    expect(serverGuidance({ quality: 'too_far', advice: 'Step back a little' })).toBe(
      'Step back a little',
    );
  });
});

describe('overlap memory hint', () => {
  it('appears once corroborated and yields to a real fault', () => {
    const state = feed(repeat('overlap', APPEAR_AFTER));
    expect(currentHint(state)?.message).toBe('You already shot this area');
    expect(isFrameReady(state)).toBe(false);
    const dark = feed(repeat('too_dark', APPEAR_AFTER), state);
    expect(currentHint(dark)?.kind).toBe('too_dark');
  });
});
