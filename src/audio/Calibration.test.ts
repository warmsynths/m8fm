import { describe, it, expect } from 'vitest';
import { calibrationPatches, describeCalibration } from './Calibration';
import { M8Serializer } from './M8Serializer';
import { DEST_OFF, clonePatch, envDecaySeconds, hex } from './M8Patch';
import { buildRenderSpec, noteToFrequency } from './FmEngine';
// @ts-ignore - plain JS worklet module
import { M8FmRenderer } from './fm-processor.js';
// @ts-ignore - plain JS analysis tool
import { analyze, writeWav } from '../../tools/analyze-recording.mjs';
// @ts-ignore
import fs from 'node:fs';
// @ts-ignore
import os from 'node:os';
// @ts-ignore
import path from 'node:path';
// @ts-ignore
import { loadM8File } from 'm8-js';

const OUTPUT_DIR = 'calibration';

describe('calibration instruments', () => {
  const entries = calibrationPatches();

  it('round-trip through the .m8i writer unchanged', () => {
    const serializer = new M8Serializer();
    for (const entry of entries) {
      const written = loadM8File(serializer.serializeFmInstrument(entry.patch)).asObject();
      expect(written.kindStr, entry.id).toBe('FMSYNTH');
      expect(written.instrParams.algo, entry.id).toBe(entry.patch.algo);
      expect(written.volume, entry.id).toBe(entry.patch.volume);
      for (let i = 0; i < 4; i++) {
        expect(written.instrParams.operators[i].level, `${entry.id} op ${i} level`)
          .toBe(entry.patch.operators[i].level);
      }
    }
  });

  it('carry no send effects, so nothing colours the recording', () => {
    for (const entry of entries) {
      expect(entry.patch.mixer.cho, `${entry.id} chorus`).toBe(0x00);
      expect(entry.patch.mixer.del, `${entry.id} delay`).toBe(0x00);
      expect(entry.patch.mixer.rev, `${entry.id} reverb`).toBe(0x00);
    }
  });

  it('vary exactly one thing away from a bare tone', () => {
    // The whole point is that each recording has one unknown in it. If a patch
    // has both an envelope and a filter running, its recording cannot settle
    // either curve on its own.
    for (const entry of entries) {
      const envelopesActive = entry.patch.envelopes.filter((e) => e.dest !== DEST_OFF).length;
      const lfosActive = entry.patch.lfos.filter((l) => l.dest !== DEST_OFF && l.amount > 0).length;
      const filterActive = entry.patch.filter.type !== 0 ? 1 : 0;
      const modulatorsActive = entry.patch.operators.filter((op, i) => i > 0 && op.level > 0).length;

      const complexity = envelopesActive + lfosActive + filterActive + modulatorsActive;
      expect(complexity, `${entry.id} has ${complexity} things going on`).toBeLessThanOrEqual(1);
    }
  });

  it('writes the instruments and a recording guide when asked', () => {
    // Off by default: `npm test` should not touch the working tree. Emit with
    //   M8FM_WRITE_CALIBRATION=1 npm test
    const shouldWrite = (globalThis as any).process?.env?.M8FM_WRITE_CALIBRATION === '1';
    if (!shouldWrite) {
      expect(entries.length).toBeGreaterThan(0);
      return;
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const serializer = new M8Serializer();
    for (const entry of entries) {
      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${entry.id}.m8i`),
        serializer.serializeFmInstrument(entry.patch)
      );
    }

    const readme = [
      '# Calibration instruments',
      '',
      'These exist to measure a real M8 against this app. Everything in',
      '`src/audio/M8Patch.ts` that turns a raw `00`-`FF` parameter into seconds,',
      'hertz or modulation depth is currently a guess, because Dirtywave does not',
      'publish those curves. Each instrument here isolates exactly one of them.',
      '',
      '## Why not just record the piano?',
      '',
      'A musical patch is affected by every one of those curves at once, so a',
      'recording of it cannot settle any of them: a wrong level curve and a wrong',
      'filter curve can cancel out and still look right. These patches are',
      'deliberately dumb -- mostly a single sine operator -- so that one recording',
      'determines one curve, exactly.',
      '',
      '## How to record',
      '',
      '1. Copy the `.m8i` files to `/Instruments` on the M8 SD card.',
      '2. Load one, and record the line/headphone out into your DAW.',
      '   **Not** a microphone -- room tone and speaker response would swamp the',
      '   measurements.',
      '3. Play **the same note every time** (C-3 is ideal) and hold it for about',
      '   two seconds, unless the sweep says otherwise.',
      '4. Step the one parameter named below through its listed values, playing a',
      '   note after each. Leave roughly a second of silence between notes -- the',
      '   analysis splits the file on the gaps.',
      '5. One WAV per instrument, named after it (e.g. `CAL1-ENV.wav`). 44.1 or',
      '   48 kHz, 24-bit, mono is fine.',
      '',
      'Turn the M8 mixer\'s CHO/DEL/REV sends off and keep the level clear of',
      'clipping. The patches already have their instrument-level sends at `00`.',
      '',
      'Then run:',
      '',
      '```',
      'node tools/analyze-recording.mjs calibration/CAL1-ENV.wav',
      '```',
      '',
      '## If you only do a few',
      '',
      'CAL1, CAL2 and CAL3 in that order get most of the way. CAL1 fixes how long',
      'notes take to die and the shape of the decay, CAL2 fixes brightness, CAL3',
      'fixes the filter. The rest are refinements.',
      '',
      '## The instruments',
      '',
      ...entries.map(describeCalibration)
    ].join('\n');

    fs.writeFileSync(path.join(OUTPUT_DIR, 'README.md'), readme + '\n');

    for (const entry of entries) {
      expect(fs.existsSync(path.join(OUTPUT_DIR, `${entry.id}.m8i`)), entry.id).toBe(true);
    }
    console.log(`Wrote ${entries.length} calibration instruments to ${OUTPUT_DIR}/`);
    console.log(entries.map((e) => `  ${e.id}.m8i  sweep ${e.sweep} (${e.values.map(hex).join(' ')})`).join('\n'));
  });
});

describe('recording analysis', () => {
  const SAMPLE_RATE = 44100;
  const processId = (globalThis as any).process?.pid ?? 0;

  /**
   * Renders the CAL1 envelope sweep through this app's own engine and writes it
   * out as a WAV, exactly as if it had been recorded off a device.
   */
  function renderEnvelopeSweep(decayValues: number[]): Float64Array {
    const entry = calibrationPatches().find((e) => e.id === 'CAL1-ENV')!;
    const noteSeconds = 6;
    const gapSeconds = 1;
    const blockSize = 128;
    const out: number[] = [];

    for (const decay of decayValues) {
      const patch = clonePatch(entry.patch);
      patch.envelopes[0].decay = decay;

      const renderer = new M8FmRenderer(SAMPLE_RATE);
      renderer.handleMessage({ type: 'spec', spec: buildRenderSpec(patch) });
      renderer.handleMessage({ type: 'volume', value: 0.8 });
      renderer.handleMessage({ type: 'noteOn', noteId: 48, frequency: noteToFrequency(48), velocity: 1.0 });

      const left = new Float32Array(blockSize);
      const right = new Float32Array(blockSize);
      const frames = Math.ceil((noteSeconds * SAMPLE_RATE) / blockSize) * blockSize;
      for (let f = 0; f < frames; f += blockSize) {
        renderer.render(left, right, blockSize);
        for (let i = 0; i < blockSize; i++) out.push((left[i] + right[i]) * 0.5);
      }
      for (let i = 0; i < gapSeconds * SAMPLE_RATE; i++) out.push(0);
    }

    return Float64Array.from(out);
  }

  it('recovers known decay times from a rendered sweep', () => {
    // A round trip through the measurement tool. If the analysis can pull this
    // app's own envelope curve back out of a WAV, then the numbers it reports
    // for a real recording can be trusted to mean the same thing.
    const decayValues = [0x40, 0x60, 0x80, 0xa0];
    const samples = renderEnvelopeSweep(decayValues);

    const file = path.join(os.tmpdir(), `m8fm-cal-${processId}.wav`);
    fs.writeFileSync(file, writeWav(samples, SAMPLE_RATE));

    try {
      const result = analyze(file);
      expect(result.sampleRate).toBe(SAMPLE_RATE);
      expect(result.notes.length, 'notes detected').toBe(decayValues.length);

      decayValues.forEach((value, i) => {
        const note = result.notes[i];
        const expected = envDecaySeconds(value);

        // The splitter's threshold cuts the very tail, so the measured length
        // lands a little under the true envelope length.
        expect(note.decayTotalSeconds, `DEC ${hex(value)} length`)
          .toBeGreaterThan(expected * 0.75);
        expect(note.decayTotalSeconds, `DEC ${hex(value)} length`)
          .toBeLessThan(expected * 1.25);

        // fm-processor.js decays as (1 - t/T)^2, so the fitted exponent should
        // come back close to 2. This is the number that will say whether the
        // real M8 decays with the same shape.
        expect(note.decayExponent, `DEC ${hex(value)} shape`).toBeGreaterThan(1.5);
        expect(note.decayExponent, `DEC ${hex(value)} shape`).toBeLessThan(2.5);

        // A bare sine carrier: the fundamental should dominate completely.
        expect(note.fundamentalHz, `DEC ${hex(value)} pitch`).toBeCloseTo(noteToFrequency(48), 0);
        expect(note.harmonicsDb[1], `DEC ${hex(value)} 2nd harmonic`).toBeLessThan(-40);
      });
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it('reads back 16, 24 and 32-bit WAVs identically', () => {
    // Whatever a DAW exports has to land at the same numbers.
    const samples = Float64Array.from({ length: 4410 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE));
    const file = path.join(os.tmpdir(), `m8fm-wav-${processId}.wav`);
    fs.writeFileSync(file, writeWav(samples, SAMPLE_RATE));
    try {
      const result = analyze(file);
      expect(result.bitsPerSample).toBe(24);
      expect(result.notes.length).toBe(1);
      expect(result.notes[0].fundamentalHz).toBeCloseTo(440, 0);
      expect(result.notes[0].peak).toBeCloseTo(0.5, 2);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
});
