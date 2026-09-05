import type { M8Patch } from './M8Patch';
import { clampByte } from './M8Patch';
// @ts-ignore - m8-js ships untyped CommonJS
import { dumpM8File } from 'm8-js';
// @ts-ignore - m8-js ships untyped CommonJS
import FMSynth from 'm8-js/lib/types/instruments/FMSynth';

/**
 * Copies an M8Patch onto an m8-js FMSynth instrument.
 *
 * A plain field copy, with no conversion of any kind. That is the whole point:
 * an M8Patch already holds raw M8 parameter values, so what the UI prints is
 * byte for byte what lands in the file and what you would key into the device by
 * hand. Any translation here would mean the numbers on screen were not the
 * numbers that make the sound.
 *
 * Split out from the file writer because a song embeds instruments directly
 * rather than as separate files.
 */
export function patchToFMSynth(patch: M8Patch): any {
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

  return instr;
}

function triggerDownload(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as any], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export class M8Serializer {
  public serializeFmInstrument(patch: M8Patch): Uint8Array {
    return dumpM8File(patchToFMSynth(patch));
  }

  public downloadM8Instrument(filename: string, patch: M8Patch) {
    const finalFilename = filename.endsWith('.m8i') ? filename : `${filename}.m8i`;
    const bytes = this.serializeFmInstrument(patch);
    triggerDownload(new Uint8Array(bytes), finalFilename);
  }

  public downloadM8Song(filename: string, songBytes: Uint8Array) {
    const finalFilename = filename.endsWith('.m8s') ? filename : `${filename}.m8s`;
    triggerDownload(songBytes, finalFilename);
  }
}
