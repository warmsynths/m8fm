#!/usr/bin/env node
/**
 * Fits the M8's parameter curves from a calibration recording.
 *
 * Each calibration test isolates one unknown, so each can be solved on its own.
 * The numbers this prints are what belongs in src/audio/M8Patch.ts and
 * src/audio/fm-processor.js -- they are the difference between a value meaning
 * the same thing in the app as it does on the device.
 *
 *   node tools/fit-hardware-curves.mjs tools/M8FM-CALIBRA.wav
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWav, envelope } from './analyze-recording.mjs';

/* ------------------------------------------------------------------ maths */

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
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
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

/** Bessel function of the first kind, by numerical integration. */
function besselJ(n, x) {
  const steps = 800;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const t = ((i + 0.5) * Math.PI) / steps;
    sum += Math.cos(n * t - x * Math.sin(t));
  }
  return sum / steps;
}

/**
 * Magnitude of harmonic k for a 1:1 FM pair at modulation index I.
 * Sidebands below zero hertz fold back onto the positive axis, which is why the
 * upper sideband is not the whole story.
 */
function fmHarmonic(k, index) {
  return Math.abs(besselJ(k - 1, index) + (k % 2 === 0 ? 1 : -1) * besselJ(k + 1, index));
}

/* ------------------------------------------------------------- extraction */

function slice(samples, sampleRate, note, fromSeconds, lengthSeconds) {
  const a = Math.round((note.startSeconds + fromSeconds) * sampleRate);
  const b = Math.round((note.startSeconds + fromSeconds + lengthSeconds) * sampleRate);
  return samples.slice(Math.max(0, a), Math.min(samples.length, b));
}

function magnitudeSpectrum(seg, size = 32768) {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const n = Math.min(size, seg.length);
  for (let i = 0; i < n; i++) {
    re[i] = seg[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  fft(re, im);
  const mag = new Float64Array(size / 2);
  for (let b = 0; b < size / 2; b++) mag[b] = Math.hypot(re[b], im[b]);
  return mag;
}

function harmonicMagnitudes(seg, sampleRate, f0, count) {
  const size = 32768;
  const mag = magnitudeSpectrum(seg, size);
  const binHz = sampleRate / size;
  const out = [];
  for (let k = 1; k <= count; k++) {
    const centre = Math.round((k * f0) / binHz);
    let peak = 0;
    for (let b = Math.max(0, centre - 3); b <= centre + 3 && b < mag.length; b++) peak = Math.max(peak, mag[b]);
    out.push(peak);
  }
  return out;
}

function peakOf(seg) {
  let p = 0;
  for (const v of seg) p = Math.max(p, Math.abs(v));
  return p;
}

function rmsOf(seg) {
  let s = 0;
  for (const v of seg) s += v * v;
  return Math.sqrt(s / Math.max(1, seg.length));
}

/* ----------------------------------------------------------------- report */

const F0 = 130.75; // the calibration note, as measured

function fitEnvelope(samples, sampleRate, notes, out) {
  out.push('CAL1-ENV  envelope decay');
  out.push('  The (1-t/T)^p model rails at any ceiling it is given, so the decay is');
  out.push('  not polynomial. Fitting a pure exponential instead:');
  out.push('   DEC   dB/sec   DEC x dB/sec');
  const products = [];
  for (const n of notes.filter((x) => x.test === 'CAL1-ENV')) {
    const seg = slice(samples, sampleRate, n, 0, n.slotSeconds);
    const { values, stepSeconds } = envelope(seg, sampleRate, 0.01);
    let pi = 0;
    for (let i = 1; i < values.length; i++) if (values[i] > values[pi]) pi = i;
    const peak = values[pi];
    let sx = 0; let sy = 0; let sxy = 0; let sxx = 0; let c = 0;
    for (let i = pi + 1; i < values.length; i++) {
      const r = values[i] / peak;
      if (r > 0.9) continue;
      if (r < 0.02) break;
      const t = (i - pi) * stepSeconds;
      const y = Math.log(r);
      sx += t; sy += y; sxy += t * y; sxx += t * t; c++;
    }
    if (c < 4) continue;
    const slope = (c * sxy - sx * sy) / (c * sxx - sx * sx);
    const dbPerSec = -slope * 8.6859;
    products.push(n.value * dbPerSec);
    out.push(`   ${n.valueHex}    ${dbPerSec.toFixed(1).padStart(6)}   ${(n.value * dbPerSec).toFixed(0).padStart(10)}`);
  }
  const mean = products.reduce((a, b) => a + b, 0) / products.length;
  const spread = Math.max(...products.map((p) => Math.abs(p - mean) / mean));
  out.push(`  => rate = ${mean.toFixed(0)}/DEC dB per second  (constant to ${(spread * 100).toFixed(1)}%)`);
  out.push(`  => time to fall 60 dB = DEC x ${((60 / mean) * 1000).toFixed(2)} ms`);
  out.push('');
}

function fitModulationIndex(samples, sampleRate, notes, out) {
  out.push('CAL2-INDEX  operator LEVEL -> modulation index');
  out.push('   LEV   fitted index (radians)   index/(2*pi) in cycles   (LEV/255)^2');
  const rows = [];
  for (const n of notes.filter((x) => x.test === 'CAL2-INDEX')) {
    const seg = slice(samples, sampleRate, n, 0.4, 1.2);
    if (peakOf(seg) < 1e-4) continue;
    const mags = harmonicMagnitudes(seg, sampleRate, F0, 8);
    const total = Math.sqrt(mags.reduce((a, b) => a + b * b, 0));
    if (total <= 0) continue;
    const measured = mags.map((m) => m / total);

    let best = null;
    for (let index = 0; index <= 12; index += 0.005) {
      const model = [];
      for (let k = 1; k <= 8; k++) model.push(fmHarmonic(k, index));
      const norm = Math.sqrt(model.reduce((a, b) => a + b * b, 0));
      if (norm <= 0) continue;
      let err = 0;
      for (let k = 0; k < 8; k++) err += (measured[k] - model[k] / norm) ** 2;
      if (!best || err < best.err) best = { err, index };
    }
    rows.push({ value: n.value, hex: n.valueHex, index: best.index });
    out.push(
      `   ${n.valueHex}   ${best.index.toFixed(3).padStart(18)}   ${(best.index / (2 * Math.PI)).toFixed(4).padStart(20)}`
      + `   ${((n.value / 255) ** 2).toFixed(4).padStart(12)}`
    );
  }
  // Fit index = A * (LEV/255)^p
  let bestFit = null;
  for (let p = 0.5; p <= 4; p += 0.01) {
    let num = 0; let den = 0;
    for (const r of rows) {
      const x = (r.value / 255) ** p;
      num += x * r.index; den += x * x;
    }
    if (den <= 0) continue;
    const A = num / den;
    let err = 0;
    for (const r of rows) err += (r.index - A * (r.value / 255) ** p) ** 2;
    if (!bestFit || err < bestFit.err) bestFit = { err, A, p };
  }
  if (bestFit) {
    out.push(`  => index ~ ${bestFit.A.toFixed(3)} * (LEV/255)^${bestFit.p.toFixed(2)} radians`);
    out.push(`  => in cycles: ${(bestFit.A / (2 * Math.PI)).toFixed(4)} * (LEV/255)^${bestFit.p.toFixed(2)}`);
  }
  out.push('');
}

function fitModBus(samples, sampleRate, notes, out) {
  out.push('CAL6-MOD  does a MOD bus add to the operator level, or scale it?');
  out.push('  OP A sits at LEV 40. Carrier level is linear, so peak is proportional');
  out.push('  to the effective level.');
  out.push('   MOD1    peak     implied effective LEV');
  const rows = notes.filter((x) => x.test === 'CAL6-MOD');
  let unit = null;
  for (const n of rows) {
    const seg = slice(samples, sampleRate, n, 0.4, 1.2);
    const pk = peakOf(seg);
    if (unit === null) unit = pk / 0x40; // first row is MOD1 = 00, so LEV is just 40
    out.push(`   ${n.valueHex}    ${pk.toFixed(4).padStart(7)}   ${(pk / unit).toFixed(0).padStart(18)}`);
  }
  out.push('  => additive would read 40, 80, C0, FF, FF (64, 128, 192, 255, 255)');
  out.push('');
}

function fitCutoff(samples, sampleRate, notes, out) {
  out.push('CAL4-CUT  FILTER CUT -> corner frequency');
  out.push('  A saw through the filter, compared against the same saw with CUT at FF.');
  out.push('   CUT    -3dB corner (Hz)');
  const rows = notes.filter((x) => x.test === 'CAL4-CUT');
  const open = rows[rows.length - 1];
  const openMags = harmonicMagnitudes(slice(samples, sampleRate, open, 0.4, 1.2), sampleRate, F0, 40);
  for (const n of rows) {
    const seg = slice(samples, sampleRate, n, 0.4, 1.2);
    if (peakOf(seg) < 1e-4) { out.push(`   ${n.valueHex}    (silent)`); continue; }
    const mags = harmonicMagnitudes(seg, sampleRate, F0, 40);
    let corner = null;
    for (let k = 0; k < 40; k++) {
      if (openMags[k] <= 0) continue;
      const db = 20 * Math.log10(Math.max(mags[k], 1e-12) / openMags[k]);
      if (db <= -3) {
        corner = (k + 1) * F0;
        break;
      }
    }
    out.push(`   ${n.valueHex}    ${corner === null ? '> 5 kHz (wide open)' : corner.toFixed(0).padStart(10)}`);
  }
  out.push('');
}

function fitLfo(samples, sampleRate, notes, out) {
  out.push('CAL9-LFO  LFO FREQ -> hertz');
  out.push('   FRQ     measured Hz');
  for (const n of notes.filter((x) => x.test === 'CAL9-LFO')) {
    const seg = slice(samples, sampleRate, n, 0.3, Math.max(2, n.slotSeconds - 1.5));
    if (peakOf(seg) < 1e-4) { out.push(`   ${n.valueHex}     (silent)`); continue; }
    const { values, stepSeconds } = envelope(seg, sampleRate, 0.005);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const centred = values.map((v) => v - mean);
    // Autocorrelation peak gives the tremolo period.
    let bestLag = 0; let bestScore = -Infinity;
    const minLag = Math.round(0.02 / stepSeconds);
    const maxLag = Math.min(centred.length - 2, Math.round(6 / stepSeconds));
    for (let lag = minLag; lag < maxLag; lag++) {
      let s = 0;
      for (let i = 0; i + lag < centred.length; i++) s += centred[i] * centred[i + lag];
      s /= (centred.length - lag);
      if (s > bestScore) { bestScore = s; bestLag = lag; }
    }
    const hz = bestLag > 0 ? 1 / (bestLag * stepSeconds) : 0;
    out.push(`   ${n.valueHex}     ${hz.toFixed(2).padStart(9)}`);
  }
  out.push('');
}

function fitFeedback(samples, sampleRate, notes, out) {
  out.push('CAL7-FBK  FBK -> feedback depth (harmonic 2 relative to the fundamental)');
  out.push('   FBK    h2 (dB)   h3 (dB)   peak');
  for (const n of notes.filter((x) => x.test === 'CAL7-FBK')) {
    const seg = slice(samples, sampleRate, n, 0.4, 1.2);
    if (peakOf(seg) < 1e-4) { out.push(`   ${n.valueHex}    (silent)`); continue; }
    const mags = harmonicMagnitudes(seg, sampleRate, F0, 6);
    const db = (k) => (mags[0] > 0 ? 20 * Math.log10(Math.max(mags[k], 1e-12) / mags[0]) : 0);
    out.push(`   ${n.valueHex}   ${db(1).toFixed(1).padStart(8)}  ${db(2).toFixed(1).padStart(8)}   ${peakOf(seg).toFixed(4)}`);
  }
  out.push('');
}

function fitCarrierGain(samples, sampleRate, notes, out) {
  out.push('CAL3-GAIN  carrier LEVEL -> output level');
  out.push('   LEV     peak      RMS    peak/LEV   RMS/LEV');
  for (const n of notes.filter((x) => x.test === 'CAL3-GAIN')) {
    const seg = slice(samples, sampleRate, n, 0.4, 1.2);
    const pk = peakOf(seg);
    const rms = rmsOf(seg);
    const ratio = n.value > 0 ? pk / n.value : 0;
    const rratio = n.value > 0 ? rms / n.value : 0;
    out.push(
      `   ${n.valueHex}   ${pk.toFixed(4).padStart(7)}  ${rms.toFixed(4).padStart(7)}`
      + `   ${(ratio * 1000).toFixed(3).padStart(8)}  ${(rratio * 1000).toFixed(3).padStart(8)}`
    );
  }
  out.push('  (peak/LEV constant => linear. Peak flattening while RMS still rises');
  out.push('   means the recording chain limited, not the M8.)');
  out.push('');
}

/* -------------------------------------------------------------------- cli */

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const wavPath = process.argv[2] || 'tools/M8FM-CALIBRA.wav';
  const manifestPath = process.argv[3] || 'calibration/manifest.json';

  const { samples, sampleRate } = readWav(fs.readFileSync(wavPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const notes = manifest.notes;

  const out = [];
  out.push(`Fitting M8 parameter curves from ${wavPath}`);
  out.push(`  ${(samples.length / sampleRate).toFixed(1)}s, ${notes.length} measurements`);
  out.push('');

  fitEnvelope(samples, sampleRate, notes, out);
  fitModulationIndex(samples, sampleRate, notes, out);
  fitModBus(samples, sampleRate, notes, out);
  fitCarrierGain(samples, sampleRate, notes, out);
  fitCutoff(samples, sampleRate, notes, out);
  fitLfo(samples, sampleRate, notes, out);
  fitFeedback(samples, sampleRate, notes, out);

  console.log(out.join('\n'));
}
