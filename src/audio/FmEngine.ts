import workletUrl from './fm-processor.js?url';
import {
  CUTOFF_MAX_HZ,
  CUTOFF_MIN_HZ,
  MAX_FEEDBACK_CYCLES,
  MAX_PM_CYCLES,
  M8_ALGO_ROUTING,
  decodeModSlot,
  envAttackSeconds,
  envDecaySeconds,
  envHoldSeconds,
  lfoFreqHz,
  ratioToMultiplier
} from './M8Patch';
import type { M8Patch } from './M8Patch';

/**
 * Everything the worklet needs to render a patch, with M8 parameter values
 * already resolved into audio units. Built here so the conversion curves in
 * M8Patch.ts stay the only interpretation of a raw M8 value anywhere in the app.
 */
export interface RenderSpec {
  sources: number[][];
  carriers: number[];
  ops: {
    shape: number;
    ratio: number;
    level: number;
    feedback: number;
    isCarrier: boolean;
    slots: { bus: number; target: number }[];
  }[];
  mods: number[];
  envs: { amount: number; attack: number; hold: number; decay: number; dest: number }[];
  lfos: { amount: number; shape: number; trigger: number; freq: number; dest: number }[];
  filter: { type: number; cutoff: number; res: number };
  volume: number;
  amp: number;
  pan: number;
  dry: number;
  chorus: number;
  maxPmCycles: number;
  maxFeedbackCycles: number;
  cutoffMinHz: number;
  cutoffMaxHz: number;
}

/** DRY 0xC0 is the M8's default and is treated as unity here. */
const DRY_UNITY = 0xc0;

export function buildRenderSpec(patch: M8Patch): RenderSpec {
  const routing = M8_ALGO_ROUTING[patch.algo] || M8_ALGO_ROUTING[0];

  return {
    sources: routing.sources,
    carriers: routing.carriers,
    ops: patch.operators.slice(0, 4).map((op, i) => ({
      shape: op.shape,
      ratio: ratioToMultiplier(op),
      level: op.level / 255,
      feedback: op.feedback / 255,
      isCarrier: routing.carriers.indexOf(i) !== -1,
      slots: [op.modA, op.modB]
        .map(decodeModSlot)
        .filter((slot): slot is { bus: number; target: number } => slot !== null)
    })),
    mods: patch.mods.map((m) => m / 255),
    envs: patch.envelopes.map((env) => ({
      amount: env.amount / 255,
      attack: envAttackSeconds(env.attack),
      hold: envHoldSeconds(env.hold),
      decay: envDecaySeconds(env.decay),
      dest: env.dest
    })),
    lfos: patch.lfos.map((lfo) => ({
      amount: lfo.amount / 255,
      shape: lfo.shape,
      trigger: lfo.trigger,
      freq: lfoFreqHz(lfo.freq),
      dest: lfo.dest
    })),
    filter: {
      type: patch.filter.type,
      cutoff: patch.filter.cutoff / 255,
      res: patch.filter.res / 255
    },
    volume: patch.volume / 255,
    amp: patch.mixer.amp / 255,
    pan: (patch.mixer.pan - 0x80) / 0x7f,
    dry: patch.mixer.dry / DRY_UNITY,
    chorus: patch.mixer.cho / 255,
    maxPmCycles: MAX_PM_CYCLES,
    maxFeedbackCycles: MAX_FEEDBACK_CYCLES,
    cutoffMinHz: CUTOFF_MIN_HZ,
    cutoffMaxHz: CUTOFF_MAX_HZ
  };
}

/** MIDI note number to frequency, A4 = 440 Hz. */
export function noteToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Owns the AudioContext graph and forwards patches and note events to the
 * worklet. All synthesis lives in fm-processor.js; this class only marshals.
 */
export class FmEngine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private ready: Promise<void> | null = null;
  private pendingSpec: RenderSpec | null = null;
  private volume = 0.5;

  public async init(audioCtx: AudioContext): Promise<void> {
    if (this.ready) return this.ready;
    this.ctx = audioCtx;
    this.ready = audioCtx.audioWorklet
      .addModule(workletUrl)
      .then(() => {
        this.node = new AudioWorkletNode(audioCtx, 'm8-fm-voice', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2]
        });
        this.node.connect(audioCtx.destination);
        this.post({ type: 'volume', value: this.volume });
        if (this.pendingSpec) {
          this.post({ type: 'spec', spec: this.pendingSpec });
          this.pendingSpec = null;
        }
      })
      .catch((err) => {
        console.error('Failed to start the M8 FM worklet:', err);
        throw err;
      });
    return this.ready;
  }

  private post(message: unknown) {
    if (this.node) {
      this.node.port.postMessage(message);
    }
  }

  public applyPatch(patch: M8Patch) {
    const spec = buildRenderSpec(patch);
    if (this.node) {
      this.post({ type: 'spec', spec });
    } else {
      this.pendingSpec = spec;
    }
  }

  public noteOn(noteId: number, frequency: number, velocity = 1.0) {
    this.post({ type: 'noteOn', noteId, frequency, velocity });
  }

  public noteOff(noteId: number) {
    this.post({ type: 'noteOff', noteId });
  }

  public allNotesOff() {
    this.post({ type: 'allNotesOff' });
  }

  public setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    this.post({ type: 'volume', value: this.volume });
  }

  public get context(): AudioContext | null {
    return this.ctx;
  }
}
