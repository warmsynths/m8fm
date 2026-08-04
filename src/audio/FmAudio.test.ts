import { describe, it, expect } from 'vitest';
import { AnchorMacroConfig, MacroMapper } from './MacroMapper';
import type { AnchorName } from './MacroMapper';
import { MACHINES } from '../ui/MachineData';
import { M8Serializer } from './M8Serializer';
import { buildRenderSpec, noteToFrequency } from './FmEngine';
import {
  DEST_MOD2,
  DEST_VOLUME,
  M8_ALGO_ROUTING,
  decodeModSlot,
  encodeModSlot,
  envDecaySeconds,
  hex,
  modSlotToString,
  ratioToString,
  MOD_TARGET_FBK,
  MOD_TARGET_LEV
} from './M8Patch';
import type { M8Patch } from './M8Patch';
// @ts-ignore - plain JS worklet module, imported directly so the DSP can be
// rendered offline without an AudioContext.
import { M8FmRenderer } from './fm-processor.js';
// @ts-ignore
import fs from 'node:fs';
// @ts-ignore
import { loadM8File } from 'm8-js';

const SAMPLE_RATE = 44100;
const ANCHORS: AnchorName[] = [
  'Electric Piano', 'Sub Bass', 'Mallet', 'Pad', 'Digital Glitch', 'Vintage Lead'
];

function patchFor(anchor: AnchorName): M8Patch {
  return new MacroMapper(anchor).getPatch();
}

/**
 * The patch a machine's preset actually produces -- what the app loads and what
 * COPY TO M8 writes out, rather than the bare anchor with every macro at zero.
 */
function patchForPreset(anchor: AnchorName, presetIndex: number): M8Patch {
  const machine = MACHINES.find((m) => m.name === anchor)!;
  const mapper = new MacroMapper(anchor);
  const macroNames = AnchorMacroConfig[anchor];
  machine.presets[presetIndex][1].forEach((value, i) => {
    mapper.setMacro(macroNames[i], value / 100);
  });
  return mapper.getPatch();
}

/** Every machine crossed with every one of its presets. */
function allPresets(): { label: string; patch: M8Patch }[] {
  return MACHINES.flatMap((machine) =>
    machine.presets.map((preset, i) => ({
      label: `${machine.name} / ${preset[0]}`,
      patch: patchForPreset(machine.name as AnchorName, i)
    }))
  );
}

interface RenderResult {
  samples: Float32Array;
  peak: number;
  activeVoicesAtEnd: number;
}

/** Renders a patch offline: note on, held for `holdSeconds`, then note off. */
function render(patch: M8Patch, seconds: number, holdSeconds = seconds, note = 60): RenderResult {
  const renderer = new M8FmRenderer(SAMPLE_RATE);
  renderer.handleMessage({ type: 'spec', spec: buildRenderSpec(patch) });
  renderer.handleMessage({ type: 'volume', value: 1.0 });
  renderer.handleMessage({ type: 'noteOn', noteId: note, frequency: noteToFrequency(note), velocity: 1.0 });

  const blockSize = 128;
  const totalFrames = Math.ceil((seconds * SAMPLE_RATE) / blockSize) * blockSize;
  const releaseFrame = Math.floor(holdSeconds * SAMPLE_RATE);
  const samples = new Float32Array(totalFrames);
  const left = new Float32Array(blockSize);
  const right = new Float32Array(blockSize);

  let released = false;
  let peak = 0;

  for (let frame = 0; frame < totalFrames; frame += blockSize) {
    if (!released && frame >= releaseFrame) {
      renderer.handleMessage({ type: 'noteOff', noteId: note });
      released = true;
    }
    renderer.render(left, right, blockSize);
    for (let i = 0; i < blockSize; i++) {
      const value = (left[i] + right[i]) * 0.5;
      samples[frame + i] = value;
      const magnitude = Math.abs(value);
      if (magnitude > peak) peak = magnitude;
    }
  }

  return { samples, peak, activeVoicesAtEnd: renderer.activeVoiceCount };
}

/** RMS of the last `seconds` of a render. */
function tailRms(result: RenderResult, seconds: number): number {
  const count = Math.min(result.samples.length, Math.floor(seconds * SAMPLE_RATE));
  const start = result.samples.length - count;
  let sum = 0;
  for (let i = start; i < result.samples.length; i++) {
    sum += result.samples[i] * result.samples[i];
  }
  return Math.sqrt(sum / count);
}

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

interface Spectrum {
  power: Float64Array;
  binHz: number;
}

/** Power spectrum of a Hann-windowed slice, so leakage cannot fake up content. */
function spectrumAt(result: RenderResult, atSeconds: number, size: number): Spectrum {
  const start = Math.max(0, Math.min(Math.floor(atSeconds * SAMPLE_RATE), result.samples.length - size));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    re[i] = result.samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  fft(re, im);

  const power = new Float64Array(size / 2);
  for (let b = 0; b < size / 2; b++) power[b] = re[b] * re[b] + im[b] * im[b];
  return { power, binHz: SAMPLE_RATE / size };
}

/**
 * Fraction of spectral energy sitting above `harmonic` x the played note.
 * Measuring in harmonics rather than in Hz means the number describes timbre and
 * is comparable across the keyboard.
 *
 * The window has to be short enough to catch what is being measured: a struck
 * transient lasts a couple of hundred milliseconds and a long window averages it
 * away into the sustain.
 */
function brightness(result: RenderResult, f0: number, harmonic: number, atSeconds: number, size = 4096): number {
  const { power, binHz } = spectrumAt(result, atSeconds, size);
  const edge = harmonic * f0;
  let total = 0;
  let high = 0;
  for (let b = 1; b < power.length; b++) {
    total += power[b];
    if (b * binHz > edge) high += power[b];
  }
  return total > 0 ? high / total : 0;
}

/**
 * Fraction of spectral energy that is not sitting on a harmonic of the played
 * note.
 *
 * FM throws sidebands far above the highest operator frequency, and any that
 * cross Nyquist fold back at frequencies unrelated to the note. That fold-back
 * is what a clangy, metallic FM patch is made of, and because it depends on
 * absolute frequency it gets worse the higher up the keyboard you play. This is
 * the number that catches it.
 */
function inharmonicEnergy(result: RenderResult, f0: number, atSeconds: number): number {
  const size = 16384;
  const { power, binHz } = spectrumAt(result, atSeconds, size);
  // Hann leakage spreads a partial over a few bins either side of its peak.
  const tolerance = 3;
  let total = 0;
  let off = 0;
  for (let b = 1; b < power.length; b++) {
    total += power[b];
    const harmonic = (b * binHz) / f0;
    if ((Math.abs(harmonic - Math.round(harmonic)) * f0) / binHz > tolerance) off += power[b];
  }
  return total > 0 ? off / total : 0;
}

describe('M8 patch model', () => {
  it('round-trips MOD slot values', () => {
    expect(modSlotToString(0)).toBe('-----');
    expect(modSlotToString(encodeModSlot(2, MOD_TARGET_LEV))).toBe('2▸LEV');
    expect(modSlotToString(encodeModSlot(4, MOD_TARGET_FBK))).toBe('4▸FBK');
    expect(modSlotToString(undefined)).toBe('-----');

    for (let slot = 1; slot <= 16; slot++) {
      const decoded = decodeModSlot(slot)!;
      expect(encodeModSlot(decoded.bus, decoded.target)).toBe(slot);
    }
    expect(decodeModSlot(0)).toBeNull();
  });

  it('routes every algorithm from lower to higher operators', () => {
    // The worklet evaluates operators A..D in one pass, which is only correct
    // if no operator is modulated by a later one.
    for (const routing of M8_ALGO_ROUTING) {
      expect(routing.carriers.length).toBeGreaterThan(0);
      routing.sources.forEach((sources, target) => {
        for (const source of sources) {
          expect(source).toBeLessThan(target);
        }
      });
    }
  });

  it('keeps envelope times monotonic across the parameter range', () => {
    let previous = -1;
    for (let v = 0; v <= 255; v += 5) {
      const seconds = envDecaySeconds(v);
      expect(seconds).toBeGreaterThan(previous);
      previous = seconds;
    }
    expect(envDecaySeconds(0)).toBe(0);
  });
});

describe('Electric Piano patch', () => {
  const patch = patchFor('Electric Piano');

  it('is built as a tine pair plus a body pair', () => {
    expect(patch.algo).toBe(0x07); // [A>B]+[C>D]
    // The body pair sits at unison, so the note itself is a plain 1:1 pair and
    // the tine is mixed in alongside rather than stacked on top of it.
    expect(ratioToString(patch.operators[2])).toBe('01.00');
    expect(ratioToString(patch.operators[3])).toBe('01.00');
    expect(patch.operators[3].level).toBeGreaterThan(patch.operators[2].level);
  });

  it('gives every carrier a whole-number ratio', () => {
    // A fractional carrier ratio is not an overtone of the note, it is a
    // separate pitch. Three carriers at 00.50, 01.00 and 01.50 are a 1:2:3
    // series on the sub-octave -- an organ registration, not a piano.
    for (const opIndex of [1, 3]) {
      expect(patch.operators[opIndex].ratioFine, `Op ${'ABCD'[opIndex]} ratioFine`).toBe(0);
    }
    expect(patch.operators[0].ratioFine).toBe(0);
    expect(patch.operators[0].feedback).toBe(0x00);
  });

  it('drives its amplitude from ENV1 on VOLUME', () => {
    // This is the fix for the buzzing drone: an FMSYNTH has no implicit amp
    // envelope, so without a modulator aimed at VOLUME the operators just run
    // flat out for as long as the note is held.
    expect(patch.envelopes[0].dest).toBe(DEST_VOLUME);
    expect(patch.envelopes[0].amount).toBe(0xff);
    expect(patch.envelopes[0].decay).toBeGreaterThan(0x80);
  });

  it('rides the whole tine pair on MOD 2, so the strike fades out', () => {
    expect(patch.envelopes[1].dest).toBe(DEST_MOD2);
    // Both the tine modulator and its carrier subscribe, so the ping loses
    // brightness and level together instead of ringing on at fixed volume.
    for (const opIndex of [0, 1]) {
      const slot = decodeModSlot(patch.operators[opIndex].modA)!;
      expect(slot.bus, `Op ${'ABCD'[opIndex]} bus`).toBe(2);
      expect(slot.target, `Op ${'ABCD'[opIndex]} target`).toBe(MOD_TARGET_LEV);
    }
  });
});

describe('audio rendering', () => {
  it('falls silent and frees its voice after the volume envelope runs out', () => {
    const patch = patchFor('Electric Piano');
    // ENV1 decay 0x9A is about 2.2s, so 6s is well past the end of the note.
    const result = render(patch, 6.0, 6.0);

    expect(result.peak).toBeGreaterThan(0.01);
    expect(tailRms(result, 0.5)).toBeLessThan(1e-4);
    expect(result.activeVoicesAtEnd).toBe(0);
  });

  it('releases the voice promptly on note off', () => {
    const patch = patchFor('Pad'); // long envelope, so only note-off can stop it
    const result = render(patch, 3.0, 1.5);

    expect(result.peak).toBeGreaterThan(0.005);
    expect(tailRms(result, 0.5)).toBeLessThan(1e-4);
    expect(result.activeVoicesAtEnd).toBe(0);
  });

  it('never leaks voices when notes are re-triggered', () => {
    const renderer = new M8FmRenderer(SAMPLE_RATE);
    renderer.handleMessage({ type: 'spec', spec: buildRenderSpec(patchFor('Electric Piano')) });
    const left = new Float32Array(128);
    const right = new Float32Array(128);

    for (let i = 0; i < 200; i++) {
      renderer.handleMessage({ type: 'noteOn', noteId: 60 + (i % 24), frequency: 220 + i, velocity: 1 });
      renderer.render(left, right, 128);
    }
    expect(renderer.activeVoiceCount).toBeLessThanOrEqual(8);

    renderer.handleMessage({ type: 'allNotesOff' });
    for (let i = 0; i < 200; i++) renderer.render(left, right, 128);
    expect(renderer.activeVoiceCount).toBe(0);
  });

  it('gives the piano a bright strike over a near-sine body', () => {
    // This is the shape that was missing. With no envelope reaching the tine
    // the patch sat at its peak brightness forever, which is a metallic ring
    // rather than a struck piano.
    const f0 = noteToFrequency(60);
    const result = render(patchForPreset('Electric Piano', 0), 2.0, 2.0);

    // A short window for the strike: the tine only lasts a couple of hundred
    // milliseconds, and a long one averages it into the sustain.
    const strike = brightness(result, f0, 4, 0.004, 2048);
    const body = brightness(result, f0, 4, 0.7);

    expect(strike, 'the tine should be audible').toBeGreaterThan(0.05);
    expect(body, 'the body should be close to a sine').toBeLessThan(0.02);
    expect(strike).toBeGreaterThan(body * 5);
  });

  it('stays on the harmonic series instead of aliasing into clang', () => {
    // FM sidebands that cross Nyquist fold back at inharmonic frequencies, and
    // because that depends on absolute pitch it gets worse the higher you play.
    // The operators run oversampled specifically so this stays negligible.
    const patch = patchForPreset('Electric Piano', 1); // the brightest EP preset
    for (const note of [36, 60, 84]) {
      const f0 = noteToFrequency(note);
      const result = render(patch, 1.2, 1.2, note);
      const off = inharmonicEnergy(result, f0, 0.02);
      expect(off, `note ${note} inharmonic energy`).toBeLessThan(0.05);
    }
  });

  it('produces sound, then silence, at a sane level for every preset', () => {
    for (const { label, patch } of allPresets()) {
      const result = render(patch, 8.0, 2.0);
      expect(result.peak, `${label} made no sound`).toBeGreaterThan(0.01);
      // The output soft-clips, so a preset pinned near 1.0 is one that is
      // driving the limiter rather than one that is simply loud.
      expect(result.peak, `${label} is slamming the output`).toBeLessThan(0.9);
      expect(result.activeVoicesAtEnd, `${label} left a voice running`).toBe(0);
    }
  });

  it('holds its timbre constant across the keyboard', () => {
    // Phase modulation keeps the same harmonic ratio at any pitch. The old
    // linear-FM engine had to clamp its deviation to stay stable, so the timbre
    // thinned out as you played up the keyboard.
    const patch = patchForPreset('Electric Piano', 0);
    const ratios = [36, 60, 84].map((note) => {
      const result = render(patch, 1.0, 1.0, note);
      return brightness(result, noteToFrequency(note), 4, 0.3);
    });

    const spread = Math.max(...ratios) - Math.min(...ratios);
    expect(spread, `brightness by octave: ${ratios.map((r) => r.toFixed(3)).join(', ')}`).toBeLessThan(0.1);
  });
});

describe('.m8i export', () => {
  it('writes exactly the values the UI shows, with no conversion in between', () => {
    const patch = patchFor('Electric Piano');
    const bytes = new M8Serializer().serializeFmInstrument(patch);
    const written = loadM8File(bytes).asObject();

    expect(written.kindStr).toBe('FMSYNTH');
    expect(written.instrParams.algo).toBe(patch.algo);
    expect(written.instrParams.algoStr).toBe('[A>B]+[C>D]');
    expect(written.volume).toBe(patch.volume);

    expect([
      written.instrParams.mod1,
      written.instrParams.mod2,
      written.instrParams.mod3,
      written.instrParams.mod4
    ]).toEqual(patch.mods);

    for (let i = 0; i < 4; i++) {
      const label = ['A', 'B', 'C', 'D'][i];
      const op = written.instrParams.operators[i];
      expect(op.shape, `Op ${label} shape`).toBe(patch.operators[i].shape);
      expect(op.ratio, `Op ${label} ratio`).toBe(patch.operators[i].ratio);
      expect(op.ratioFine, `Op ${label} ratioFine`).toBe(patch.operators[i].ratioFine);
      expect(op.level, `Op ${label} level`).toBe(patch.operators[i].level);
      expect(op.feedback, `Op ${label} feedback`).toBe(patch.operators[i].feedback);
      expect(op.modA, `Op ${label} modA`).toBe(patch.operators[i].modA);
      expect(op.modB, `Op ${label} modB`).toBe(patch.operators[i].modB);
    }

    for (let i = 0; i < 2; i++) {
      const env = written.envelopes[i];
      expect(env.amount, `Env${i + 1} amount`).toBe(patch.envelopes[i].amount);
      expect(env.attack, `Env${i + 1} attack`).toBe(patch.envelopes[i].attack);
      expect(env.hold, `Env${i + 1} hold`).toBe(patch.envelopes[i].hold);
      expect(env.decay, `Env${i + 1} decay`).toBe(patch.envelopes[i].decay);
      expect(env.dest, `Env${i + 1} dest`).toBe(patch.envelopes[i].dest);

      const lfo = written.lfos[i];
      expect(lfo.amount, `Lfo${i + 1} amount`).toBe(patch.lfos[i].amount);
      expect(lfo.shape, `Lfo${i + 1} shape`).toBe(patch.lfos[i].shape);
      expect(lfo.freq, `Lfo${i + 1} freq`).toBe(patch.lfos[i].freq);
      expect(lfo.dest, `Lfo${i + 1} dest`).toBe(patch.lfos[i].dest);
      expect(lfo.triggerMode, `Lfo${i + 1} trigger`).toBe(patch.lfos[i].trigger);
    }

    expect(written.filterParams.type).toBe(patch.filter.type);
    expect(written.filterParams.cutoff).toBe(patch.filter.cutoff);
    expect(written.filterParams.res).toBe(patch.filter.res);
    expect(written.mixerParams.cho).toBe(patch.mixer.cho);
    expect(written.mixerParams.dry).toBe(patch.mixer.dry);
    expect(written.mixerParams.pan).toBe(patch.mixer.pan);
  });

  it('exports every machine as a loadable FMSYNTH instrument', () => {
    const serializer = new M8Serializer();
    for (const anchor of ANCHORS) {
      const patch = patchFor(anchor);
      const written = loadM8File(serializer.serializeFmInstrument(patch)).asObject();
      expect(written.kindStr, anchor).toBe('FMSYNTH');
      expect(written.instrParams.algo, anchor).toBe(patch.algo);
    }
  });
});

describe('comparison against a reference .m8i', () => {
  // Point M8FM_REFERENCE_M8I at a real instrument dumped from the device to
  // diff this app's Electric Piano against it. Skipped when unset.
  const referencePath: string | undefined = (globalThis as any).process?.env?.M8FM_REFERENCE_M8I;

  it.skipIf(!referencePath || !fs.existsSync(referencePath))('matches the reference instrument', () => {
    const reference = loadM8File(fs.readFileSync(referencePath!)).asObject();
    const patch = patchFor('Electric Piano');
    const generated = loadM8File(new M8Serializer().serializeFmInstrument(patch)).asObject();

    const differences: string[] = [];
    const compare = (label: string, mine: number, theirs: number) => {
      if (mine !== theirs) differences.push(`${label}: app ${hex(mine)} vs device ${hex(theirs)}`);
    };

    compare('ALGO', generated.instrParams.algo, reference.instrParams.algo);
    for (let i = 0; i < 4; i++) {
      const label = ['A', 'B', 'C', 'D'][i];
      const mine = generated.instrParams.operators[i];
      const theirs = reference.instrParams.operators[i];
      compare(`OP ${label} RATIO`, mine.ratio, theirs.ratio);
      compare(`OP ${label} RATIOFINE`, mine.ratioFine, theirs.ratioFine);
      compare(`OP ${label} LEVEL`, mine.level, theirs.level);
      compare(`OP ${label} FBK`, mine.feedback, theirs.feedback);
      compare(`OP ${label} MOD A`, mine.modA, theirs.modA);
      compare(`OP ${label} MOD B`, mine.modB, theirs.modB);
    }
    for (let i = 0; i < 2; i++) {
      compare(`ENV${i + 1} DEST`, generated.envelopes[i].dest, reference.envelopes[i].dest);
      compare(`ENV${i + 1} AMOUNT`, generated.envelopes[i].amount, reference.envelopes[i].amount);
      compare(`ENV${i + 1} DECAY`, generated.envelopes[i].decay, reference.envelopes[i].decay);
    }

    expect(differences, `differences from ${referencePath}`).toEqual([]);
  });
});
