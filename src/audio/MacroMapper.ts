import {
  DEST_CUTOFF,
  DEST_MOD2,
  DEST_PAN,
  DEST_PITCH,
  DEST_VOLUME,
  FILTER_HIGHPASS,
  FILTER_LOWPASS,
  LFO_SIN,
  LFO_TRI,
  MOD_TARGET_LEV,
  OSC_NOI,
  OSC_SIN,
  OSC_SQR,
  clampByte,
  clonePatch,
  secondsToEnvAttack,
  secondsToEnvDecay,
  createDefaultPatch,
  encodeModSlot,
  multiplierToRatio
} from './M8Patch';
import type { M8Patch } from './M8Patch';

export type AnchorName = 'Electric Piano' | 'Sub Bass' | 'Mallet' | 'Pad' | 'Percussion' | 'Vintage Lead';

export const AnchorMacroConfig: Record<AnchorName, string[]> = {
  'Electric Piano': ['Tine Material', 'Strike Force', 'Bark', 'Tremolo Depth'],
  'Sub Bass': ['Sub Weight', 'Pitch Snap', 'Top-End Growl', 'Boom'],
  'Mallet': ['Harmonic Focus', 'Dampening', 'Impact Noise'],
  'Pad': ['Wash', 'Shimmer', 'Chorus', 'Hollow'],
  'Percussion': ['Punch', 'Tone', 'Decay', 'Dirt'],
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
  private currentPresetIndex: number = 0;
  private percussionMacroStates: Record<number, Record<string, number>> = {};

  constructor(initialAnchor: AnchorName = 'Electric Piano') {
    this.currentAnchor = initialAnchor;
    this.basePatch = MacroMapper.getAnchorPatch(initialAnchor, 0);
    this.currentPatch = clonePatch(this.basePatch);
    // Resolve the macros straight away so getPatch() never returns a patch that
    // differs from what the first setMacro() call would produce.
    this.updatePatch();
  }

  public loadAnchor(anchorName: AnchorName) {
    this.currentAnchor = anchorName;
    this.currentPresetIndex = 0;
    this.basePatch = MacroMapper.getAnchorPatch(anchorName, 0);
    this.macroState = anchorName === 'Percussion' ? (this.percussionMacroStates[0] || {}) : {};
    this.updatePatch();
  }

  public selectPreset(presetIndex: number) {
    this.currentPresetIndex = presetIndex;
    if (this.currentAnchor === 'Percussion') {
      this.basePatch = MacroMapper.getAnchorPatch('Percussion', presetIndex);
      this.macroState = this.percussionMacroStates[presetIndex] || {};
      this.updatePatch();
    }
  }

  public getPatchForPreset(presetIndex: number): M8Patch {
    if (this.currentAnchor !== 'Percussion') {
      return this.getPatch();
    }
    const base = clonePatch(MacroMapper.getAnchorPatch('Percussion', presetIndex));
    const savedState = this.percussionMacroStates[presetIndex] || {};
    this.applyPercussion(base, presetIndex, savedState);
    return base;
  }

  public setMacro(macroName: string, normalizedValue: number) {
    const val = Math.max(0, Math.min(1, normalizedValue));
    this.macroState[macroName] = val;
    if (this.currentAnchor === 'Percussion') {
      if (!this.percussionMacroStates[this.currentPresetIndex]) {
        this.percussionMacroStates[this.currentPresetIndex] = {};
      }
      this.percussionMacroStates[this.currentPresetIndex][macroName] = val;
    }
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
      case 'Percussion': this.applyPercussion(patch, this.currentPresetIndex); break;
      case 'Vintage Lead': this.applyVintageLead(patch); break;
    }

    this.currentPatch = patch;
  }

  private applyElectricPiano(patch: M8Patch) {
    // Tine material moves the strike up the harmonic series. Integer ratios
    // only: a fractional tine ratio beats against the body pair and is the
    // difference between a bell and a clang.
    setRatio(patch, 0, 7 + Math.floor(this.macro('Tine Material') * 7));

    // Strike force is how hard the tine is hit: how bright it peaks, how long
    // it rings, and how much air the filter lets through.
    const strike = this.macro('Strike Force');
    patch.operators[0].level = lerpByte(0x98, 0xd8, strike);
    patch.envelopes[1].decay = lerpByte(secondsToEnvDecay(0.45), secondsToEnvDecay(0.95), strike);
    patch.filter.cutoff = lerpByte(0xc4, 0xec, strike);

    // Bark is the body pair's modulation index: the growl a Rhodes gets when
    // you dig into it, rather than more of the tine.
    const bark = this.macro('Bark');
    patch.operators[2].level = lerpByte(0x30, 0x90, bark);

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
    patch.envelopes[1].decay = lerpByte(secondsToEnvDecay(0.05), secondsToEnvDecay(0.14), snap);

    const boom = this.macro('Boom');
    patch.envelopes[0].hold = lerpByte(0x00, secondsToEnvDecay(0.35), boom);
    patch.envelopes[0].decay = lerpByte(secondsToEnvDecay(1.6), secondsToEnvDecay(3.6), boom);
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
    patch.envelopes[0].decay = lerpByte(secondsToEnvDecay(1.5), secondsToEnvDecay(0.35), dampening);
    patch.envelopes[1].decay = lerpByte(secondsToEnvDecay(0.35), secondsToEnvDecay(0.12), dampening);

    const impact = this.macro('Impact Noise');
    patch.operators[2].level = lerpByte(0x10, 0x60, impact);
    patch.operators[2].feedback = lerpByte(0x00, 0x70, impact);
  }

  private applyPad(patch: M8Patch) {
    const wash = this.macro('Wash');
    patch.envelopes[0].attack = lerpByte(secondsToEnvAttack(0.4), secondsToEnvAttack(2.4), wash);
    patch.envelopes[0].decay = lerpByte(secondsToEnvDecay(2.5), secondsToEnvDecay(6.0), wash);
    patch.envelopes[1].attack = lerpByte(secondsToEnvAttack(0.6), secondsToEnvAttack(3.0), wash);
    patch.envelopes[1].decay = lerpByte(secondsToEnvDecay(2.6), secondsToEnvDecay(5.5), wash);

    const shimmer = this.macro('Shimmer');
    // Low (<0.40): Dark & warm analog strings (1:1 warm overtone)
    // Mid (0.40 - 0.70): Singing vocal formant overtone (3:1 odd harmonic, "Syn-Voix" choir vowel)
    // High (>0.70): Crystalline glass octave shimmer (2:1)
    if (shimmer < 0.40) {
      setRatio(patch, 2, 1.0);
      patch.operators[2].level = lerpByte(0x06, 0x24, shimmer / 0.40);
      patch.operators[2].feedback = 0x00;
    } else if (shimmer < 0.70) {
      setRatio(patch, 2, 3.0);
      const t = (shimmer - 0.40) / 0.30;
      patch.operators[2].level = lerpByte(0x28, 0x48, t);
      patch.operators[2].feedback = lerpByte(0x00, 0x14, t);
    } else {
      setRatio(patch, 2, 2.0);
      const t = (shimmer - 0.70) / 0.30;
      patch.operators[2].level = lerpByte(0x38, 0x55, t);
      patch.operators[2].feedback = lerpByte(0x14, 0x3c, t);
    }

    const chorus = this.macro('Chorus');
    patch.mixer.cho = lerpByte(0x40, 0xf0, chorus);
    patch.lfos[0].amount = lerpByte(0x08, 0x2e, chorus);
    patch.lfos[1].amount = lerpByte(0x00, 0x48, chorus);

    // Hollow: Core fundamental vs ethereal shell
    // Low (<0.35): Full analog body with warm sawtooth feedback on carriers
    // Mid (0.35 - 0.68): Pure sine vocal choral body (clean vocal tones)
    // High (>0.68): Ethereal void space (sub-octave 0.50 drone + octave 2.00 glass shell)
    const hollow = this.macro('Hollow');
    if (hollow < 0.35) {
      const t = hollow / 0.35;
      setRatio(patch, 1, 1.0);
      setRatio(patch, 3, chorus > 0.4 ? 1.01 : 1.00);
      patch.operators[1].level = lerpByte(0xa8, 0x90, t);
      patch.operators[0].level = lerpByte(0x30, 0x24, t);
      patch.operators[3].level = lerpByte(0x88, 0x8c, t);
      patch.operators[1].feedback = lerpByte(0x28, 0x1c, t);
      patch.operators[3].feedback = lerpByte(0x24, 0x18, t);
      patch.filter.cutoff = lerpByte(0x9a, 0xb0, t);
    } else if (hollow < 0.68) {
      const t = (hollow - 0.35) / 0.33;
      setRatio(patch, 1, 1.0);
      setRatio(patch, 3, 2.0);
      patch.operators[1].level = lerpByte(0x90, 0x78, t);
      patch.operators[0].level = lerpByte(0x24, 0x18, t);
      patch.operators[3].level = lerpByte(0x8c, 0x98, t);
      patch.operators[1].feedback = lerpByte(0x08, 0x00, t);
      patch.operators[3].feedback = lerpByte(0x08, 0x00, t);
      patch.filter.cutoff = lerpByte(0xb0, 0xc4, t);
    } else {
      const t = (hollow - 0.68) / 0.32;
      setRatio(patch, 1, 0.5);
      setRatio(patch, 3, 2.0);
      patch.operators[1].level = lerpByte(0x60, 0x7a, t);
      patch.operators[0].level = 0x00;
      patch.operators[1].feedback = 0x00;
      patch.operators[3].level = lerpByte(0x94, 0xaa, t);
      patch.operators[3].feedback = 0x00;
      patch.filter.cutoff = lerpByte(0x8c, 0xb0, t);
    }
  }

  private applyPercussion(
    patch: M8Patch,
    presetIndex: number = this.currentPresetIndex,
    customMacroState?: Record<string, number>
  ) {
    const getVal = (name: string) => customMacroState ? (customMacroState[name] ?? 0) : this.macro(name);
    const punch = getVal('Punch');
    const tone = getVal('Tone');
    const decay = getVal('Decay');
    const dirt = getVal('Dirt');

    switch (presetIndex) {
      case 0: // KICK
        // Punch: controls FM modulator intensity and transient click attack
        patch.operators[2].level = lerpByte(0x40, 0xa8, punch);
        patch.operators[1].level = lerpByte(0x20, 0x78, punch);
        patch.operators[0].level = lerpByte(0x18, 0x60, punch);
        patch.envelopes[1].decay = lerpByte(secondsToEnvDecay(0.015), secondsToEnvDecay(0.028), punch);

        // Tone: sub carrier fine tuning (45 Hz to 65 Hz) and filter cutoff
        patch.operators[3].ratioFine = lerpByte(35, 50, tone);
        patch.filter.cutoff = lerpByte(0x88, 0xec, tone);

        // Decay: tail duration from short tight punch (0.16s) to long 808 sub boom (1.2s)
        patch.envelopes[0].decay = lerpByte(secondsToEnvDecay(0.16), secondsToEnvDecay(1.2), decay);

        // Dirt: drives sub carrier feedback for warm analog drive and tape saturation
        patch.operators[3].feedback = lerpByte(0x00, 0x48, dirt);
        patch.operators[0].feedback = lerpByte(0x10, 0x40, dirt);
        break;

      case 1: // SNARE
        // Punch: initial stick impact and drum body pop
        patch.operators[2].level = lerpByte(0x18, 0x68, punch);
        patch.operators[3].level = lerpByte(0x88, 0xd0, punch);

        // Tone: filter cutoff shaping the snare wire brightness
        patch.filter.cutoff = lerpByte(0x90, 0xf0, tone);

        // Decay: snare wire tail and release (0.12s tight crack to 0.55s loose ring)
        patch.envelopes[0].decay = lerpByte(secondsToEnvDecay(0.12), secondsToEnvDecay(0.55), decay);

        // Dirt: wire rattle level and inharmonic noise bite
        patch.operators[1].level = lerpByte(0x60, 0xd8, dirt);
        patch.operators[0].level = lerpByte(0x18, 0x58, dirt);
        break;

      case 2: // CLOSED HAT
        // Punch: initial metallic attack strike
        patch.operators[1].level = lerpByte(0x40, 0xb0, punch);
        patch.operators[0].level = lerpByte(0x20, 0x70, punch);

        // Tone: highpass cutoff frequency (crispness)
        patch.filter.cutoff = lerpByte(0xa8, 0xee, tone);

        // Decay: micro-chick (0.025s) to tight tick (0.09s)
        patch.envelopes[0].decay = lerpByte(secondsToEnvDecay(0.025), secondsToEnvDecay(0.09), decay);

        // Dirt: metallic inharmonic sizzle
        patch.operators[0].feedback = lerpByte(0x10, 0x70, dirt);
        patch.operators[2].feedback = lerpByte(0x10, 0x60, dirt);
        break;

      case 3: // OPEN HAT
        // Punch: initial cymbal attack strike brightness
        patch.envelopes[1].amount = lerpByte(0x10, 0x60, punch);
        patch.operators[1].level = lerpByte(0x50, 0xb8, punch);

        // Tone: highpass shimmer cutoff
        patch.filter.cutoff = lerpByte(0x98, 0xe4, tone);

        // Decay: open cymbal sizzle ring (0.20s to 1.2s)
        patch.envelopes[0].decay = lerpByte(secondsToEnvDecay(0.20), secondsToEnvDecay(1.2), decay);

        // Dirt: metallic feedback resonance and wash
        patch.operators[0].feedback = lerpByte(0x20, 0x88, dirt);
        patch.operators[2].feedback = lerpByte(0x20, 0x78, dirt);
        break;
    }
  }

  private applyVintageLead(patch: M8Patch) {
    // Timbre sweeps from a soft warm tone to a stacked, fed-back analog lead.
    const timbre = this.macro('Timbre');
    patch.operators[0].level = lerpByte(0x40, 0x88, timbre);
    patch.operators[1].level = lerpByte(0x20, 0x58, timbre);
    patch.operators[3].feedback = lerpByte(0x14, 0x58, timbre);

    patch.filter.cutoff = lerpByte(0x60, 0xec, this.macro('Filter Cutoff'));

    const filterEnv = this.macro('Filter Envelope');
    patch.envelopes[1].amount = lerpByte(0x00, 0x68, filterEnv);
    patch.envelopes[1].decay = lerpByte(secondsToEnvDecay(0.3), secondsToEnvDecay(1.8), filterEnv);

    // Analog Slop: Boards of Canada worn cassette tape wow & flutter
    const slop = this.macro('Analog Slop');
    patch.lfos[0].amount = lerpByte(0x00, 0x03, slop);
    patch.lfos[0].freq = lerpByte(0x38, 0x54, slop);
    // Cutoff tape flutter in sync with tape drift
    patch.lfos[1].amount = lerpByte(0x00, 0x18, slop);
    patch.lfos[1].freq = lerpByte(0x30, 0x4c, slop);
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
  public static getAnchorPatch(anchor: AnchorName, presetIndex: number = 0): M8Patch {
    const patch = createDefaultPatch();

    switch (anchor) {
      case 'Electric Piano':
        patch.name = 'M8FM EP';
        // Two independent 2-operator pairs, which is how every good FM Rhodes
        // is built: one pair makes the struck tine, the other makes the
        // sustained body, and they are mixed rather than stacked.
        patch.algo = 0x07; // [A>B]+[C>D]
        // MOD 2 rests at zero and the strike envelope drives it. A MOD bus
        // scales the level it is wired to, so the whole tine pair is silent
        // between notes and swells in with the strike.
        patch.mods = [0x00, 0x00, 0x00, 0x00];
        // Op A: the tine. Its LEVEL is the brightness at the peak of the
        // strike, not a standing value.
        patch.operators[0] = { shape: OSC_SIN, ratio: 11, ratioFine: 0, level: 0x88, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        // Op B: the tine's carrier, on the same bus, so the ping fades in
        // level and in brightness together.
        patch.operators[1] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x90, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        // Op C: the body. A 1:1 modulator at a low index gives a warm spectrum
        // that rolls off smoothly.
        patch.operators[2] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x40, feedback: 0x00, modA: 0x00, modB: 0x00 };
        // Op D: the body's carrier, and the note you actually hear.
        patch.operators[3] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0xc0, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.envelopes[0] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: secondsToEnvDecay(3.0), dest: DEST_VOLUME, retrigger: 0x00 };
        // The strike. AMOUNT is full so the bus sweeps its whole range.
        patch.envelopes[1] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: secondsToEnvDecay(0.65), dest: DEST_MOD2, retrigger: 0x00 };
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
        patch.envelopes[0] = { amount: 0xff, attack: 0x02, hold: secondsToEnvDecay(0.15), decay: secondsToEnvDecay(2.5), dest: DEST_VOLUME, retrigger: 0x00 };
        patch.envelopes[1] = { amount: 0x20, attack: 0x00, hold: 0x00, decay: secondsToEnvDecay(0.09), dest: DEST_PITCH, retrigger: 0x00 };
        patch.filter = { type: FILTER_LOWPASS, cutoff: 0x98, res: 0x30 };
        break;

      case 'Mallet':
        patch.name = 'M8FM MLT';
        patch.algo = 0x07; // [A>B]+[C>D]
        patch.operators[0] = { shape: OSC_SIN, ratio: 3, ratioFine: 50, level: 0x60, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        patch.operators[1] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0xc0, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[2] = { shape: OSC_SIN, ratio: 9, ratioFine: 0, level: 0x30, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        patch.operators[3] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x60, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.envelopes[0] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: secondsToEnvDecay(0.9), dest: DEST_VOLUME, retrigger: 0x00 };
        patch.envelopes[1] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: secondsToEnvDecay(0.25), dest: DEST_MOD2, retrigger: 0x00 };
        patch.filter = { type: FILTER_LOWPASS, cutoff: 0xd8, res: 0x18 };
        patch.mixer.cho = 0x40;
        break;

      case 'Pad':
        patch.name = 'M8FM PAD';
        patch.algo = 0x07; // [A>B]+[C>D]
        patch.operators[0] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x30, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        patch.operators[1] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0xa4, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[2] = { shape: OSC_SIN, ratio: 2, ratioFine: 0, level: 0x24, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        patch.operators[3] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x90, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.envelopes[0] = { amount: 0xff, attack: secondsToEnvAttack(1.0), hold: secondsToEnvDecay(0.4), decay: secondsToEnvDecay(4.5), dest: DEST_VOLUME, retrigger: 0x00 };
        patch.envelopes[1] = { amount: 0xff, attack: secondsToEnvAttack(1.5), hold: 0x00, decay: secondsToEnvDecay(4.0), dest: DEST_MOD2, retrigger: 0x00 };
        patch.lfos[0] = { amount: 0x18, shape: LFO_SIN, trigger: 0x00, freq: 0x40, dest: DEST_CUTOFF };
        patch.lfos[1] = { amount: 0x24, shape: LFO_TRI, trigger: 0x00, freq: 0x30, dest: DEST_PAN };
        patch.filter = { type: FILTER_LOWPASS, cutoff: 0xb0, res: 0x06 };
        patch.mixer.cho = 0xc0;
        break;

      case 'Percussion':
        return MacroMapper.getPercussionAnchorPatch(presetIndex);

      case 'Vintage Lead':
        patch.name = 'M8FM LED';
        patch.algo = 0x04; // [A+B+C]>D
        patch.operators[0] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x50, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[1] = { shape: OSC_SIN, ratio: 2, ratioFine: 0, level: 0x30, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[2] = { shape: OSC_SIN, ratio: 3, ratioFine: 0, level: 0x18, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[3] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0xd0, feedback: 0x28, modA: 0x00, modB: 0x00 };
        patch.envelopes[0] = { amount: 0xff, attack: secondsToEnvAttack(0.04), hold: secondsToEnvDecay(0.5), decay: secondsToEnvDecay(3.5), dest: DEST_VOLUME, retrigger: 0x00 };
        patch.envelopes[1] = { amount: 0x50, attack: secondsToEnvAttack(0.02), hold: 0x00, decay: secondsToEnvDecay(1.2), dest: DEST_CUTOFF, retrigger: 0x00 };
        // LFO 0: Gentle vintage pitch wow (lazy ~0.3 Hz tape drift)
        patch.lfos[0] = { amount: 0x01, shape: LFO_TRI, trigger: 0x00, freq: 0x44, dest: DEST_PITCH };
        // LFO 1: Subtle cutoff flutter
        patch.lfos[1] = { amount: 0x08, shape: LFO_SIN, trigger: 0x00, freq: 0x38, dest: DEST_CUTOFF };
        // Warm analog lowpass with musical resonance (no whistling!)
        patch.filter = { type: FILTER_LOWPASS, cutoff: 0x98, res: 0x18 };
        patch.mixer.cho = 0x50; // subtle tape stereo spread
        break;
    }

    return patch;
  }

  public static getPercussionAnchorPatch(presetIndex: number = 0): M8Patch {
    const patch = createDefaultPatch();
    switch (presetIndex) {
      case 0: // KICK
        patch.name = 'M8FM KIK';
        patch.algo = 0x07; // [A>B]+[C>D]
        // Op D is the deep fundamental sine sub carrier (ratio 0.40 = 52.3 Hz at note 48)
        patch.operators[3] = { shape: OSC_SIN, ratio: 0, ratioFine: 40, level: 0xe0, feedback: 0x00, modA: 0x00, modB: 0x00 };
        // Op C is the FM body modulator (ratio 1.0, wired to MOD2 for fast 20ms punch decay)
        patch.operators[2] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x78, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        // Op B is the transient click carrier (ratio 4.0, wired to MOD2 for sharp attack snap)
        patch.operators[1] = { shape: OSC_SIN, ratio: 4, ratioFine: 0, level: 0x48, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        // Op A is the transient click modulator (ratio 8.0, wired to MOD2)
        patch.operators[0] = { shape: OSC_SIN, ratio: 8, ratioFine: 0, level: 0x38, feedback: 0x18, modA: busToLevel(2), modB: 0x00 };
        // Volume envelope: immediate attack, hold 0, decay 0.45s for deep sub tail
        patch.envelopes[0] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: secondsToEnvDecay(0.45), dest: DEST_VOLUME, retrigger: 0x00 };
        // Fast 0.020s (20ms) transient envelope on MOD2: powers the FM knock and click burst, then cuts out cleanly
        patch.envelopes[1] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: secondsToEnvDecay(0.020), dest: DEST_MOD2, retrigger: 0x00 };
        patch.filter = { type: FILTER_LOWPASS, cutoff: 0xb8, res: 0x10 };
        break;

      case 1: // SNARE
        patch.name = 'M8FM SNR';
        patch.algo = 0x07; // [A>B]+[C>D]
        // Op C>D: Tonal drum body (shell thump)
        patch.operators[3] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0xb4, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        patch.operators[2] = { shape: OSC_SIN, ratio: 1, ratioFine: 0, level: 0x44, feedback: 0x00, modA: busToLevel(2), modB: 0x00 };
        // Op A>B: Snappy wire noise (white noise carrier + inharmonic square modulator)
        patch.operators[1] = { shape: OSC_NOI, ratio: 1, ratioFine: 0, level: 0xa8, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[0] = { shape: OSC_SQR, ratio: 4, ratioFine: 33, level: 0x38, feedback: 0x20, modA: 0x00, modB: 0x00 };
        // Volume envelope: snappy 0.24s decay
        patch.envelopes[0] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: secondsToEnvDecay(0.24), dest: DEST_VOLUME, retrigger: 0x00 };
        // Fast 0.08s body envelope on MOD2: body shell pops punchily then leaves crisp snare wires to sizzle
        patch.envelopes[1] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: secondsToEnvDecay(0.08), dest: DEST_MOD2, retrigger: 0x00 };
        // Warm lowpass filter to shape the noise into authentic snare wires
        patch.filter = { type: FILTER_LOWPASS, cutoff: 0xc8, res: 0x14 };
        break;

      case 2: // CLOSED HAT
        patch.name = 'M8FM CHH';
        patch.algo = 0x07; // [A>B]+[C>D]
        // Pair C>D: Sizzling high-frequency noise
        patch.operators[3] = { shape: OSC_NOI, ratio: 1, ratioFine: 0, level: 0xb0, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[2] = { shape: OSC_SQR, ratio: 7, ratioFine: 41, level: 0x30, feedback: 0x30, modA: 0x00, modB: 0x00 };
        // Pair A>B: Inharmonic metallic cluster (square wave chime)
        patch.operators[1] = { shape: OSC_SQR, ratio: 3, ratioFine: 17, level: 0x80, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[0] = { shape: OSC_SQR, ratio: 5, ratioFine: 83, level: 0x50, feedback: 0x40, modA: 0x00, modB: 0x00 };
        // Ultra-tight volume decay: 0.05s
        patch.envelopes[0] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: secondsToEnvDecay(0.05), dest: DEST_VOLUME, retrigger: 0x00 };
        // No pitch envelope
        patch.envelopes[1] = { amount: 0x00, attack: 0x00, hold: 0x00, decay: 0x00, dest: DEST_VOLUME, retrigger: 0x00 };
        // Steep highpass filter cuts out all low/mid frequencies for razor-sharp hat
        patch.filter = { type: FILTER_HIGHPASS, cutoff: 0xc6, res: 0x20 };
        break;

      case 3: // OPEN HAT
        patch.name = 'M8FM OHH';
        patch.algo = 0x07; // [A>B]+[C>D]
        // Pair C>D: High-frequency noise wash (sizzle)
        patch.operators[3] = { shape: OSC_NOI, ratio: 1, ratioFine: 0, level: 0xb8, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[2] = { shape: OSC_SQR, ratio: 7, ratioFine: 41, level: 0x38, feedback: 0x40, modA: 0x00, modB: 0x00 };
        // Pair A>B: Metallic inharmonic ring (square wave cluster)
        patch.operators[1] = { shape: OSC_SQR, ratio: 3, ratioFine: 17, level: 0x88, feedback: 0x00, modA: 0x00, modB: 0x00 };
        patch.operators[0] = { shape: OSC_SQR, ratio: 5, ratioFine: 83, level: 0x58, feedback: 0x50, modA: 0x00, modB: 0x00 };
        // Open cymbal sustain envelope: 0.48s decay
        patch.envelopes[0] = { amount: 0xff, attack: 0x00, hold: 0x00, decay: secondsToEnvDecay(0.48), dest: DEST_VOLUME, retrigger: 0x00 };
        // Initial strike filter envelope: opens the filter wide on the hit for instant sparkle, then settles into sizzle (no pitch drop!)
        patch.envelopes[1] = { amount: 0x38, attack: 0x00, hold: 0x00, decay: secondsToEnvDecay(0.06), dest: DEST_CUTOFF, retrigger: 0x00 };
        // Highpass filter for sparkling, airy cymbal sheen
        patch.filter = { type: FILTER_HIGHPASS, cutoff: 0xbc, res: 0x18 };
        break;
    }
    return patch;
  }
}
