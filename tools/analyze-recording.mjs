#!/usr/bin/env node
/**
 * Measures a recording of an M8 calibration instrument.
 *
 * Splits the WAV into individual notes on the silence between them, then for
 * each note reports the amplitude envelope, the decay times, the detected
 * fundamental and the harmonic series. That is everything needed to fit the
 * conversion curves in src/audio/M8Patch.ts to real hardware.
 *
 *   node tools/analyze-recording.mjs calibration/CAL1-ENV.wav
 *   node tools/analyze-recording.mjs recording.wav --json > measured.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* --------------------------------------------------------------- WAV input */

/** Reads a RIFF/WAVE file and returns mono float samples plus the sample rate. */
export function readWav(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const tag = (offset) => String.fromCharCode(...buffer.subarray(offset, offset + 4));

  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a RIFF/WAVE file');

  let format = null;
  let dataOffset = -1;
  let dataLength = 0;

  // Walk the chunk list; a WAV can carry any number of chunks before `data`.
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === 'fmt ') {
      format = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true)
      };
      if (format.audioFormat === 0xfffe && size >= 40) {
        // WAVE_FORMAT_EXTENSIBLE: the real format lives in the GUID's first word.
        format.audioFormat = view.getUint16(body + 24, true);
      }
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = size;
    }

    offset = body + size + (size % 2); // chunks are word-aligned
  }

  if (!format) throw new Error('no fmt chunk');
  if (dataOffset < 0) throw new Error('no data chunk');

  const { channels, bitsPerSample, audioFormat, sampleRate } = format;
  const bytesPerSample = bitsPerSample / 8;
  const frames = Math.floor(dataLength / (bytesPerSample * channels));
  const samples = new Float64Array(frames);

  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      const at = dataOffset + (frame * channels + ch) * bytesPerSample;
      let value;
      if (audioFormat === 3) {
        value = bitsPerSample === 64 ? view.getFloat64(at, true) : view.getFloat32(at, true);
      } else if (bitsPerSample === 16) {
        value = view.getInt16(at, true) / 32768;
      } else if (bitsPerSample === 24) {
        const raw = buffer[at] | (buffer[at + 1] << 8) | (buffer[at + 2] << 16);
        value = (raw & 0x800000 ? raw - 0x1000000 : raw) / 8388608;
      } else if (bitsPerSample === 32) {
        value = view.getInt32(at, true) / 2147483648;
      } else if (bitsPerSample === 8) {
        value = (buffer[at] - 128) / 128;
      } else {
        throw new Error(`unsupported bit depth: ${bitsPerSample}`);
      }
      sum += value;
    }
    samples[frame] = sum / channels;
  }

  return { samples, sampleRate, channels, bitsPerSample };
}

/** Writes mono float samples as a 24-bit WAV. Used to self-test the analysis. */
export function writeWav(samples, sampleRate) {
  const bytes = Buffer.alloc(44 + samples.length * 3);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + samples.length * 3, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 3, 28);
  bytes.writeUInt16LE(3, 32);
  bytes.writeUInt16LE(24, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples.length * 3, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const value = Math.round(clamped * 8388607);
    bytes.writeIntLE(value, 44 + i * 3, 3);
  }
  return bytes;
}

/* ------------------------------------------------------------------- maths */

function fft(re, im) {
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

/** RMS envelope, one value per `windowSeconds`. */
export function envelope(samples, sampleRate, windowSeconds = 0.005) {
  const window = Math.max(1, Math.round(windowSeconds * sampleRate));
  const out = [];
  for (let start = 0; start + window <= samples.length; start += window) {
    let sum = 0;
    for (let i = start; i < start + window; i++) sum += samples[i] * samples[i];
    out.push(Math.sqrt(sum / window));
  }
  return { values: out, stepSeconds: window / sampleRate };
}

/** Splits a recording into notes on the silence between them. */
export function splitNotes(samples, sampleRate, options = {}) {
  const { values, stepSeconds } = envelope(samples, sampleRate, 0.005);
  let peak = 0;
  for (const v of values) if (v > peak) peak = v;
  if (peak <= 0) return [];

  const openAt = peak * (options.openFraction ?? 0.04);
  const closeAt = peak * (options.closeFraction ?? 0.012);
  const minGapSteps = Math.round((options.minGapSeconds ?? 0.15) / stepSeconds);
  // A short percussive decay is only a few tens of milliseconds long, and it is
  // exactly the kind of note these recordings are meant to measure, so the
  // minimum has to stay well under that.
  const minNoteSteps = Math.round((options.minNoteSeconds ?? 0.01) / stepSeconds);

  const notes = [];
  let start = -1;
  let quiet = 0;

  for (let i = 0; i < values.length; i++) {
    if (start < 0) {
      if (values[i] > openAt) {
        start = i;
        quiet = 0;
      }
    } else if (values[i] < closeAt) {
      quiet += 1;
      if (quiet >= minGapSteps) {
        const end = i - quiet;
        if (end - start >= minNoteSteps) notes.push([start, end]);
        start = -1;
        quiet = 0;
      }
    } else {
      quiet = 0;
    }
  }
  if (start >= 0 && values.length - start >= minNoteSteps) notes.push([start, values.length]);

  return notes.map(([from, to]) => ({
    startSeconds: from * stepSeconds,
    endSeconds: to * stepSeconds,
    samples: samples.slice(Math.round(from * stepSeconds * sampleRate), Math.round(to * stepSeconds * sampleRate))
  }));
}

/**
 * Fundamental frequency.
 *
 * Finds the strongest partial, then walks down its sub-multiples to see whether
 * it is really a harmonic of something lower. FM spectra routinely put more
 * energy into an upper sideband than into the fundamental, so taking the loudest
 * peak on its own would report the wrong note; conversely a pure sine has
 * nothing at its multiples, which defeats a plain harmonic-product approach.
 */
export function detectFundamental(samples, sampleRate) {
  const size = 32768;
  const slice = Math.min(size, samples.length);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  // Analyse a little way in, past the attack transient, when there is room.
  const offset = Math.min(Math.floor(0.02 * sampleRate), Math.max(0, samples.length - slice));
  for (let i = 0; i < slice; i++) {
    re[i] = samples[offset + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (slice - 1)));
  }
  fft(re, im);

  const bins = size / 2;
  const magnitude = new Float64Array(bins);
  for (let b = 0; b < bins; b++) magnitude[b] = Math.hypot(re[b], im[b]);

  const binHz = sampleRate / size;
  const lowest = Math.max(2, Math.floor(20 / binHz));

  let peakBin = lowest;
  for (let b = lowest; b < bins; b++) if (magnitude[b] > magnitude[peakBin]) peakBin = b;

  const near = (bin) => {
    let best = 0;
    for (let b = Math.max(0, bin - 2); b <= bin + 2 && b < bins; b++) best = Math.max(best, magnitude[b]);
    return best;
  };

  // Try the deepest sub-multiple that is genuinely present, so a spectrum whose
  // loudest partial is the 3rd harmonic still reports the right fundamental.
  let chosen = peakBin;
  for (let divisor = 8; divisor >= 2; divisor--) {
    const candidate = Math.round(peakBin / divisor);
    if (candidate < lowest) continue;
    if (near(candidate) < magnitude[peakBin] * 0.15) continue;
    let supported = 0;
    for (let h = 2; h <= 4; h++) {
      if (near(candidate * h) >= magnitude[peakBin] * 0.05) supported += 1;
    }
    if (supported >= 2) {
      chosen = candidate;
      break;
    }
  }

  // Parabolic interpolation, for sub-bin accuracy.
  const y0 = magnitude[chosen - 1] ?? 0;
  const y1 = magnitude[chosen];
  const y2 = magnitude[chosen + 1] ?? 0;
  const denominator = y0 - 2 * y1 + y2;
  const shift = denominator !== 0 ? (0.5 * (y0 - y2)) / denominator : 0;
  return (chosen + Math.max(-0.5, Math.min(0.5, shift))) * binHz;
}

/** Harmonic amplitudes relative to the strongest, in dB. */
export function harmonics(samples, sampleRate, f0, count = 24, atSeconds = 0.02) {
  const size = 32768;
  const start = Math.max(0, Math.min(Math.floor(atSeconds * sampleRate), samples.length - size));
  const usable = Math.min(size, samples.length - start);
  if (usable < 1024) return [];

  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < usable; i++) {
    re[i] = samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (usable - 1)));
  }
  fft(re, im);

  const binHz = sampleRate / size;
  const values = [];
  for (let h = 1; h <= count; h++) {
    const centre = Math.round((h * f0) / binHz);
    let peak = 0;
    for (let b = Math.max(0, centre - 3); b <= centre + 3 && b < size / 2; b++) {
      peak = Math.max(peak, Math.hypot(re[b], im[b]));
    }
    values.push(peak);
  }

  const loudest = Math.max(...values);
  return values.map((v) => (loudest > 0 ? 20 * Math.log10(Math.max(v, 1e-12) / loudest) : -Infinity));
}

/**
 * RMS window that spans a few cycles of the tone, so the envelope does not
 * ripple at the waveform's own frequency.
 */
function envelopeWindowFor(f0) {
  if (!f0 || !isFinite(f0) || f0 <= 0) return 0.01;
  return Math.max(0.005, Math.min(0.03, 3 / f0));
}

/** Time from the envelope peak down to a given level, in seconds. */
export function decayTo(samples, sampleRate, dbDown, f0) {
  const { values, stepSeconds } = envelope(samples, sampleRate, envelopeWindowFor(f0));
  let peakIndex = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[peakIndex]) peakIndex = i;
  const target = values[peakIndex] * Math.pow(10, -dbDown / 20);
  for (let i = peakIndex; i < values.length; i++) {
    if (values[i] <= target) return +((i - peakIndex) * stepSeconds).toFixed(4);
  }
  return null;
}

/**
 * Fits `envelope(t) = peak * (1 - t/T)^p` to the decay.
 *
 * Both T and p are solved for, rather than reading T off the end of the note.
 * The note splitter cuts the tail at its silence threshold, and any recording
 * has a noise floor, so the visible end of a note is always earlier than the
 * true end of the envelope -- assuming otherwise biases the exponent.
 *
 * p = 1 is a straight line, 2 is what this app currently assumes, and a much
 * larger value means the real envelope is closer to exponential.
 */
export function decayShape(samples, sampleRate, f0) {
  const { values, stepSeconds } = envelope(samples, sampleRate, envelopeWindowFor(f0));
  let peakIndex = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[peakIndex]) peakIndex = i;
  const peak = values[peakIndex];
  if (peak <= 0) return null;

  // Fit over the part of the decay that survives both the splitter's threshold
  // and any noise floor: from just below the peak down to -34 dB.
  const points = [];
  for (let i = peakIndex + 1; i < values.length; i++) {
    const ratio = values[i] / peak;
    if (ratio > 0.9) continue;
    if (ratio < 0.02) break;
    points.push([(i - peakIndex) * stepSeconds, ratio]);
  }
  if (points.length < 4) return null;

  // For a given p, (v/peak)^(1/p) = 1 - t/T is linear in t, so T follows from a
  // least-squares fit through the origin. Sweep p and keep the best fit.
  let best = null;
  for (let p = 0.4; p <= 8.0001; p += 0.02) {
    let sxx = 0;
    let sxy = 0;
    for (const [t, ratio] of points) {
      const x = 1 - Math.pow(ratio, 1 / p);
      sxx += x * x;
      sxy += x * t;
    }
    if (sxx <= 0) continue;
    const total = sxy / sxx;
    if (!(total > 0)) continue;

    let residual = 0;
    for (const [t, ratio] of points) {
      const predicted = total * (1 - Math.pow(ratio, 1 / p));
      residual += (t - predicted) ** 2;
    }
    if (best === null || residual < best.residual) best = { residual, total, exponent: p };
  }

  if (!best) return null;
  return { totalSeconds: best.total, exponent: best.exponent };
}

/* ------------------------------------------------------------------ report */

function analyze(filePath, options = {}) {
  const { samples, sampleRate, channels, bitsPerSample } = readWav(fs.readFileSync(filePath));
  const notes = splitNotes(samples, sampleRate);

  return {
    file: filePath,
    expected: options.expected ?? null,
    sampleRate,
    channels,
    bitsPerSample,
    durationSeconds: +(samples.length / sampleRate).toFixed(3),
    notes: notes.map((note, index) => {
      let peak = 0;
      for (const v of note.samples) peak = Math.max(peak, Math.abs(v));
      const f0 = detectFundamental(note.samples, sampleRate);
      const shape = decayShape(note.samples, sampleRate, f0);
      return {
        index: index + 1,
        startSeconds: +note.startSeconds.toFixed(3),
        lengthSeconds: +((note.samples.length / sampleRate)).toFixed(3),
        peak: +peak.toFixed(4),
        fundamentalHz: +f0.toFixed(2),
        decayToMinus20dB: decayTo(note.samples, sampleRate, 20, f0),
        // -30 dB rather than -40: the note splitter cuts the tail at about
        // -38 dB, so a deeper measurement would never resolve.
        decayToMinus30dB: decayTo(note.samples, sampleRate, 30, f0),
        decayTotalSeconds: shape ? +shape.totalSeconds.toFixed(3) : null,
        decayExponent: shape && shape.exponent !== null ? +shape.exponent.toFixed(2) : null,
        harmonicsDb: harmonics(note.samples, sampleRate, f0).map((v) => +v.toFixed(1))
      };
    })
  };
}

function report(result) {
  const lines = [];
  lines.push(`${result.file}`);
  lines.push(`  ${result.sampleRate} Hz, ${result.channels} ch, ${result.bitsPerSample}-bit, ${result.durationSeconds}s`);
  lines.push(`  ${result.notes.length} notes detected`);
  if (result.expected && result.expected !== result.notes.length) {
    lines.push(`  !! expected ${result.expected}. A note may have been too short or too quiet to`);
    lines.push('     separate, or two ran together. Check the gaps before trusting the rows.');
  }
  lines.push('');

  if (result.notes.length === 0) {
    lines.push('  No notes found. If the gaps between notes are shorter than ~0.15s,');
    lines.push('  or the recording never drops near silence, the splitter cannot see them.');
    return lines.join('\n');
  }

  lines.push('  #   start    len    peak      f0      -20dB    -30dB   decay   shape');
  for (const note of result.notes) {
    const fmt = (v, width, digits = 3) => (v === null ? '-'.padStart(width) : v.toFixed(digits).padStart(width));
    lines.push(
      `  ${String(note.index).padStart(2)}  ${fmt(note.startSeconds, 6, 2)}s ${fmt(note.lengthSeconds, 6, 2)}s`
      + ` ${fmt(note.peak, 7, 4)}  ${fmt(note.fundamentalHz, 8, 2)}Hz`
      + ` ${fmt(note.decayToMinus20dB, 7)}s ${fmt(note.decayToMinus30dB, 7)}s`
      + ` ${fmt(note.decayTotalSeconds, 6, 2)}s ${fmt(note.decayExponent, 6, 2)}`
    );
  }

  lines.push('');
  lines.push('  Harmonic series, dB relative to the loudest partial (1..16):');
  for (const note of result.notes) {
    lines.push(`  ${String(note.index).padStart(2)}  ${note.harmonicsDb.slice(0, 16).map((v) => String(Math.round(v)).padStart(5)).join('')}`);
  }

  return lines.join('\n');
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const asJson = process.argv.includes('--json');

  if (files.length === 0) {
    console.error('usage: node tools/analyze-recording.mjs <recording.wav> [more.wav ...] [--expect=N] [--json]');
    process.exit(1);
  }

  const expectFlag = process.argv.find((a) => a.startsWith('--expect='));
  const expected = expectFlag ? Number(expectFlag.split('=')[1]) : null;
  const results = files.map((file) => analyze(file, { expected }));
  console.log(asJson ? JSON.stringify(results, null, 2) : results.map(report).join('\n\n'));
}

export { analyze, report };
