import {
  DEST_OFF,
  DEST_VOLUME,
  FILTER_LOWPASS,
  FILTER_OFF,
  LFO_TRI,
  MOD_TARGET_LEV,
  OSC_SAW,
  OSC_SIN,
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
 * These patches each isolate exactly one unknown. They are deliberately as dumb
 * as possible: a single sine operator wherever the test does not need more, no
 * envelopes unless the envelope is the thing being measured, no filter unless
 * the filter is the thing being measured, and no send effects at all. Play one,
 * step the one parameter named in `sweep`, and the recording determines that
 * curve directly.
 */
export interface CalibrationPatch {
  /** Filename stem, also the instrument name shown on the device. */
  id: string;
  /** What this recording pins down. */
  measures: string;
  /** The single parameter to step through, as it is labelled on the device. */
  sweep: string;
  /** Values to step it through. */
  values: number[];
  /** Why this one matters, and what it fixes in the code. */
  fixes: string;
  patch: M8Patch;
}

/**
 * A patch that does as little as possible: one sine carrier at unity ratio,
 * full instrument volume, no envelopes, no filter, no effects. A note sounds at
 * a steady level for as long as it is held, which is what makes the spectrum
 * readable.
 */
function bareTone(name: string): M8Patch {
  const patch = createDefaultPatch();
  patch.name = name;
  patch.algo = 0x0b; // A+B+C+D, so operator A reaches the output on its own
  patch.volume = 0xff;
  patch.operators[0] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0xff, feedback: 0x00, modA: 0x00, modB: 0x00 };
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

const EIGHT_STEPS = [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0, 0xff];

export function calibrationPatches(): CalibrationPatch[] {
  const patches: CalibrationPatch[] = [];

  // 1. Envelope decay -----------------------------------------------------
  const env = bareTone('CAL1 ENV');
  env.volume = 0x00; // the envelope supplies the whole level
  env.envelopes[0] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: 0x80, dest: DEST_VOLUME, retrigger: 0x00 };
  patches.push({
    id: 'CAL1-ENV',
    measures: 'ENV DECAY value -> seconds, and the shape of the decay',
    sweep: 'ENV1 DEC',
    // Starts at 10 rather than 00: with ATK and HOLD at 00 a decay of 00 is
    // silent, which measures nothing.
    values: [0x10, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0, 0xff],
    fixes: 'envDecaySeconds() and the AHD curve in fm-processor.js. A pure sine '
      + 'carrier means the recorded waveform IS the envelope, so both the timing '
      + 'and the curve fall straight out of it.',
    patch: env
  });

  // 2. Operator level -> modulation index ---------------------------------
  const index = bareTone('CAL2 INDEX');
  index.algo = 0x07; // [A>B]+[C>D], so A modulates B and nothing else sounds
  index.operators[0] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x00, feedback: 0x00, modA: 0x00, modB: 0x00 };
  index.operators[1] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0xff, feedback: 0x00, modA: 0x00, modB: 0x00 };
  patches.push({
    id: 'CAL2-INDEX',
    measures: 'operator LEVEL -> modulation depth, and LEVEL -> output gain',
    sweep: 'OP A LEV (then a second pass on OP B LEV with OP A back at 00)',
    values: EIGHT_STEPS,
    fixes: 'MAX_PM_CYCLES and levelToPmCycles(). A 1:1 operator pair has a '
      + 'spectrum whose harmonic amplitudes are Bessel functions of the '
      + 'modulation index, so the index can be solved exactly from the recording. '
      + 'The second pass gives levelToAmplitude(). This is the biggest single '
      + 'influence on FM timbre.',
    patch: index
  });

  // 3. Filter --------------------------------------------------------------
  const filter = bareTone('CAL3 FILT');
  filter.operators[0].shape = OSC_SAW; // broadband, so the cutoff is visible
  filter.filter = { type: FILTER_LOWPASS, cutoff: 0x80, res: 0x00 };
  patches.push({
    id: 'CAL3-FILT',
    measures: 'CUTOFF value -> hertz, the filter slope, and what RES does',
    sweep: 'FILTER CUT (then a second pass on RES with CUT at 80)',
    values: EIGHT_STEPS,
    fixes: 'cutoffHz() and the SvFilter in fm-processor.js. A saw has a known '
      + 'harmonic series, so the corner frequency and the roll-off slope read '
      + 'straight off the spectrum.',
    patch: filter
  });

  // 4. MOD bus semantics ---------------------------------------------------
  const mod = bareTone('CAL4 MOD');
  mod.operators[0].level = 0x40;
  mod.operators[0].modA = encodeModSlot(1, MOD_TARGET_LEV); // 1>LEV
  mod.mods = [0x00, 0x00, 0x00, 0x00];
  patches.push({
    id: 'CAL4-MOD',
    measures: 'whether a MOD bus adds to an operator parameter or scales it',
    sweep: 'MOD1',
    values: [0x00, 0x40, 0x80, 0xc0, 0xff],
    fixes: 'the bus model in fm-processor.js. OP A sits at LEV 40 with MOD A set '
      + 'to 1>LEV. If the output tracks LEV 40/80/C0/FF/FF it is additive, which '
      + 'is what this app assumes; anything else means the two-level modulation '
      + 'matrix is modelled wrongly, which would affect every patch that uses a '
      + 'MOD slot.',
    patch: mod
  });

  // 5. Feedback ------------------------------------------------------------
  const feedback = bareTone('CAL5 FBK');
  patches.push({
    id: 'CAL5-FBK',
    measures: 'FBK value -> feedback depth, and where the sine becomes saw then noise',
    sweep: 'OP A FB',
    values: EIGHT_STEPS,
    fixes: 'MAX_FEEDBACK_CYCLES. The harmonic series of a self-fed sine gives '
      + 'the feedback depth directly, and the point where it breaks up locates '
      + 'the top of the range.',
    patch: feedback
  });

  // 6. Operator waveforms --------------------------------------------------
  const shape = bareTone('CAL6 SHAPE');
  patches.push({
    id: 'CAL6-SHAPE',
    measures: 'the actual waveform behind each SHAPE name',
    sweep: 'OP A shape (SIN, SW2..SW6, TRI, SAW, SQR, PUL, IMP, NOI, ...)',
    values: [...Array(16).keys()],
    fixes: 'oscillator() in fm-processor.js. SW2..SW6 are currently invented -- '
      + 'sine-to-saw blends -- because there is no published description of them. '
      + 'One steady note per shape gives the harmonic series of each, which is '
      + 'enough to reproduce them properly.',
    patch: shape
  });

  // 7. LFO rate ------------------------------------------------------------
  const lfo = bareTone('CAL7 LFO');
  lfo.lfos[0] = { amount: 0xff, shape: LFO_TRI, trigger: 0x00, freq: 0x40, dest: DEST_VOLUME };
  patches.push({
    id: 'CAL7-LFO',
    measures: 'LFO FREQ value -> hertz',
    sweep: 'LFO1 FRQ',
    values: EIGHT_STEPS,
    fixes: 'lfoFreqHz(). The tremolo rate is directly countable from the '
      + 'recorded amplitude envelope.',
    patch: lfo
  });

  return patches;
}

/** A human-readable summary of one calibration patch, for the README. */
export function describeCalibration(entry: CalibrationPatch): string {
  return [
    `### ${entry.id}`,
    '',
    `**Measures:** ${entry.measures}`,
    '',
    `**Sweep:** \`${entry.sweep}\` through ${entry.values.map((v) => hex(v)).join(', ')}`,
    '',
    entry.fixes
  ].join('\n');
}
