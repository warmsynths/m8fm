import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calibrationSweep, silentInstrument } from '../src/audio/Calibration.ts';
import {
  CALIBRATION_NOTE,
  PHRASE_SECONDS,
  STEP_SECONDS,
  buildCalibrationSong
} from '../src/audio/CalibrationSong.ts';
import { buildRenderSpec, noteToFrequency } from '../src/audio/FmEngine.ts';
// @ts-ignore
import { M8FmRenderer } from '../src/audio/fm-processor.js';
// @ts-ignore
import { analyze, report, writeWav } from './analyze-recording.mjs';

const SAMPLE_RATE = 44100;
const BLOCK_SIZE = 128;
const CUT_AFTER_STEPS = 8;
const TAIL_SILENCE_STEPS = 4;

export function renderCalibrationSweep(options = {}) {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;
  const masterGain = options.masterGain ?? 0.5;
  const leadFrames = Math.round(0.5 * sampleRate);
  for (let s = 0; s < leadFrames; s++) totalSamples.push(0);

  const freq = noteToFrequency(CALIBRATION_NOTE);

  for (let i = 0; i < sweep.length; i++) {
    const point = sweep[i];
    const slotSeconds = point.phrases * PHRASE_SECONDS;
    const cutSeconds = point.phrases === 1
      ? CUT_AFTER_STEPS * STEP_SECONDS
      : slotSeconds - (TAIL_SILENCE_STEPS * STEP_SECONDS);

    const renderer = new M8FmRenderer(sampleRate);
    renderer.handleMessage({ type: 'spec', spec: buildRenderSpec(point.patch) });
    renderer.handleMessage({ type: 'volume', value: masterGain });
    renderer.handleMessage({ type: 'noteOn', noteId: CALIBRATION_NOTE, frequency: freq, velocity: 1.0 });

    const totalFrames = Math.round(slotSeconds * sampleRate);
    const cutFrame = Math.round(cutSeconds * sampleRate);

    const left = new Float32Array(BLOCK_SIZE);
    const right = new Float32Array(BLOCK_SIZE);

    let noteCut = false;

    for (let frame = 0; frame < totalFrames; frame += BLOCK_SIZE) {
      if (!noteCut && frame >= cutFrame) {
        // Tracker cuts note by triggering silent instrument / noteOff
        renderer.handleMessage({ type: 'noteOff', noteId: CALIBRATION_NOTE });
        noteCut = true;
      }

      const framesToRender = Math.min(BLOCK_SIZE, totalFrames - frame);
      renderer.render(left, right, framesToRender);

      for (let s = 0; s < framesToRender; s++) {
        // Average left and right for mono analysis
        totalSamples.push((left[s] + right[s]) * 0.5);
      }
    }
  }

  return {
    samples: Float64Array.from(totalSamples),
    sampleRate
  };
}

const __filename = fileURLToPath(import.meta.url);
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (invokedDirectly) {
  const outPath = process.argv[2] || path.join(path.dirname(__filename), 'M8FM-APP-REFERENCE.wav');
  console.log(`Rendering calibration sweep to ${outPath}...`);
  
  const { samples, sampleRate } = renderCalibrationSweep();
  const wavBytes = writeWav(samples, sampleRate);
  fs.writeFileSync(outPath, wavBytes);
  console.log(`Rendered ${(samples.length / sampleRate).toFixed(1)}s (${samples.length} samples) to ${outPath}`);

  const manifestPath = path.join(path.dirname(__filename), '..', 'calibration', 'manifest.json');
  let manifest = null;
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  const analysis = analyze(outPath, { manifest });
  const jsonOut = path.join(path.dirname(__filename), 'app-reference.json');
  fs.writeFileSync(jsonOut, JSON.stringify(analysis, null, 2));
  console.log(`Analysis written to ${jsonOut}`);

  if (process.argv.includes('--report')) {
    console.log('\n' + report(analysis));
  }
}
