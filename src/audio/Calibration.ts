import {
  DEST_OFF,
  DEST_VOLUME,
  FILTER_LOWPASS,
  FILTER_OFF,
  LFO_TRI,
  MOD_TARGET_LEV,
  OSC_SAW,
  OSC_SIN,
  clonePatch,
  createDefaultPatch,
  encodeModSlot,
  hex
} from './M8Patch';
import type { M8Patch } from './M8Patch';

/**
 * Calibration instruments for measuring a real M8 against this app.
 *
 * Every conversion curve in M8Patch.ts is a guess -- Dirtywave does not publish
 * how a 0x00-0xFF parameter maps to seconds, hertz or modulation depth. A
 * recording of a musical patch cannot settle them, because it is affected by all
 * of them at once and wrong curves can cancel each other out.
 *
 * Each test here isolates exactly one unknown. The patches are deliberately as
 * dumb as possible: a single sine operator wherever the test does not need more,
 * no envelope unless the envelope is the thing being measured, no filter unless
 * the filter is being measured, and no send effects at all.
 *
 * `apply` stamps one sweep value into a copy of the base patch, which is what
 * lets the whole sweep be baked into a song as one instrument per measurement
 * point -- so recording it is a matter of pressing play, not of turning a knob
 * between every note.
 */
export interface CalibrationTest {
  /** Filename stem and manifest key. */
  id: string;
  /** What this measurement pins down. */
  measures: string;
  /** The parameter being stepped, as it is labelled on the device. */
  parameter: string;
  /** Values to step it through. */
  values: number[];
  /** Why it matters, and what it fixes in the code. */
  fixes: string;
  /** How many 16-step phrases each measurement needs. */
  phrases: number;
  /**
   * True when every step of this sweep produces an unmodulated sine, so a crest
   * factor below 1.41 means something in the chain flattened it. A square wave
   * is legitimately 1.00 and an FM tone legitimately lower, so the check is
   * meaningless anywhere else.
   */
  expectPureSine: boolean;
  /** The starting point every sweep value is stamped into. */
  patch: M8Patch;
  apply: (patch: M8Patch, value: number) => void;
}

/**
 * Headroom for every operator that is not itself being swept.
 *
 * Measured: a plain sine at LEV C0 comes out with a crest factor of 1.41, and at
 * E0 and FF it flattens to 1.13 and 1.06 -- the operator output is clipping
 * before it reaches the filter, so no amount of turning the recording level down
 * would have helped. Anything measured from a clipped waveform's spectrum is
 * worthless, so the calibration instruments sit a comfortable margin below that
 * ceiling and the recording level is not something the person recording has to
 * think about.
 */
export const CALIBRATION_LEVEL = 0xa0;

/**
 * A patch that does as little as possible: one sine carrier at unity ratio, no
 * envelopes, no filter, no effects. A note sounds at a steady level for as long
 * as it is held, which is what makes the spectrum readable, and the sequencer
 * cuts it by triggering a silent instrument.
 */
export function bareTone(name: string): M8Patch {
  const patch = createDefaultPatch();
  patch.name = name;
  patch.algo = 0x0b; // A+B+C+D, so operator A reaches the output on its own
  patch.volume = 0xff;
  patch.operators[0] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: CALIBRATION_LEVEL, feedback: 0x00, modA: 0x00, modB: 0x00 };
  patch.filter = { type: FILTER_OFF, cutoff: 0xff, res: 0x00 };
  patch.envelopes.forEach((env) => {
    env.dest = DEST_OFF;
    env.amount = 0xff;
    env.attack = 0x00;
    env.hold = 0x00;
    env.decay = 0x80;
  });
  patch.lfos.forEach((lfo) => {
    lfo.dest = DEST_OFF;
    lfo.amount = 0x00;
  });
  patch.mixer = { amp: 0x00, lim: 0x00, pan: 0x80, dry: 0xc0, cho: 0x00, del: 0x00, rev: 0x00 };
  return patch;
}

/** An instrument that makes no sound, used to cut the note before the next one. */
export function silentInstrument(): M8Patch {
  const patch = bareTone('CAL SILENT');
  patch.volume = 0x00;
  patch.operators.forEach((op) => {
    op.level = 0x00;
  });
  return patch;
}

const NINE_STEPS = [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0, 0xff];

export function calibrationTests(): CalibrationTest[] {
  const tests: CalibrationTest[] = [];

  // 1. Envelope decay -----------------------------------------------------
  const envelopeBase = bareTone('CAL1 ENV');
  envelopeBase.volume = 0x00; // the envelope supplies the whole level
  envelopeBase.envelopes[0] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: 0x80, dest: DEST_VOLUME, retrigger: 0x00 };
  tests.push({
    id: 'CAL1-ENV',
    measures: 'ENV DECAY value -> seconds, and the shape of the decay',
    parameter: 'ENV1 DEC',
    // Starts at 10 rather than 00: with ATK and HOLD at 00 a decay of 00 is
    // silent, which measures nothing.
    values: [0x10, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0, 0xff],
    fixes: 'envDecaySeconds() and the AHD curve in fm-processor.js. A pure sine '
      + 'carrier means the recorded waveform IS the envelope, so the timing and '
      + 'the curve shape both fall straight out of it.',
    phrases: 4, // long decays need room to finish before the next note
    expectPureSine: true,
    patch: envelopeBase,
    apply: (patch, value) => {
      patch.envelopes[0].decay = value;
    }
  });

  // 2. Operator level -> modulation index ---------------------------------
  const index = bareTone('CAL2 INDEX');
  index.algo = 0x07; // [A>B]+[C>D], so A modulates B and nothing else sounds
  index.operators[0] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x00, feedback: 0x00, modA: 0x00, modB: 0x00 };
  index.operators[1] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: CALIBRATION_LEVEL, feedback: 0x00, modA: 0x00, modB: 0x00 };
  tests.push({
    id: 'CAL2-INDEX',
    measures: 'operator LEVEL -> modulation depth',
    parameter: 'OP A LEV',
    values: NINE_STEPS,
    fixes: 'MAX_PM_CYCLES and levelToPmCycles(). A 1:1 operator pair has a '
      + 'spectrum whose harmonic amplitudes are Bessel functions of the '
      + 'modulation index, so the index is solvable exactly from the recording. '
      + 'This is the single biggest influence on FM timbre.',
    phrases: 1,
    expectPureSine: false,
    patch: index,
    apply: (patch, value) => {
      patch.operators[0].level = value;
    }
  });

  // 3. Operator level -> output gain ---------------------------------------
  tests.push({
    id: 'CAL3-GAIN',
    measures: 'carrier LEVEL -> output gain',
    parameter: 'OP A LEV',
    values: NINE_STEPS,
    fixes: 'levelToAmplitude(). Currently assumed linear. The same operator with '
      + 'nothing modulating it, so only its own level affects the result.',
    phrases: 1,
    expectPureSine: true,
    patch: bareTone('CAL3 GAIN'),
    apply: (patch, value) => {
      patch.operators[0].level = value;
    }
  });

  // 4. Filter cutoff -------------------------------------------------------
  const cutoff = bareTone('CAL4 CUT');
  cutoff.operators[0].shape = OSC_SAW; // broadband, so the corner is visible
  cutoff.filter = { type: FILTER_LOWPASS, cutoff: 0x80, res: 0x00 };
  tests.push({
    id: 'CAL4-CUT',
    measures: 'CUTOFF value -> hertz, and the filter slope',
    parameter: 'FILTER CUT',
    values: NINE_STEPS,
    fixes: 'cutoffHz() and the SvFilter in fm-processor.js. A saw has a known '
      + 'harmonic series, so the corner frequency and the roll-off read straight '
      + 'off the spectrum.',
    phrases: 1,
    expectPureSine: false,
    patch: cutoff,
    apply: (patch, value) => {
      patch.filter.cutoff = value;
    }
  });

  // 5. Filter resonance ----------------------------------------------------
  const resonance = bareTone('CAL5 RES');
  resonance.operators[0].shape = OSC_SAW;
  resonance.filter = { type: FILTER_LOWPASS, cutoff: 0x80, res: 0x00 };
  tests.push({
    id: 'CAL5-RES',
    measures: 'what RES does, and whether it is self-oscillating at the top',
    parameter: 'FILTER RES',
    values: NINE_STEPS,
    fixes: 'the resonance term in SvFilter. Cutoff is parked at 80 so only RES '
      + 'changes.',
    phrases: 1,
    expectPureSine: false,
    patch: resonance,
    apply: (patch, value) => {
      patch.filter.res = value;
    }
  });

  // 6. MOD bus semantics ---------------------------------------------------
  const modBus = bareTone('CAL6 MOD');
  modBus.operators[0].level = 0x40;
  modBus.operators[0].modA = encodeModSlot(1, MOD_TARGET_LEV); // 1>LEV
  tests.push({
    id: 'CAL6-MOD',
    measures: 'whether a MOD bus adds to an operator parameter or scales it',
    parameter: 'MOD1',
    values: [0x00, 0x40, 0x80, 0xc0, 0xff],
    fixes: 'the bus model in fm-processor.js. OP A sits at LEV 40 with MOD A set '
      + 'to 1>LEV. If the output tracks LEV 40/80/C0/FF/FF it is additive, which '
      + 'is what this app assumes; anything else means the two-level modulation '
      + 'matrix is modelled wrongly, which affects every patch using a MOD slot.',
    phrases: 1,
    expectPureSine: true,
    patch: modBus,
    apply: (patch, value) => {
      patch.mods[0] = value;
    }
  });

  // 7. Feedback ------------------------------------------------------------
  tests.push({
    id: 'CAL7-FBK',
    measures: 'FBK value -> feedback depth, and where sine becomes saw then noise',
    parameter: 'OP A FB',
    values: NINE_STEPS,
    fixes: 'MAX_FEEDBACK_CYCLES. The harmonic series of a self-fed sine gives the '
      + 'feedback depth, and the point where it breaks up locates the top of the '
      + 'range.',
    phrases: 1,
    expectPureSine: false,
    patch: bareTone('CAL7 FBK'),
    apply: (patch, value) => {
      patch.operators[0].feedback = value;
    }
  });

  // 8. Operator waveforms --------------------------------------------------
  tests.push({
    id: 'CAL8-SHAPE',
    measures: 'the actual waveform behind each SHAPE name',
    parameter: 'OP A shape',
    values: [...Array(16).keys()],
    fixes: 'oscillator() in fm-processor.js. SW2..SW6 are currently invented -- '
      + 'sine-to-saw blends -- because there is no published description of them. '
      + 'One steady note per shape gives the harmonic series of each, which is '
      + 'enough to reproduce them properly.',
    phrases: 1,
    expectPureSine: false,
    patch: bareTone('CAL8 SHAPE'),
    apply: (patch, value) => {
      patch.operators[0].shape = value;
    }
  });

  // 9. LFO rate ------------------------------------------------------------
  const lfo = bareTone('CAL9 LFO');
  // Half depth rather than full: at AMT FF the tremolo dips to silence every
  // cycle, which reads as a run of separate notes. Half depth measures the rate
  // just as well and stays continuous.
  lfo.lfos[0] = { amount: 0x80, shape: LFO_TRI, trigger: 0x00, freq: 0x40, dest: DEST_VOLUME };
  tests.push({
    id: 'CAL9-LFO',
    measures: 'LFO FREQ value -> hertz',
    parameter: 'LFO1 FRQ',
    // Skips the bottom of the range: below about 0.2 Hz a cycle is longer than
    // the note, so there is nothing to count.
    values: [0x40, 0x60, 0x80, 0x98, 0xb0, 0xc8, 0xe0, 0xf0, 0xff],
    fixes: 'lfoFreqHz(). The tremolo rate is directly countable from the recorded '
      + 'amplitude envelope.',
    phrases: 2, // slow rates need a couple of cycles to be countable
    expectPureSine: false,
    patch: lfo,
    apply: (patch, value) => {
      patch.lfos[0].freq = value;
    }
  });

  return tests;
}

/** One measurement point: a patch, and what it is a measurement of. */
export interface SweepPoint {
  test: string;
  parameter: string;
  value: number;
  label: string;
  phrases: number;
  expectPureSine: boolean;
  patch: M8Patch;
}

/** Expands every test into one patch per sweep value. */
export function calibrationSweep(tests = calibrationTests()): SweepPoint[] {
  const points: SweepPoint[] = [];
  for (const test of tests) {
    for (const value of test.values) {
      const patch = clonePatch(test.patch);
      test.apply(patch, value);
      points.push({
        test: test.id,
        parameter: test.parameter,
        value,
        label: `${test.parameter} = ${hex(value)}`,
        phrases: test.phrases,
        expectPureSine: test.expectPureSine,
        patch
      });
    }
  }
  return points;
}

/** A human-readable summary of one calibration test, for the README. */
export function describeCalibration(test: CalibrationTest): string {
  return [
    `### ${test.id}`,
    '',
    `**Measures:** ${test.measures}`,
    '',
    `**Steps \`${test.parameter}\` through:** ${test.values.map((v) => hex(v)).join(', ')}`,
    '',
    test.fixes
  ].join('\n');
}
