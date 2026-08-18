import { describe, it, expect } from 'vitest';
import { calibrationSweep, calibrationTests, describeCalibration } from './Calibration';
import {
  CALIBRATION_NOTE,
  PHRASE_SECONDS,
  SONG_TEMPO,
  buildCalibrationSong
} from './CalibrationSong';
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
import { dumpM8File, loadM8File } from 'm8-js';

const OUTPUT_DIR = 'calibration';
const SONG_FILE = 'M8FM-CALIBRATION.m8s';

describe('calibration instruments', () => {
  const tests = calibrationTests();
  const sweep = calibrationSweep(tests);

  it('round-trip through the .m8i writer unchanged', () => {
    const serializer = new M8Serializer();
    for (const point of sweep) {
      const written = loadM8File(serializer.serializeFmInstrument(point.patch)).asObject();
      expect(written.kindStr, point.label).toBe('FMSYNTH');
      expect(written.instrParams.algo, point.label).toBe(point.patch.algo);
      expect(written.volume, point.label).toBe(point.patch.volume);
      for (let i = 0; i < 4; i++) {
        expect(written.instrParams.operators[i].level, `${point.label} op ${i} level`)
          .toBe(point.patch.operators[i].level);
      }
    }
  });

  it('carry no send effects, so nothing colours the recording', () => {
    for (const point of sweep) {
      expect(point.patch.mixer.cho, `${point.label} chorus`).toBe(0x00);
      expect(point.patch.mixer.del, `${point.label} delay`).toBe(0x00);
      expect(point.patch.mixer.rev, `${point.label} reverb`).toBe(0x00);
    }
  });

  it('vary exactly one thing away from a bare tone', () => {
    // The whole point is that each recording has one unknown in it. If a patch
    // has both an envelope and a filter running, its recording cannot settle
    // either curve on its own.
    for (const test of tests) {
      const patch = test.patch;
      const envelopesActive = patch.envelopes.filter((e) => e.dest !== DEST_OFF).length;
      const lfosActive = patch.lfos.filter((l) => l.dest !== DEST_OFF && l.amount > 0).length;
      const filterActive = patch.filter.type !== 0 ? 1 : 0;
      const modulatorsActive = patch.operators.filter((op, i) => i > 0 && op.level > 0).length;

      const complexity = envelopesActive + lfosActive + filterActive + modulatorsActive;
      expect(complexity, `${test.id} has ${complexity} things going on`).toBeLessThanOrEqual(1);
    }
  });

  it('each sweep actually changes the patch at every step', () => {
    // A sweep that silently clamps would produce a row of identical notes and a
    // curve fitted to nothing.
    for (const test of tests) {
      const seen = new Set<string>();
      for (const value of test.values) {
        const patch = clonePatch(test.patch);
        test.apply(patch, value);
        seen.add(JSON.stringify(patch));
      }
      expect(seen.size, `${test.id} produced ${seen.size} distinct patches from ${test.values.length} values`)
        .toBe(test.values.length);
    }
  });
});

describe('calibration song', () => {
  const { song, manifest } = buildCalibrationSong();

  it('plays every measurement point, in manifest order', () => {
    const sweep = calibrationSweep();
    expect(manifest.notes.length).toBe(sweep.length);
    manifest.notes.forEach((note, i) => {
      expect(note.test).toBe(sweep[i].test);
      expect(note.value).toBe(sweep[i].value);
      // Instrument 0 is the silent one used to cut notes.
      expect(note.instrument).toBe(i + 1);
    });
  });

  it('survives a round trip through the .m8s writer', () => {
    // The one part of this that cannot be checked against hardware from here, so
    // check as much of it as the format library can see.
    const reloaded = loadM8File(dumpM8File(song)).asObject();

    expect(reloaded.tempo).toBe(SONG_TEMPO);

    const sweep = calibrationSweep();
    sweep.forEach((point, i) => {
      const instrument = reloaded.instruments[i + 1];
      expect(instrument.kindStr, point.label).toBe('FMSYNTH');
      expect(instrument.instrParams.algo, `${point.label} algo`).toBe(point.patch.algo);
      expect(instrument.instrParams.operators[0].level, `${point.label} op A level`)
        .toBe(point.patch.operators[0].level);
      expect(instrument.envelopes[0].decay, `${point.label} env1 decay`)
        .toBe(point.patch.envelopes[0].decay);
      expect(instrument.filterParams.cutoff, `${point.label} cutoff`)
        .toBe(point.patch.filter.cutoff);
    });
  });

  it('triggers each instrument once, and cuts it before the next', () => {
    const reloaded = loadM8File(dumpM8File(song)).asObject();

    // Walk the arrangement the way the device would: song steps -> chains ->
    // phrases -> steps, and collect the notes in playback order.
    const played: { instrument: number; note: number }[] = [];
    for (const songStep of reloaded.steps) {
      const chainIndex = songStep.tracks[0];
      if (chainIndex === 0xff) continue;
      for (const chainStep of reloaded.chains[chainIndex].steps) {
        if (chainStep.phrase === 0xff) continue;
        for (const phraseStep of reloaded.phrases[chainStep.phrase].steps) {
          if (phraseStep.note === 0xff) continue;
          played.push({ instrument: phraseStep.instrument, note: phraseStep.note });
        }
      }
    }

    const sweep = calibrationSweep();
    // Every measurement is a note on its own instrument followed by a cut.
    expect(played.length).toBe(sweep.length * 2);
    sweep.forEach((point, i) => {
      expect(played[i * 2].instrument, `${point.label} trigger`).toBe(i + 1);
      expect(played[i * 2].note, `${point.label} note`).toBe(CALIBRATION_NOTE);
      expect(played[i * 2 + 1].instrument, `${point.label} cut`).toBe(0);
    });
  });

  it('gives long decays room to finish before the next note', () => {
    // The envelope sweep runs to DEC FF. If the slot were shorter than the decay
    // the next note would land on top of the tail and the measurement would be
    // meaningless.
    const envelopeNotes = manifest.notes.filter((n) => n.test === 'CAL1-ENV');
    expect(envelopeNotes.length).toBeGreaterThan(0);
    for (const note of envelopeNotes) {
      expect(note.slotSeconds, `${note.label} slot`).toBeGreaterThan(envDecaySeconds(note.value));
    }
  });

  it('starts every measurement where the manifest says it does', () => {
    let elapsed = 0;
    for (const note of manifest.notes) {
      expect(note.startSeconds, note.label).toBeCloseTo(elapsed, 2);
      elapsed += note.slotSeconds;
      expect(note.slotSeconds % PHRASE_SECONDS, `${note.label} slot alignment`).toBeCloseTo(0, 6);
    }
    expect(manifest.totalSeconds).toBeCloseTo(elapsed, 1);
  });
});

describe('emitting the calibration files', () => {
  it('writes the song, the instruments and a guide when asked', () => {
    // Off by default: `npm test` should not touch the working tree. Emit with
    //   M8FM_WRITE_CALIBRATION=1 npm test
    const shouldWrite = (globalThis as any).process?.env?.M8FM_WRITE_CALIBRATION === '1';
    if (!shouldWrite) {
      expect(calibrationSweep().length).toBeGreaterThan(0);
      return;
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const tests = calibrationTests();
    const serializer = new M8Serializer();
    const { song, manifest } = buildCalibrationSong();

    fs.writeFileSync(path.join(OUTPUT_DIR, SONG_FILE), Uint8Array.from(dumpM8File(song)));
    fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    // The individual instruments stay, as a fallback for anyone who would rather
    // sweep by hand, or if the song does not load.
    fs.mkdirSync(path.join(OUTPUT_DIR, 'instruments'), { recursive: true });
    for (const test of tests) {
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'instruments', `${test.id}.m8i`),
        serializer.serializeFmInstrument(test.patch)
      );
    }

    const minutes = Math.ceil(manifest.totalSeconds / 60);
    const readme = [
      '# Calibration',
      '',
      'These exist to measure a real M8 against this app. Everything in',
      '`src/audio/M8Patch.ts` that turns a raw `00`-`FF` parameter into seconds,',
      'hertz or modulation depth is currently a guess, because Dirtywave does not',
      'publish those curves. Each test here isolates exactly one of them.',
      '',
      '## Why not just record the piano?',
      '',
      'A musical patch is affected by every one of those curves at once, so a',
      'recording of it cannot settle any of them: a wrong level curve and a wrong',
      'filter curve can cancel out and still look right. These patches are',
      'deliberately dumb -- mostly a single sine operator -- so that one recording',
      'determines one curve, exactly.',
      '',
      '## Recording it',
      '',
      `\`${SONG_FILE}\` plays the entire sweep by itself. Every measurement point is`,
      'its own instrument, so nothing needs adjusting while it runs.',
      '',
      '1. Copy the song to the M8 SD card and load it.',
      '2. Record the line or headphone out into your DAW. **Not** a microphone --',
      '   room tone and speaker response would swamp the measurements.',
      '3. Press play, and let it run to the end.',
      `   It takes about ${minutes} minutes and plays ${manifest.notes.length} notes.`,
      '4. Export the take as a WAV. 44.1 or 48 kHz, mono is fine. Start the file',
      '   anywhere -- the analysis finds the first note itself.',
      '',
      'Keep the level clear of clipping, and leave the M8 mixer\'s CHO/DEL/REV',
      'sends off. The instruments already have their own sends at `00`.',
      '',
      'Then:',
      '',
      '```',
      'node tools/analyze-recording.mjs your-take.wav',
      '```',
      '',
      'It picks up `manifest.json` automatically and labels every note with the',
      'parameter and value it belongs to.',
      '',
      '## If the song will not load',
      '',
      '`instruments/` holds one `.m8i` per test as a fallback. Load one, and step',
      'the parameter named below yourself, playing a note after each. Leave a gap',
      'between notes and pass `--expect=N` so a miscount is obvious.',
      '',
      '## If you only do a few',
      '',
      'CAL1, CAL2 and CAL4 in that order get most of the way: how long notes take',
      'to die and the shape of the decay, then brightness, then the filter.',
      '',
      '## The tests',
      '',
      ...tests.map(describeCalibration)
    ].join('\n');

    fs.writeFileSync(path.join(OUTPUT_DIR, 'README.md'), `${readme}\n`);

    expect(fs.existsSync(path.join(OUTPUT_DIR, SONG_FILE))).toBe(true);
    console.log(`Wrote ${SONG_FILE}: ${manifest.notes.length} notes, ${manifest.totalSeconds}s (~${minutes} min)`);
  });
});

describe('recording analysis', () => {
  const SAMPLE_RATE = 44100;
  const processId = (globalThis as any).process?.pid ?? 0;

  /**
   * Renders a calibration sweep through this app's own engine and writes it out
   * as a WAV, exactly as if it had been recorded off a device.
   */
  function renderSweep(decayValues: number[], gapSeconds: number): Float64Array {
    const test = calibrationTests().find((t) => t.id === 'CAL1-ENV')!;
    const noteSeconds = 6;
    const blockSize = 128;
    const out: number[] = [];

    for (const decay of decayValues) {
      const patch = clonePatch(test.patch);
      test.apply(patch, decay);

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

  function analyzeSamples(samples: Float64Array, options: Record<string, unknown> = {}) {
    const file = path.join(os.tmpdir(), `m8fm-cal-${processId}-${Math.random().toString(36).slice(2)}.wav`);
    fs.writeFileSync(file, writeWav(samples, SAMPLE_RATE));
    try {
      return analyze(file, options);
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  it('recovers known decay times and the decay shape', () => {
    // A round trip through the measurement tool. If the analysis can pull this
    // app's own envelope curve back out of a WAV, then the numbers it reports
    // for a real recording can be trusted to mean the same thing.
    const decayValues = [0x40, 0x60, 0x80, 0xa0];
    const result = analyzeSamples(renderSweep(decayValues, 1));

    expect(result.sampleRate).toBe(SAMPLE_RATE);
    expect(result.notes.length, 'notes detected').toBe(decayValues.length);

    decayValues.forEach((value: number, i: number) => {
      const note = result.notes[i];
      const expected = envDecaySeconds(value);

      expect(note.decayTotalSeconds, `DEC ${hex(value)} length`).toBeGreaterThan(expected * 0.75);
      expect(note.decayTotalSeconds, `DEC ${hex(value)} length`).toBeLessThan(expected * 1.25);

      // fm-processor.js decays as (1 - t/T)^2, so the fitted exponent should
      // come back close to 2. This is the number that will say whether the real
      // M8 decays with the same shape.
      expect(note.decayExponent, `DEC ${hex(value)} shape`).toBeGreaterThan(1.5);
      expect(note.decayExponent, `DEC ${hex(value)} shape`).toBeLessThan(2.5);

      expect(note.fundamentalHz, `DEC ${hex(value)} pitch`).toBeCloseTo(noteToFrequency(48), 0);
      expect(note.harmonicsDb[1], `DEC ${hex(value)} 2nd harmonic`).toBeLessThan(-40);
    });
  });

  it('separates notes that run into each other', () => {
    // The reason the analysis keys on onsets rather than silences: nobody should
    // have to leave a clean gap between every note.
    const decayValues = [0x60, 0x60, 0x60, 0x60];
    const result = analyzeSamples(renderSweep(decayValues, 0));

    expect(result.notes.length, 'notes detected with no gaps at all').toBe(decayValues.length);
    for (const note of result.notes) {
      expect(note.decayTotalSeconds).toBeGreaterThan(envDecaySeconds(0x60) * 0.75);
    }
  });

  it('labels each note from the manifest', () => {
    const decayValues = [0x40, 0x60, 0x80];
    const manifest = {
      notes: decayValues.map((value, i) => ({
        index: i + 1,
        test: 'CAL1-ENV',
        parameter: 'ENV1 DEC',
        value,
        valueHex: hex(value),
        label: `ENV1 DEC = ${hex(value)}`
      }))
    };

    const result = analyzeSamples(renderSweep(decayValues, 1), { manifest });
    expect(result.notes.map((n: any) => n.label)).toEqual(manifest.notes.map((n) => n.label));
    expect(result.notes.every((n: any) => n.test === 'CAL1-ENV')).toBe(true);
  });

  it('reads back a WAV at the level it was written', () => {
    const samples = Float64Array.from(
      { length: 4410 },
      (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE)
    );
    const result = analyzeSamples(samples);
    expect(result.bitsPerSample).toBe(24);
    expect(result.notes.length).toBe(1);
    expect(result.notes[0].fundamentalHz).toBeCloseTo(440, 0);
    expect(result.notes[0].peak).toBeCloseTo(0.5, 2);
  });
});
