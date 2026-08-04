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

/**
 * Fraction of spectral energy sitting above `harmonic` x the played note, via a
 * naive DFT over a short window. Measuring in harmonics rather than in Hz means
 * the number describes timbre and is comparable across the keyboard: a silky FM
 * piano keeps its energy in the low partials, while a patch that has broken into
 * buzz smears it across the spectrum.
 */
function brightness(result: RenderResult, f0: number, harmonic: number, atSeconds: number): number {
  const size = 4096;
  const start = Math.min(Math.floor(atSeconds * SAMPLE_RATE), result.samples.length - size);
  const edge = harmonic * f0;
  let total = 0;
  let high = 0;

  for (let bin = 1; bin < size / 2; bin++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < size; n++) {
      // Hann window, so leakage does not fake up high-frequency content.
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (size - 1));
      const angle = (-2 * Math.PI * bin * n) / size;
      const s = result.samples[start + n] * w;
      re += s * Math.cos(angle);
      im += s * Math.sin(angle);
    }
    const power = re * re + im * im;
    total += power;
    if ((bin * SAMPLE_RATE) / size > edge) high += power;
  }

  return total > 0 ? high / total : 0;
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

  it('uses the E PIANO algorithm with a 3:1 tine modulator', () => {
    expect(patch.algo).toBe(0x08);
    expect(ratioToString(patch.operators[0])).toBe('03.00');
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

  it('wires the tine transient through MOD 2, which Op A subscribes to', () => {
    expect(patch.envelopes[1].dest).toBe(DEST_MOD2);
    const slot = decodeModSlot(patch.operators[0].modA)!;
    expect(slot.bus).toBe(2);
    expect(slot.target).toBe(MOD_TARGET_LEV);
  });

  it('keeps the fifth-ratio carrier below the root', () => {
    // Op C at 1.50 sitting level with Op D at 1.00 stops reading as an overtone
    // and starts reading as an organ.
    expect(ratioToString(patch.operators[2])).toBe('01.50');
    expect(patch.operators[2].level).toBeLessThan(patch.operators[3].level);
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
    // modulator the patch sat at its peak brightness forever, which is the
    // metallic buzz rather than a struck piano.
    const f0 = noteToFrequency(60);
    const result = render(patchForPreset('Electric Piano', 0), 2.0, 2.0);

    const strike = brightness(result, f0, 4, 0.03);
    const body = brightness(result, f0, 4, 0.6);

    expect(strike).toBeGreaterThan(0.25);
    expect(body).toBeLessThan(0.2);
    expect(strike).toBeGreaterThan(body * 3);
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
    expect(written.instrParams.algoStr).toBe('[A>B]+[A>C]+[A>D]');
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
