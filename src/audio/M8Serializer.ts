import type { M8Patch } from './M8Patch';
import { clampByte } from './M8Patch';
// @ts-ignore - m8-js ships untyped CommonJS
import { dumpM8File } from 'm8-js';
// @ts-ignore - m8-js ships untyped CommonJS
import FMSynth from 'm8-js/lib/types/instruments/FMSynth';

/**
 * Writes an M8Patch to a .m8i file.
 *
 * Because M8Patch already holds raw M8 parameter values, this is a plain field
 * copy with no unit conversion at all. That is the point: whatever the UI shows
 * is exactly what lands in the file, and exactly what you would key into the
 * device by hand.
 */
export class M8Serializer {
  public serializeFmInstrument(patch: M8Patch): Uint8Array {
    const instr = new FMSynth();

    instr.name = patch.name.slice(0, 12);
    instr.volume = clampByte(patch.volume);
    instr.pitch = clampByte(patch.pitch);
    instr.fineTune = clampByte(patch.fineTune);

    instr.instrParams.algo = patch.algo;
    instr.instrParams.mod1 = clampByte(patch.mods[0]);
    instr.instrParams.mod2 = clampByte(patch.mods[1]);
    instr.instrParams.mod3 = clampByte(patch.mods[2]);
    instr.instrParams.mod4 = clampByte(patch.mods[3]);

    for (let i = 0; i < 4; i++) {
      const op = patch.operators[i];
      const target = instr.instrParams.operators[i];
      target.shape = op.shape;
      target.ratio = op.ratio;
      target.ratioFine = op.ratioFine;
      target.level = clampByte(op.level);
      target.feedback = clampByte(op.feedback);
      target.modA = op.modA;
      target.modB = op.modB;
    }

    for (let i = 0; i < 2; i++) {
      const env = patch.envelopes[i];
      const target = instr.envelopes[i];
      target.amount = clampByte(env.amount);
      target.attack = clampByte(env.attack);
      target.hold = clampByte(env.hold);
      target.decay = clampByte(env.decay);
      target.dest = env.dest;
      target.retrigger = env.retrigger;
    }

    for (let i = 0; i < Math.min(2, instr.lfos.length); i++) {
      const lfo = patch.lfos[i];
      const target = instr.lfos[i];
      target.amount = clampByte(lfo.amount);
      target.shape = lfo.shape;
      target.triggerMode = lfo.trigger;
      target.freq = clampByte(lfo.freq);
      target.dest = lfo.dest;
    }

    instr.filterParams.type = patch.filter.type;
    instr.filterParams.cutoff = clampByte(patch.filter.cutoff);
    instr.filterParams.res = clampByte(patch.filter.res);

    instr.ampParams.amp = clampByte(patch.mixer.amp);
    instr.ampParams.limit = clampByte(patch.mixer.lim);

    instr.mixerParams.pan = clampByte(patch.mixer.pan);
    instr.mixerParams.dry = clampByte(patch.mixer.dry);
    instr.mixerParams.cho = clampByte(patch.mixer.cho);
    instr.mixerParams.del = clampByte(patch.mixer.del);
    instr.mixerParams.rev = clampByte(patch.mixer.rev);

    return dumpM8File(instr);
  }

  public downloadM8Instrument(filename: string, patch: M8Patch) {
    const bytes = this.serializeFmInstrument(patch);
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
