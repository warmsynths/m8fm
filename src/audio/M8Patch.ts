/**
 * Canonical M8 FMSYNTH patch model.
 *
 * Every field here holds the *raw M8 parameter value* exactly as it is shown on
 * the device (0x00-0xFF for most things, 0-15 for enum-ish fields). This module
 * is the single source of truth shared by:
 *
 *   - FmEngine     (renders the patch through the Web Audio worklet)
 *   - M8Serializer (writes the patch to a .m8i file)
 *   - the UI       (displays the patch as hex)
 *
 * Keeping one representation is the whole point: what the UI prints is byte for
 * byte what lands in the .m8i and what you would type into the hardware, and the
 * audio engine is driven from those same numbers rather than a parallel set of
 * "audio friendly" floats that could drift out of sync.
 */

/** FMSYNTH algorithms, indexed by the raw ALGO value. */
export const M8_ALGOS = [
  'A>B>C>D',           // 0x00
  '[A+B]>C>D',         // 0x01
  '[A>B+C]>D',         // 0x02
  '[A>B+A>C]>D',       // 0x03
  '[A+B+C]>D',         // 0x04
  '[A>B>C]+D',         // 0x05
  '[A>B>C]+[A>B>D]',   // 0x06
  '[A>B]+[C>D]',       // 0x07
  '[A>B]+[A>C]+[A>D]', // 0x08
  '[A>B]+[A>C]+D',     // 0x09
  '[A>B]+C+D',         // 0x0A
  'A+B+C+D'            // 0x0B
];

/**
 * Operator MOD slot values. `N▸DEST` means "MOD bus N modulates my DEST".
 * Index is the raw value stored in the operator's MOD A / MOD B field.
 */
export const M8_MOD_SLOTS = [
  '-----',
  '1▸LEV', '2▸LEV', '3▸LEV', '4▸LEV',
  '1▸RAT', '2▸RAT', '3▸RAT', '4▸RAT',
  '1▸PIT', '2▸PIT', '3▸PIT', '4▸PIT',
  '1▸FBK', '2▸FBK', '3▸FBK', '4▸FBK'
];

export const MOD_TARGET_LEV = 0;
export const MOD_TARGET_RAT = 1;
export const MOD_TARGET_PIT = 2;
export const MOD_TARGET_FBK = 3;

/** Decodes a MOD slot value into `{ bus: 1..4, target: MOD_TARGET_* }`, or null for `-----`. */
export function decodeModSlot(slot: number): { bus: number; target: number } | null {
  if (!slot || slot < 1 || slot > 16) return null;
  return { bus: ((slot - 1) % 4) + 1, target: Math.floor((slot - 1) / 4) };
}

/** Builds a MOD slot value from a bus (1..4) and a MOD_TARGET_* constant. */
export function encodeModSlot(bus: number, target: number): number {
  return target * 4 + bus;
}

export function modSlotToString(slot: number | undefined): string {
  if (slot === undefined || slot < 0 || slot >= M8_MOD_SLOTS.length) return M8_MOD_SLOTS[0];
  return M8_MOD_SLOTS[slot];
}

/** Envelope / LFO destinations for FMSYNTH, indexed by the raw DEST value. */
export const M8_ENV_DESTS = [
  'OFF', 'VOLUME', 'PITCH', 'MOD 1', 'MOD 2', 'MOD 3', 'MOD 4',
  'CUTOFF', 'RES', 'AMP', 'PAN'
];

export const DEST_OFF = 0x00;
export const DEST_VOLUME = 0x01;
export const DEST_PITCH = 0x02;
export const DEST_MOD1 = 0x03;
export const DEST_MOD2 = 0x04;
export const DEST_MOD3 = 0x05;
export const DEST_MOD4 = 0x06;
export const DEST_CUTOFF = 0x07;
export const DEST_RES = 0x08;
export const DEST_AMP = 0x09;
export const DEST_PAN = 0x0a;

/** Operator oscillator shapes, indexed by the raw SHAPE value. */
export const M8_OSC_SHAPES = [
  'SIN', 'SW2', 'SW3', 'SW4', 'SW5', 'SW6', 'TRI', 'SAW',
  'SQR', 'PUL', 'IMP', 'NOI', 'NLP', 'NHP', 'NBP', 'CLK'
];

export const OSC_SIN = 0x00;
export const OSC_TRI = 0x06;
export const OSC_SAW = 0x07;
export const OSC_SQR = 0x08;
export const OSC_NOI = 0x0b;

/** LFO shapes, indexed by the raw LFO SHAPE value. */
export const M8_LFO_SHAPES = [
  'TRI', 'SIN', 'RAMP DN', 'RAMP UP', 'EXP DN', 'EXP UP', 'SQU DN', 'SQU UP',
  'RANDOM', 'DRUNK', 'TRI T', 'SIN T', 'RAMPD T', 'RAMPU T', 'EXPD T', 'EXPU T',
  'SQ. D T', 'SQ. U T', 'RAND T', 'DRNK T'
];

export const LFO_TRI = 0x00;
export const LFO_SIN = 0x01;
export const LFO_RAMP_DN = 0x02;
export const LFO_RAMP_UP = 0x03;
export const LFO_SQU_DN = 0x06;
export const LFO_RANDOM = 0x08;

export const M8_LFO_TRIGGERS = ['FREE', 'RETRIG', 'HOLD', 'ONCE'];

/** Filter types, indexed by the raw FILTER TYPE value. */
export const M8_FILTER_TYPES = ['OFF', 'LOWPASS', 'HIGHPASS', 'BANDPASS', 'BANDSTOP', 'LP>HP'];

export const FILTER_OFF = 0x00;
export const FILTER_LOWPASS = 0x01;
export const FILTER_HIGHPASS = 0x02;
export const FILTER_BANDPASS = 0x03;
export const FILTER_BANDSTOP = 0x04;

export interface M8Operator {
  /** Index into M8_OSC_SHAPES. */
  shape: number;
  /** Integer part of the pitch ratio, as shown left of the decimal point. */
  ratio: number;
  /** Hundredths of the pitch ratio (0-99), as shown right of the decimal point. */
  ratioFine: number;
  /** 0x00-0xFF. Output level for a carrier, modulation depth for a modulator. */
  level: number;
  /** 0x00-0xFF self-feedback. Morphs the oscillator sine towards saw, then noise. */
  feedback: number;
  /** MOD A slot, index into M8_MOD_SLOTS. */
  modA: number;
  /** MOD B slot, index into M8_MOD_SLOTS. */
  modB: number;
}

export interface M8Envelope {
  /** 0x00-0xFF modulation depth applied to `dest`. */
  amount: number;
  attack: number;
  hold: number;
  decay: number;
  /** Index into M8_ENV_DESTS. */
  dest: number;
  retrigger: number;
}

export interface M8Lfo {
  amount: number;
  /** Index into M8_LFO_SHAPES. */
  shape: number;
  /** Index into M8_LFO_TRIGGERS. */
  trigger: number;
  freq: number;
  /** Index into M8_ENV_DESTS. */
  dest: number;
}

export interface M8Filter {
  /** Index into M8_FILTER_TYPES. */
  type: number;
  cutoff: number;
  res: number;
}

export interface M8Mixer {
  amp: number;
  lim: number;
  pan: number;
  dry: number;
  cho: number;
  del: number;
  rev: number;
}

export interface M8Patch {
  name: string;
  /** Instrument VOLUME (0x00-0xFF). The M8 default is 0x00 with ENV1 driving VOLUME. */
  volume: number;
  pitch: number;
  fineTune: number;
  /** Index into M8_ALGOS. */
  algo: number;
  /** The four MOD bus base amounts, MOD1..MOD4. */
  mods: [number, number, number, number];
  /** Operators A, B, C, D. */
  operators: M8Operator[];
  filter: M8Filter;
  mixer: M8Mixer;
  /** ENV1 and ENV2. */
  envelopes: M8Envelope[];
  /** LFO1 and LFO2. */
  lfos: M8Lfo[];
}

/** Formats an M8 parameter as the two-digit uppercase hex the device shows. */
export function hex(v: number): string {
  return clampByte(v).toString(16).toUpperCase().padStart(2, '0');
}

export function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Formats an operator's ratio the way the M8 prints it, e.g. `03.50`. */
export function ratioToString(op: M8Operator): string {
  return `${String(op.ratio).padStart(2, '0')}.${String(op.ratioFine).padStart(2, '0')}`;
}

/** The ratio as a plain pitch multiplier. */
export function ratioToMultiplier(op: M8Operator): number {
  return op.ratio + op.ratioFine / 100;
}

/** Splits a pitch multiplier back into the M8's integer + hundredths pair. */
export function multiplierToRatio(mult: number): { ratio: number; ratioFine: number } {
  const clamped = Math.max(0, Math.min(99.99, mult));
  const ratio = Math.floor(clamped);
  return { ratio, ratioFine: Math.round((clamped - ratio) * 100) };
}

/* ------------------------------------------------------------------------- *
 * Unit conversions
 *
 * These decide what a raw M8 value means. Everything -- the UI, the .m8i export
 * and the audio preview -- goes through the same functions, so a value cannot
 * mean one thing on screen and another in the file.
 *
 * Where a curve is marked MEASURED it was fitted from a recording of real
 * hardware playing calibration/M8FM-CALIBRATION.m8s; see
 * tools/fit-hardware-curves.mjs, which reproduces the fits. The rest are still
 * estimates, and are marked as such.
 * ------------------------------------------------------------------------- */

/**
 * MEASURED. The M8's AHD decay is a pure exponential, and its rate is inversely
 * proportional to the DEC value:
 *
 *     rate = 2888 / DEC  decibels per second
 *
 * That product held constant to 0.1% across the whole range (DEC 0x10 to 0xFF),
 * which is about as clean as a fit gets. Rearranged, the time to fall 60 dB --
 * far enough below the peak to count as gone -- is simply proportional to DEC.
 *
 * This replaced a cubic curve that was wrong at both ends: it made short decays
 * far too short (DEC 0x10 came out at 2 ms against the real 0.33 s) and long
 * ones too long.
 */
const DECAY_DB_PER_SECOND_NUMERATOR = 2888;
/** Seconds of 60 dB decay per unit of DEC. */
export const DECAY_SECONDS_PER_UNIT = 60 / DECAY_DB_PER_SECOND_NUMERATOR;

/**
 * Time for an envelope to fall 60 dB, which is where this engine treats a note
 * as finished.
 */
export function envDecaySeconds(v: number): number {
  return clampByte(v) * DECAY_SECONDS_PER_UNIT;
}

export function secondsToEnvDecay(seconds: number): number {
  return clampByte(Math.max(0, seconds) / DECAY_SECONDS_PER_UNIT);
}

/**
 * ESTIMATE. Attack and hold were not part of the calibration sweep, so they are
 * assumed to share the decay's linear scaling. That is a guess, but a far safer
 * one than the old cubic, which is now known to be the wrong shape for the one
 * time parameter that was measured.
 */
export function envAttackSeconds(v: number): number {
  return clampByte(v) * DECAY_SECONDS_PER_UNIT;
}

export function envHoldSeconds(v: number): number {
  return clampByte(v) * DECAY_SECONDS_PER_UNIT;
}

export function secondsToEnvAttack(seconds: number): number {
  return secondsToEnvDecay(seconds);
}

/**
 * MEASURED. A MOD bus *scales* the parameter it is wired to; it does not add to
 * it.
 *
 * With operator A at LEV 40 and MOD A set to `1▸LEV`, sweeping MOD1 through
 * 00/40/80/C0/FF gave output levels of 0, 1/4, 2/4, 3/4 and 4/4 of what LEV 40
 * produces on its own -- so the operator is silent when its bus is at zero,
 * whatever its own LEVEL says.
 *
 * This app previously assumed the bus was added to the level, which is a large
 * difference in practice: a patch whose bus rests at zero sounds normal under
 * the additive reading and is silent on the device.
 */
export const MOD_BUS_SCALES_LEVEL = true;

const LFO_MIN_HZ = 0.05;
const LFO_MAX_HZ = 20.0;

/** LFO FREQ is exponential: 0x00 is a slow sweep, 0xFF is audio-rate wobble. */
export function lfoFreqHz(v: number): number {
  const x = clampByte(v) / 255;
  return LFO_MIN_HZ * Math.pow(LFO_MAX_HZ / LFO_MIN_HZ, x);
}

export function hzToLfoFreq(hz: number): number {
  const clamped = Math.max(LFO_MIN_HZ, Math.min(LFO_MAX_HZ, hz));
  return clampByte(255 * (Math.log(clamped / LFO_MIN_HZ) / Math.log(LFO_MAX_HZ / LFO_MIN_HZ)));
}

export const CUTOFF_MIN_HZ = 20;
export const CUTOFF_MAX_HZ = 20000;

export function cutoffHz(v: number): number {
  const x = clampByte(v) / 255;
  return CUTOFF_MIN_HZ * Math.pow(CUTOFF_MAX_HZ / CUTOFF_MIN_HZ, x);
}

export function hzToCutoff(hz: number): number {
  const clamped = Math.max(CUTOFF_MIN_HZ, Math.min(CUTOFF_MAX_HZ, hz));
  return clampByte(255 * (Math.log(clamped / CUTOFF_MIN_HZ) / Math.log(CUTOFF_MAX_HZ / CUTOFF_MIN_HZ)));
}

/**
 * Peak phase deviation, in cycles, that a modulator at LEVEL 0xFF applies to its
 * carrier. One full cycle is 2*pi radians, which is about the modulation index a
 * DX7 operator reaches at maximum output level.
 */
export const MAX_PM_CYCLES = 1.0;

/**
 * Peak self-feedback deviation, in cycles, at FBK 0xFF. Scaled linearly with
 * FBK so the range reads the way the M8's does: 0x10-0x40 morphs the sine
 * towards a saw, and the top of the range breaks up into noise.
 */
export const MAX_FEEDBACK_CYCLES = 0.5;

/** Carrier LEVEL to linear output gain. */
export function levelToAmplitude(v: number): number {
  return clampByte(v) / 255;
}

/** Modulator LEVEL to peak phase deviation, in cycles. */
export function levelToPmCycles(v: number): number {
  const x = clampByte(v) / 255;
  return x * x * MAX_PM_CYCLES;
}

/** Creates an FMSYNTH patch with the M8's power-on defaults. */
export function createDefaultPatch(): M8Patch {
  return {
    name: 'M8FM',
    volume: 0x00,
    pitch: 0x00,
    fineTune: 0x80,
    algo: 0x00,
    mods: [0x00, 0x00, 0x00, 0x00],
    operators: Array.from({ length: 4 }, () => ({
      shape: OSC_SIN,
      ratio: 1,
      ratioFine: 0,
      level: 0x00,
      feedback: 0x00,
      modA: 0x00,
      modB: 0x00
    })),
    filter: { type: FILTER_OFF, cutoff: 0xff, res: 0x00 },
    mixer: { amp: 0x00, lim: 0x00, pan: 0x80, dry: 0xc0, cho: 0x00, del: 0x00, rev: 0x00 },
    envelopes: [
      { amount: 0xff, attack: 0x00, hold: 0x00, decay: 0x80, dest: DEST_OFF, retrigger: 0x00 },
      { amount: 0xff, attack: 0x00, hold: 0x00, decay: 0x80, dest: DEST_OFF, retrigger: 0x00 }
    ],
    lfos: [
      { amount: 0x00, shape: LFO_TRI, trigger: 0x00, freq: 0x10, dest: DEST_OFF },
      { amount: 0x00, shape: LFO_TRI, trigger: 0x00, freq: 0x10, dest: DEST_OFF }
    ]
  };
}

export function clonePatch(patch: M8Patch): M8Patch {
  return {
    ...patch,
    mods: [...patch.mods] as [number, number, number, number],
    operators: patch.operators.map((op) => ({ ...op })),
    filter: { ...patch.filter },
    mixer: { ...patch.mixer },
    envelopes: patch.envelopes.map((env) => ({ ...env })),
    lfos: patch.lfos.map((lfo) => ({ ...lfo }))
  };
}

/**
 * Algorithm routing table. For each algorithm, `sources[k]` lists the operators
 * that phase-modulate operator k, and `carriers` lists the operators that reach
 * the output. Operators are 0=A, 1=B, 2=C, 3=D.
 */
export const M8_ALGO_ROUTING: { sources: number[][]; carriers: number[] }[] = [
  { sources: [[], [0], [1], [2]], carriers: [3] },              // A>B>C>D
  { sources: [[], [], [0, 1], [2]], carriers: [3] },            // [A+B]>C>D
  { sources: [[], [0], [], [1, 2]], carriers: [3] },            // [A>B+C]>D
  { sources: [[], [0], [0], [1, 2]], carriers: [3] },           // [A>B+A>C]>D
  { sources: [[], [], [], [0, 1, 2]], carriers: [3] },          // [A+B+C]>D
  { sources: [[], [0], [1], []], carriers: [2, 3] },            // [A>B>C]+D
  { sources: [[], [0], [1], [1]], carriers: [2, 3] },           // [A>B>C]+[A>B>D]
  { sources: [[], [0], [], [2]], carriers: [1, 3] },            // [A>B]+[C>D]
  { sources: [[], [0], [0], [0]], carriers: [1, 2, 3] },        // [A>B]+[A>C]+[A>D]
  { sources: [[], [0], [0], []], carriers: [1, 2, 3] },         // [A>B]+[A>C]+D
  { sources: [[], [0], [], []], carriers: [1, 2, 3] },          // [A>B]+C+D
  { sources: [[], [], [], []], carriers: [0, 1, 2, 3] }         // A+B+C+D
];
