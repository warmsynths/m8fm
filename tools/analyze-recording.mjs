// #!/usr/bin/env node
/**
 * Measures a recording of the M8 calibration song.
 *
 * Cuts the WAV into measurements and reports, for each, the level, the pitch,
 * the decay times, the fitted decay curve and the harmonic series -- everything
 * needed to fit the conversion curves in src/audio/M8Patch.ts to real hardware.
 *
 * When calibration/manifest.json is present the recording is cut by it, so every
 * row is labelled with the parameter and value it measures, and a measurement
 * that is silent or that pulses cannot shift the labels of the ones after it.
 * Only the recording's offset is found from the audio. Without a manifest it
 * falls back to segmenting at note onsets.
 *
 *   node tools/analyze-recording.mjs take.wav
 *   node tools/analyze-recording.mjs take.wav --json > measured.json
 *   node tools/analyze-recording.mjs take.wav --manifest=path/to/manifest.json
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

/**
 * Splits a recording into notes at their onsets.
 *
 * Onsets rather than silences, because requiring a clean gap between every note
 * puts the burden on whoever is recording. A note is taken to start either when
 * the signal rises out of silence or when its energy jumps sharply, so notes
 * that run into each other still separate, and each segment simply runs until
 * the next one begins. Any decay tail is therefore kept with the note it
 * belongs to.
 */
export function splitNotes(samples, sampleRate, options = {}) {
  const { values, stepSeconds } = envelope(samples, sampleRate, 0.005);
  let peak = 0;
  for (const v of values) if (v > peak) peak = v;
  if (peak <= 0) return [];

  const openAt = peak * (options.openFraction ?? 0.04);
  const closeAt = peak * (options.closeFraction ?? 0.012);
  // How far the energy must jump, over ~15 ms, to count as a new note landing on
  // top of a previous one that has not finished.
  const jumpRatio = options.jumpRatio ?? 4;
  const lookBack = Math.max(1, Math.round(0.015 / stepSeconds));
  const minSpacingSteps = Math.round((options.minSpacingSeconds ?? 0.05) / stepSeconds);

  const onsets = [];
  let armed = true;
  let lastOnset = -Infinity;

  for (let i = 0; i < values.length; i++) {
    if (values[i] < closeAt) armed = true;

    if (values[i] > openAt && i - lastOnset >= minSpacingSteps) {
      const before = values[Math.max(0, i - lookBack)];
      const jumped = values[i] > Math.max(before * jumpRatio, openAt);
      if (armed || jumped) {
        onsets.push(i);
        lastOnset = i;
        armed = false;
      }
    }
  }

  return onsets.map((from, i) => {
    const to = i + 1 < onsets.length ? onsets[i + 1] : values.length;
    return {
      startSeconds: from * stepSeconds,
      endSeconds: to * stepSeconds,
      samples: samples.slice(
        Math.round(from * stepSeconds * sampleRate),
        Math.round(to * stepSeconds * sampleRate)
      )
    };
  });
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

/** How far a note may sit from where the manifest says it is and still be it. */
const SNAP_TOLERANCE_SECONDS = 0.35;

/**
 * Cuts the recording into the slots the manifest describes.
 *
 * The calibration song has fixed timing, so where every measurement sits is
 * already known -- only the offset of the recording is not. Slicing by the
 * manifest rather than by detected onsets means a measurement that happens to be
 * silent (level 00 really is silence) or one that pulses (a tremolo looks like a
 * run of onsets) cannot shift the labels of everything after it.
 *
 * Each slot is still snapped to a nearby onset when there is one, so a recording
 * that drifts against the M8's clock stays aligned.
 */
function sliceByManifest(samples, sampleRate, manifest, onsets) {
  const origin = onsets.length > 0 ? onsets[0].startSeconds : 0;
  const totalSeconds = samples.length / sampleRate;

  return manifest.notes.map((entry) => {
    const nominal = origin + (entry.startSeconds ?? 0);
    const slot = entry.slotSeconds ?? 0;

    let snapped = null;
    let closest = Infinity;
    for (const onset of onsets) {
      const distance = Math.abs(onset.startSeconds - nominal);
      if (distance < closest) {
        closest = distance;
        snapped = onset.startSeconds;
      }
    }

    const start = closest <= SNAP_TOLERANCE_SECONDS ? snapped : nominal;
    const end = slot > 0 ? start + slot : totalSeconds;

    return {
      startSeconds: start,
      driftSeconds: closest <= SNAP_TOLERANCE_SECONDS ? +(snapped - nominal).toFixed(3) : null,
      truncated: end > totalSeconds + 0.01,
      samples: samples.slice(
        Math.max(0, Math.round(start * sampleRate)),
        Math.min(samples.length, Math.round(end * sampleRate))
      )
    };
  });
}

function analyze(filePath, options = {}) {
  const { samples, sampleRate, channels, bitsPerSample } = readWav(fs.readFileSync(filePath));
  const manifest = options.manifest ?? null;
  const onsets = splitNotes(samples, sampleRate);
  const notes = manifest ? sliceByManifest(samples, sampleRate, manifest, onsets) : onsets;

  return {
    file: filePath,
    slicedByManifest: !!manifest,
    onsetsDetected: onsets.length,
    expected: manifest ? manifest.notes.length : options.expected ?? null,
    sampleRate,
    channels,
    bitsPerSample,
    durationSeconds: +(samples.length / sampleRate).toFixed(3),
    notes: notes.map((note, index) => {
      let peak = 0;
      for (const v of note.samples) peak = Math.max(peak, Math.abs(v));
      const lengthSeconds = note.samples.length / sampleRate;
      const expected = manifest?.notes[index] ?? null;

      const base = {
        index: index + 1,
        test: expected?.test ?? null,
        parameter: expected?.parameter ?? null,
        valueHex: expected?.valueHex ?? null,
        label: expected?.label ?? null,
        startSeconds: +note.startSeconds.toFixed(3),
        lengthSeconds: +lengthSeconds.toFixed(3),
        driftSeconds: note.driftSeconds ?? null,
        truncated: !!note.truncated,
        peak: +peak.toFixed(4),
        peakDb: +(20 * Math.log10(Math.max(peak, 1e-9))).toFixed(1)
      };

      // A measurement can legitimately be silent -- LEVEL 00 is supposed to make
      // no sound. Reporting a pitch and a decay for silence would be noise
      // dressed up as data.
      if (peak < 1e-4 || lengthSeconds < 0.01) {
        return {
          ...base,
          silent: true,
          fundamentalHz: null,
          decayToMinus20dB: null,
          decayToMinus30dB: null,
          decayTotalSeconds: null,
          decayExponent: null,
          harmonicsDb: []
        };
      }

      const f0 = detectFundamental(note.samples, sampleRate);
      // Measure the spectrum well inside the note, past the attack, but fall
      // back towards the start for anything short.
      const spectrumAt = lengthSeconds > 1.2 ? 0.35 : Math.min(0.02, lengthSeconds / 4);
      const harmonicsDb = harmonics(note.samples, sampleRate, f0, 24, spectrumAt).map((v) => +v.toFixed(1));

      // How long the note actually sounds for, as opposed to how long its slot
      // is, and whether it holds its level or decays away. A sustained tone has
      // no decay to report, and printing one would be noise dressed as data.
      const { values, stepSeconds } = envelope(note.samples, sampleRate, envelopeWindowFor(f0));
      let envelopePeak = 0;
      for (const v of values) if (v > envelopePeak) envelopePeak = v;
      let lastSounding = 0;
      for (let i = 0; i < values.length; i++) if (values[i] > envelopePeak * 0.01) lastSounding = i;
      const soundingSeconds = lastSounding * stepSeconds;
      const threeQuarters = values[Math.floor(lastSounding * 0.75)] ?? 0;
      const sustained = threeQuarters > envelopePeak * 0.5;
      const tooShort = soundingSeconds < 0.05;

      if (sustained || tooShort) {
        return {
          ...base,
          silent: false,
          sustained,
          tooShort,
          soundingSeconds: +soundingSeconds.toFixed(3),
          fundamentalHz: tooShort ? null : +f0.toFixed(2),
          decayToMinus20dB: null,
          decayToMinus30dB: null,
          decayTotalSeconds: null,
          decayExponent: null,
          harmonicsDb: tooShort ? [] : harmonicsDb
        };
      }

      const shape = decayShape(note.samples, sampleRate, f0);
      return {
        ...base,
        silent: false,
        sustained: false,
        tooShort: false,
        soundingSeconds: +soundingSeconds.toFixed(3),
        fundamentalHz: +f0.toFixed(2),
        decayToMinus20dB: decayTo(note.samples, sampleRate, 20, f0),
        decayToMinus30dB: decayTo(note.samples, sampleRate, 30, f0),
        decayTotalSeconds: shape ? +shape.totalSeconds.toFixed(3) : null,
        decayExponent: shape && shape.exponent !== null ? +shape.exponent.toFixed(2) : null,
        harmonicsDb
      };
    })
  };
}

function report(result) {
  const lines = [];
  lines.push(`${result.file}`);
  lines.push(`  ${result.sampleRate} Hz, ${result.channels} ch, ${result.bitsPerSample}-bit, ${result.durationSeconds}s`);
  if (result.slicedByManifest) {
    lines.push(`  ${result.notes.length} measurements, sliced by the manifest`);
  } else {
    lines.push(`  ${result.notes.length} notes detected`);
    if (result.expected && result.expected !== result.notes.length) {
      lines.push(`  !! expected ${result.expected}. Without a manifest the rows are matched in`);
      lines.push('     order, so a missing or spurious note mislabels everything after it.');
    }
  }
  lines.push('');

  if (result.notes.length === 0) {
    lines.push('  No notes found. Either the recording is silent, or its level is so low');
    lines.push('  that nothing rose above the onset threshold.');
    return lines.join('\n');
  }

  const sounded = result.notes.filter((n) => !n.silent);
  if (sounded.length === 0) {
    lines.push('  Every slot is silent. The recording probably does not contain the song,');
    lines.push('  or its level is far too low.');
    return lines.join('\n');
  }

  const clipped = result.notes.filter((n) => n.peak >= 0.99);
  if (clipped.length > 0) {
    lines.push(`  !! ${clipped.length} measurement(s) at full scale -- the recording is probably`);
    lines.push('     clipped. Drop the level and record again; a clipped tone measures nothing.');
    lines.push('');
  }

  const truncated = result.notes.filter((n) => n.truncated);
  if (truncated.length > 0) {
    lines.push(`  !! the recording ends before ${truncated.length} measurement(s) do. It may have`);
    lines.push('     been stopped early, or started after the song had begun.');
    lines.push('');
  }

  const drifts = result.notes.map((n) => n.driftSeconds).filter((d) => d !== null);
  if (drifts.length > 0) {
    const worst = drifts.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
    if (Math.abs(worst) > 0.2) {
      lines.push(`  !! measurements drift up to ${worst.toFixed(2)}s from where the manifest puts`);
      lines.push('     them. Each was snapped to the nearest onset, but check the alignment.');
      lines.push('');
    }
  }

  const labelled = result.notes.some((n) => n.label);
  const labelWidth = labelled
    ? Math.max(...result.notes.map((n) => (n.label ? n.label.length : 0)), 5)
    : 0;

  const header = labelled ? `  #  ${'measurement'.padEnd(labelWidth)} ` : '  #  ';
  lines.push(`${header} start   peak    f0        -20dB    -30dB   decay   shape`);

  for (const note of result.notes) {
    const fmt = (v, width, digits = 3) => (v === null ? '-'.padStart(width) : v.toFixed(digits).padStart(width));
    const label = labelled ? `${(note.label ?? '?').padEnd(labelWidth)} ` : '';
    const row = `  ${String(note.index).padStart(2)} ${label} ${fmt(note.startSeconds, 6, 1)}s`;
    if (note.silent) {
      lines.push(`${row}       -        -    (silent)`);
      continue;
    }
    if (note.tooShort) {
      lines.push(`${row} ${fmt(note.peak, 6, 3)}        -    (too short to measure)`);
      continue;
    }
    if (note.sustained) {
      lines.push(`${row} ${fmt(note.peak, 6, 3)} ${fmt(note.fundamentalHz, 8, 2)}Hz    (steady tone)`);
      continue;
    }
    lines.push(
      `${row} ${fmt(note.peak, 6, 3)} ${fmt(note.fundamentalHz, 8, 2)}Hz`
      + ` ${fmt(note.decayToMinus20dB, 7)}s ${fmt(note.decayToMinus30dB, 7)}s`
      + ` ${fmt(note.decayTotalSeconds, 6, 2)}s ${fmt(note.decayExponent, 6, 2)}`
    );
  }

  lines.push('');
  lines.push('  Harmonic series, dB relative to the loudest partial (1..16):');
  for (const note of result.notes) {
    if (note.silent || note.tooShort) continue;
    const label = labelled ? ` ${(note.label ?? '?').padEnd(labelWidth)}` : '';
    lines.push(`  ${String(note.index).padStart(2)}${label}  ${note.harmonicsDb.slice(0, 16).map((v) => String(Math.round(v)).padStart(5)).join('')}`);
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

  // Default to the manifest that ships beside the calibration song, so a plain
  // `analyze-recording.mjs take.wav` already labels every row.
  const manifestFlag = process.argv.find((a) => a.startsWith('--manifest='));
  const manifestPath = manifestFlag
    ? manifestFlag.split('=').slice(1).join('=')
    : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'calibration', 'manifest.json');

  let manifest = null;
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      console.error(`could not read manifest ${manifestPath}: ${err.message}`);
    }
  } else if (manifestFlag) {
    console.error(`manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const results = files.map((file) => analyze(file, { expected, manifest }));
  console.log(asJson ? JSON.stringify(results, null, 2) : results.map(report).join('\n\n'));
}

export { analyze, report };
