import type { M8Patch } from './M8Patch';
import { M8_ALGO_ROUTING, clampByte } from './M8Patch';
// @ts-ignore - m8-js ships untyped CommonJS
import { dumpM8File } from 'm8-js';
// @ts-ignore - m8-js ships untyped CommonJS
import FMSynth from 'm8-js/lib/types/instruments/FMSynth';
import compensationData from './m8-compensation.json';

/**
 * Piecewise-linear compensation from app parameter values (0-255) to M8 hardware bytes (0-255),
 * derived from hardware calibration recordings.
 */
export function compensate(parameter: string, appValue: number): number {
  const v = clampByte(appValue);
  const points = (compensationData.curves as Record<string, number[][]>)[parameter];
  if (!points || points.length === 0) return v;

  if (v <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (v >= last[0]) return last[1];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (v >= p0[0] && v <= p1[0]) {
      const span = p1[0] - p0[0];
      const frac = span > 0 ? (v - p0[0]) / span : 0;
      return clampByte(Math.round(p0[1] + frac * (p1[1] - p0[1])));
    }
  }
  return v;
}

export interface SerializeOptions {
  /** If true (default), applies hardware calibration compensation to match app sound on M8. */
  compensate?: boolean;
}

/**
 * Copies an M8Patch onto an m8-js FMSynth instrument, optionally applying calibration compensation.
 *
 * Split out from the file writer because a song embeds instruments directly
 * rather than as separate files.
 */
export function patchToFMSynth(patch: M8Patch, options: SerializeOptions = {}): any {
  const shouldCompensate = options.compensate ?? true;
  const comp = (param: string, val: number) => (shouldCompensate ? compensate(param, val) : clampByte(val));

  const instr = new FMSynth();

  instr.name = patch.name.slice(0, 12);
  instr.volume = clampByte(patch.volume);
  instr.pitch = clampByte(patch.pitch);
  instr.fineTune = clampByte(patch.fineTune);

  instr.instrParams.algo = patch.algo;
  instr.instrParams.mod1 = comp('modBus', patch.mods[0]);
  instr.instrParams.mod2 = comp('modBus', patch.mods[1]);
  instr.instrParams.mod3 = comp('modBus', patch.mods[2]);
  instr.instrParams.mod4 = comp('modBus', patch.mods[3]);

  const routing = M8_ALGO_ROUTING[patch.algo] || M8_ALGO_ROUTING[0];

  for (let i = 0; i < 4; i++) {
    const op = patch.operators[i];
    const target = instr.instrParams.operators[i];
    target.shape = op.shape;
    target.ratio = op.ratio;
    target.ratioFine = op.ratioFine;
    const isCarrier = routing.carriers.indexOf(i) !== -1;
    target.level = comp(isCarrier ? 'opLevelCarrier' : 'opLevelModulator', op.level);
    target.feedback = comp('opFeedback', op.feedback);
    target.modA = op.modA;
    target.modB = op.modB;
  }

  for (let i = 0; i < 2; i++) {
    const env = patch.envelopes[i];
    const target = instr.envelopes[i];
    target.amount = clampByte(env.amount);
    target.attack = clampByte(env.attack);
    target.hold = clampByte(env.hold);
    target.decay = comp('envDecay', env.decay);
    target.dest = env.dest;
    target.retrigger = env.retrigger;
  }

  for (let i = 0; i < Math.min(2, instr.lfos.length); i++) {
    const lfo = patch.lfos[i];
    const target = instr.lfos[i];
    target.amount = clampByte(lfo.amount);
    target.shape = lfo.shape;
    target.triggerMode = lfo.trigger;
    target.freq = comp('lfoFreq', lfo.freq);
    target.dest = lfo.dest;
  }

  instr.filterParams.type = patch.filter.type;
  instr.filterParams.cutoff = comp('filterCutoff', patch.filter.cutoff);
  instr.filterParams.res = comp('filterRes', patch.filter.res);

  instr.ampParams.amp = clampByte(patch.mixer.amp);
  instr.ampParams.limit = clampByte(patch.mixer.lim);

  instr.mixerParams.pan = clampByte(patch.mixer.pan);
  instr.mixerParams.dry = clampByte(patch.mixer.dry);
  instr.mixerParams.cho = clampByte(patch.mixer.cho);
  instr.mixerParams.del = clampByte(patch.mixer.del);
  instr.mixerParams.rev = clampByte(patch.mixer.rev);

  return instr;
}

export class M8Serializer {
  public serializeFmInstrument(patch: M8Patch, options: SerializeOptions = {}): Uint8Array {
    return dumpM8File(patchToFMSynth(patch, options));
  }

  public downloadM8Instrument(filename: string, patch: M8Patch, options: SerializeOptions = {}) {
    const bytes = this.serializeFmInstrument(patch, options);
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.m8i') ? filename : `${filename}.m8i`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
