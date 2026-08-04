import {
  DEST_CUTOFF,
  DEST_MOD1,
  DEST_MOD2,
  DEST_PITCH,
  DEST_VOLUME,
  FILTER_LOWPASS,
  FILTER_OFF,
  LFO_RAMP_DN,
  LFO_SIN,
  LFO_SQU_DN,
  LFO_TRI,
  MOD_TARGET_LEV,
  OSC_SIN,
  clampByte,
  clonePatch,
  createDefaultPatch,
  encodeModSlot,
  multiplierToRatio
} from './M8Patch';
import type { M8Patch } from './M8Patch';

export type AnchorName = 'Electric Piano' | 'Sub Bass' | 'Mallet' | 'Pad' | 'Digital Glitch' | 'Vintage Lead';

export const AnchorMacroConfig: Record<AnchorName, string[]> = {
  'Electric Piano': ['Tine Material', 'Strike Force', 'Bark', 'Tremolo Depth'],
  'Sub Bass': ['Sub Weight', 'Pitch Snap', 'Top-End Growl', 'Boom'],
  'Mallet': ['Harmonic Focus', 'Dampening', 'Impact Noise'],
  'Pad': ['Wash', 'Shimmer', 'Chorus', 'Hollow'],
  'Digital Glitch': ['Digital Dirt', 'Laser Zap', 'Pulse Width'],
  'Vintage Lead': ['Timbre', 'Filter Cutoff', 'Filter Envelope', 'Analog Slop']
};

/** MOD slot value for "MOD bus n modulates my LEVEL". */
const busToLevel = (bus: number) => encodeModSlot(bus, MOD_TARGET_LEV);

/** Linear interpolation between two raw M8 values. */
function lerpByte(from: number, to: number, t: number): number {
  return clampByte(from + (to - from) * t);
}

function setRatio(patch: M8Patch, opIndex: number, multiplier: number) {
  const { ratio, ratioFine } = multiplierToRatio(multiplier);
  patch.operators[opIndex].ratio = ratio;
  patch.operators[opIndex].ratioFine = ratioFine;
}

/**
 * Produces M8 FMSYNTH patches from a handful of high level macros.
 *
 * Everything it emits is in raw M8 units, so the patch this returns is
 * simultaneously what the UI prints, what the .m8i export writes, and what the
 * audio engine renders. The macros only ever nudge raw values around.
 */
export class MacroMapper {
  private basePatch: M8Patch;
  private currentPatch: M8Patch;
  private macroState: Record<string, number> = {};
  private currentAnchor: AnchorName;

  constructor(initialAnchor: AnchorName = 'Electric Piano') {
    this.currentAnchor = initialAnchor;
    this.basePatch = MacroMapper.getAnchorPatch(initialAnchor);
    this.currentPatch = clonePatch(this.basePatch);
    // Resolve the macros straight away so getPatch() never returns a patch that
    // differs from what the first setMacro() call would produce.
    this.updatePatch();
  }

  public loadAnchor(anchorName: AnchorName) {
    this.currentAnchor = anchorName;
    this.basePatch = MacroMapper.getAnchorPatch(anchorName);
    this.macroState = {};
    this.updatePatch();
  }

  public setMacro(macroName: string, normalizedValue: number) {
    this.macroState[macroName] = Math.max(0, Math.min(1, normalizedValue));
    this.updatePatch();
  }

  public getPatch(): M8Patch {
    return this.currentPatch;
  }

  private macro(name: string): number {
    return this.macroState[name] ?? 0;
  }

  private updatePatch() {
    const patch = clonePatch(this.basePatch);

    switch (this.currentAnchor) {
      case 'Electric Piano': this.applyElectricPiano(patch); break;
      case 'Sub Bass': this.applySubBass(patch); break;
      case 'Mallet': this.applyMallet(patch); break;
      case 'Pad': this.applyPad(patch); break;
      case 'Digital Glitch': this.applyDigitalGlitch(patch); break;
      case 'Vintage Lead': this.applyVintageLead(patch); break;
    }

    this.currentPatch = patch;
  }

  private applyElectricPiano(patch: M8Patch) {
    // Tine material moves the strike up the harmonic series. Integer ratios
    // only: a fractional tine ratio beats against the body pair and is the
    // difference between a bell and a clang.
    setRatio(patch, 0, 7 + Math.floor(this.macro('Tine Material') * 7));

    // Strike force is how hard the tine is hit -- depth, ring time, and how
    // much air the filter lets through.
    const strike = this.macro('Strike Force');
    patch.envelopes[1].amount = lerpByte(0x50, 0x90, strike);
    patch.envelopes[1].decay = lerpByte(0x38, 0x58, strike);
    patch.filter.cutoff = lerpByte(0xc4, 0xec, strike);

    // Bark is the body pair's modulation index: the growl a Rhodes gets when
    // you dig into it, rather than more of the tine.
    const bark = this.macro('Bark');
    patch.operators[2].level = lerpByte(0x20, 0x70, bark);

    const tremolo = this.macro('Tremolo Depth');
    patch.lfos[0].amount = lerpByte(0x00, 0x60, tremolo);
    patch.lfos[0].freq = lerpByte(0xb8, 0xd8, tremolo);
  }

  private applySubBass(patch: M8Patch) {
    const weight = this.macro('Sub Weight');
    patch.operators[3].level = lerpByte(0xa8, 0xe8, weight);

    const growl = this.macro('Top-End Growl');
    patch.operators[0].level = lerpByte(0x18, 0x78, growl);
    patch.operators[1].level = lerpByte(0x40, 0x88, growl);
    patch.operators[0].feedback = lerpByte(0x00, 0x40, growl);

    const snap = this.macro('Pitch Snap');
    patch.envelopes[1].amount = lerpByte(0x00, 0x40, snap);
    patch.envelopes[1].decay = lerpByte(0x18, 0x40, snap);

    const boom = this.macro('Boom');
    patch.envelopes[0].hold = lerpByte(0x00, 0x50, boom);
    patch.envelopes[0].decay = lerpByte(0x78, 0xc0, boom);
  }

  private applyMallet(patch: M8Patch) {
    // Harmonic focus steps between inharmonic (wooden), harmonic (bell) and
    // wide-interval (glassy) modulator pairs.
    const focus = this.macro('Harmonic Focus');
    if (focus < 0.34) {
      setRatio(patch, 0, 3.5);
      setRatio(patch, 2, 5.0);
    } else if (focus < 0.67) {
      setRatio(patch, 0, 2.0);
      setRatio(patch, 2, 9.0);
    } else {
      setRatio(patch, 0, 7.0);
      setRatio(patch, 2, 11.0);
    }

    const dampening = this.macro('Dampening');
    patch.envelopes[0].decay = lerpByte(0xa0, 0x48, dampening);
    patch.envelopes[1].decay = lerpByte(0x50, 0x28, dampening);

    const impact = this.macro('Impact Noise');
    patch.operators[2].level = lerpByte(0x10, 0x60, impact);
    patch.operators[2].feedback = lerpByte(0x00, 0x70, impact);
  }

  private applyPad(patch: M8Patch) {
    const wash = this.macro('Wash');
    patch.envelopes[0].attack = lerpByte(0x50, 0xb0, wash);
    patch.envelopes[0].decay = lerpByte(0xa0, 0xe0, wash);
    patch.envelopes[1].attack = lerpByte(0x60, 0xc0, wash);

    const shimmer = this.macro('Shimmer');
    setRatio(patch, 2, shimmer > 0.5 ? 8 : 4);
    patch.operators[2].level = lerpByte(0x18, 0x50, shimmer);

    const chorus = this.macro('Chorus');
    patch.mixer.cho = lerpByte(0x40, 0xf0, chorus);
    patch.lfos[0].amount = lerpByte(0x04, 0x14, chorus);

    // Hollow detunes the second carrier away from the first, thinning the core.
    const hollow = this.macro('Hollow');
    setRatio(patch, 3, 1 + hollow * 0.5);
    patch.operators[1].level = lerpByte(0xc0, 0x90, hollow);
  }

  private applyDigitalGlitch(patch: M8Patch) {
    const dirt = this.macro('Digital Dirt');
    patch.operators[0].feedback = lerpByte(0x10, 0xd0, dirt);

    const zap = this.macro('Laser Zap');
    patch.envelopes[1].amount = lerpByte(0x10, 0x90, zap);
    patch.envelopes[1].decay = lerpByte(0x50, 0x20, zap);

    const pw = this.macro('Pulse Width');
    patch.lfos[1].amount = lerpByte(0x00, 0x70, pw);
    patch.lfos[1].freq = lerpByte(0x90, 0xe8, pw);
  }

  private applyVintageLead(patch: M8Patch) {
    // Timbre sweeps from a soft single-modulator tone to a stacked, fed-back one.
    const timbre = this.macro('Timbre');
    patch.operators[0].level = lerpByte(0x50, 0x90, timbre);
    patch.operators[1].level = lerpByte(0x28, 0x60, timbre);
    patch.operators[3].feedback = lerpByte(0x18, 0x70, timbre);

    patch.filter.cutoff = lerpByte(0x60, 0xf0, this.macro('Filter Cutoff'));

    const filterEnv = this.macro('Filter Envelope');
    patch.envelopes[1].amount = lerpByte(0x00, 0x70, filterEnv);
    patch.envelopes[1].decay = lerpByte(0x60, 0xc0, filterEnv);

    const slop = this.macro('Analog Slop');
    patch.lfos[0].amount = lerpByte(0x00, 0x18, slop);
    patch.lfos[0].freq = lerpByte(0x88, 0xc8, slop);
  }

  /**
   * The starting point for each machine, written the way you would enter it on
   * the device.
   *
   * Every one of these has an envelope on VOLUME. On the M8 an FMSYNTH has no
   * implicit amplitude envelope: with nothing aimed at VOLUME (or at a carrier's
   * LEVEL through a MOD bus) the operators simply run flat out for as long as
   * the note is held, which is what turns an otherwise reasonable patch into a
   * continuous buzz.
   */
  public static getAnchorPatch(anchor: AnchorName): M8Patch {
    const patch = createDefaultPatch();

    switch (anchor) {
      case 'Electric Piano':
        patch.name = 'M8FM EP';
        // Two independent 2-operator pairs, which is how every good FM Rhodes
        // is built: one pair makes the struck tine, the other makes the sustained
        // body, and they are mixed rather than stacked. The previous version put
        // three carriers at ratios 00.50, 01.00 and 01.50 -- relative to the
        // sub-octave that is a 1:2:3 series, i.e. a Hammond drawbar
        // registration, which is most of where the metallic edge came from.
        patch.algo = 0x07; // [A>B]+[C>D]
        patch.mods = [0x00, 0x00, 0x00, 0x00];
        // Op A: the tine. High ratio, low standing level -- the brightness
        // arrives with the ENV2 strike and leaves with it.
        patch.operators[0] = { shape: OSC_SIN, ratio: 11, ratioFine: 0, level: 0x18, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        // Op B: the tine's carrier, on the same MOD bus, so the ping fades in
        // level as well as in brightness and settles to a thin sine that
        // reinforces the fundamental.
        patch.operators[1] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x20, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        // Op C: the body. A 1:1 modulator at a low index gives a warm spectrum
        // that rolls off smoothly instead of a fixed set of high partials.
        patch.operators[2] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x40, feedback: 0x00, modA: 0x00, modB: 0x00 };
        // Op D: the body's carrier, and the note you actually hear.
        patch.operators[3] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0xc0, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.envelopes[0] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: 0x9a, dest: DEST_VOLUME, retrigger: 0x00 };
        // The strike: a short swell on MOD 2, which the whole tine pair rides.
        patch.envelopes[1] = { amount: 0x70, attack: 0x00, hold: 0x00, decay: 0x48, dest: DEST_MOD2, retrigger: 0x00 };
        patch.lfos[0] = { amount: 0x30, shape: LFO_TRI, trigger: 0x00, freq: 0xc8, dest: DEST_VOLUME };
        patch.filter = { type: FILTER_LOWPASS, cutoff: 0xd4, res: 0x10 };
        patch.mixer.cho = 0xa0;
        break;

      case 'Sub Bass':
        patch.name = 'M8FM SUB';
        patch.algo = 0x07; // [A>B]+[C>D]
        patch.operators[0] = { shape: OSC_SIN, ratio: 2, ratioFine: 0, level: 0x40, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[1] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x60, feedback: 0x00, modA: 0x00, modB: 0x00 };
        // Op C silenced so Op D stays a clean sine sub.
        patch.operators[2] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x00, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[3] = { shape: OSC_SIN, ratio: 0, ratioFine: 50, level: 0xd0, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.envelopes[0] = { amount: 0xff, attack: 0x04, hold: 0x20, decay: 0xa0, dest: DEST_VOLUME, retrigger: 0x00 };
        patch.envelopes[1] = { amount: 0x20, attack: 0x00, hold: 0x00, decay: 0x28, dest: DEST_PITCH, retrigger: 0x00 };
        patch.filter = { type: FILTER_LOWPASS, cutoff: 0x98, res: 0x30 };
        break;

      case 'Mallet':
        patch.name = 'M8FM MLT';
        patch.algo = 0x07; // [A>B]+[C>D]
        patch.operators[0] = { shape: OSC_SIN, ratio: 3, ratioFine: 50, level: 0x60, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        patch.operators[1] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0xc0, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[2] = { shape: OSC_SIN, ratio: 9, ratioFine: 0, level: 0x30, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        patch.operators[3] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x60, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.envelopes[0] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: 0x88, dest: DEST_VOLUME, retrigger: 0x00 };
        patch.envelopes[1] = { amount: 0x70, attack: 0x00, hold: 0x00, decay: 0x38, dest: DEST_MOD2, retrigger: 0x00 };
        patch.filter = { type: FILTER_LOWPASS, cutoff: 0xd8, res: 0x18 };
        patch.mixer.cho = 0x40;
        break;

      case 'Pad':
        patch.name = 'M8FM PAD';
        patch.algo = 0x07; // [A>B]+[C>D]
        patch.operators[0] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x38, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        patch.operators[1] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0xc0, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[2] = { shape: OSC_SIN, ratio: 4, ratioFine: 0, level: 0x30, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        // Detuned against Op B, which is where the width comes from.
        patch.operators[3] = { shape: OSC_SIN, ratio: 1, ratioFine: 1, level: 0xb0, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.envelopes[0] = { amount: 0xff, attack: 0x80, hold: 0x50, decay: 0xc8, dest: DEST_VOLUME, retrigger: 0x00 };
        patch.envelopes[1] = { amount: 0x50, attack: 0xa0, hold: 0x00, decay: 0xc0, dest: DEST_MOD2, retrigger: 0x00 };
        patch.lfos[0] = { amount: 0x08, shape: LFO_SIN, trigger: 0x00, freq: 0x60, dest: DEST_PITCH };
        patch.filter = { type: FILTER_LOWPASS, cutoff: 0xb8, res: 0x28 };
        patch.mixer.cho = 0xc0;
        break;

      case 'Digital Glitch':
        patch.name = 'M8FM GLT';
        patch.algo = 0x00; // A>B>C>D
        patch.operators[0] = { shape: OSC_SIN, ratio: 7, ratioFine: 13, level: 0x90, feedback: 0x60, modA: busToLevel(1), modB: 0x00 };
        patch.operators[1] = { shape: OSC_SIN, ratio: 11, ratioFine: 0, level: 0x70, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[2] = { shape: OSC_SIN, ratio: 0, ratioFine: 50, level: 0x88, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[3] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0xe0, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.envelopes[0] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: 0x68, dest: DEST_VOLUME, retrigger: 0x00 };
        patch.envelopes[1] = { amount: 0x40, attack: 0x00, hold: 0x00, decay: 0x38, dest: DEST_PITCH, retrigger: 0x00 };
        patch.lfos[0] = { amount: 0x30, shape: LFO_SQU_DN, trigger: 0x01, freq: 0xe0, dest: DEST_PITCH };
        patch.lfos[1] = { amount: 0x40, shape: LFO_RAMP_DN, trigger: 0x00, freq: 0xd0, dest: DEST_MOD1 };
        patch.filter = { type: FILTER_OFF, cutoff: 0xff, res: 0x00 };
        break;

      case 'Vintage Lead':
        patch.name = 'M8FM LED';
        patch.algo = 0x04; // [A+B+C]>D
        patch.operators[0] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x50, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[1] = { shape: OSC_SIN, ratio: 2, ratioFine: 0, level: 0x30, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[2] = { shape: OSC_SIN, ratio: 3, ratioFine: 0, level: 0x18, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[3] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0xd0, feedback: 0x30, modA: 0x00, modB: 0x00 };
        patch.envelopes[0] = { amount: 0xff, attack: 0x28, hold: 0x50, decay: 0xb8, dest: DEST_VOLUME, retrigger: 0x00 };
        patch.envelopes[1] = { amount: 0x50, attack: 0x18, hold: 0x00, decay: 0xa0, dest: DEST_CUTOFF, retrigger: 0x00 };
        patch.lfos[0] = { amount: 0x08, shape: LFO_TRI, trigger: 0x00, freq: 0xa8, dest: DEST_PITCH };
        patch.filter = { type: FILTER_LOWPASS, cutoff: 0xa0, res: 0x40 };
        break;
    }

    return patch;
  }
}
