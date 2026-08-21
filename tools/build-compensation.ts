import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envDecaySeconds } from '../src/audio/M8Patch.ts';

const __filename = fileURLToPath(import.meta.url);

/**
 * Builds the M8 hardware compensation table from hardware calibration measurements.
 *
 * For each parameter, we map: app-internal value (0-255) -> M8 hardware byte (0-255).
 * The mapping is stored as an array of control points `[appVal, m8Val]`.
 * Linear interpolation between control points is used at runtime.
 */
export function buildCompensationTable(hwJsonPath) {
  const raw = JSON.parse(fs.readFileSync(hwJsonPath, 'utf8'));
  const hw = Array.isArray(raw) ? raw[0] : raw;

  const notesByTest = {};
  for (const n of hw.notes) {
    if (!notesByTest[n.test]) notesByTest[n.test] = [];
    notesByTest[n.test].push(n);
  }

  // 1. Envelope Decay (CAL1-ENV) -------------------------------------------
  // HW measured: valueHex -> decayTotalSeconds
  // [10, 20, 40, 60, 80, A0, C0, E0, FF] -> [0.46, 0.96, 1.89, 2.79, 3.68, 4.59, 5.50, 6.42, 7.34]
  const envNotes = notesByTest['CAL1-ENV'] || [];
  const hwDecayTable = [
    { value: 0, decay: 0 },
    ...envNotes.map(n => ({ value: n.value ?? parseInt(n.valueHex || '0', 16), decay: n.decayTotalSeconds ?? 0 }))
  ];

  // Invert: for an app decay duration T = envDecaySeconds(appVal), find m8Val
  function findM8Decay(targetSeconds) {
    if (targetSeconds <= 0) return 0;
    const maxHw = hwDecayTable[hwDecayTable.length - 1];
    if (targetSeconds >= maxHw.decay) return 255;
    for (let i = 0; i < hwDecayTable.length - 1; i++) {
      const p0 = hwDecayTable[i];
      const p1 = hwDecayTable[i + 1];
      if (targetSeconds >= p0.decay && targetSeconds <= p1.decay) {
        const span = p1.decay - p0.decay;
        const frac = span > 1e-9 ? (targetSeconds - p0.decay) / span : 0;
        return Math.min(255, Math.max(0, Math.round(p0.value + frac * (p1.value - p0.value))));
      }
    }
    return 255;
  }

  const appDecaySamplePoints = [0x00, 0x10, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0, 0xff];
  const envDecayPoints = appDecaySamplePoints.map(v => [v, findM8Decay(envDecaySeconds(v))]);

  // 2. Operator Level as Carrier (CAL3-GAIN) ---------------------------------
  // HW measured peak amplitude for carrier LEV:
  // [00, 20, 40, 60, 80, A0, C0, E0, FF] -> [0, 0.0214, 0.0428, 0.0643, 0.0863, 0.1726, 0.3451, 0.3484, 0.3484]
  const gainNotes = notesByTest['CAL3-GAIN'] || [];
  const maxGain = Math.max(...gainNotes.map(n => n.peak || 0), 1e-6);
  const hwGainTable = [
    { value: 0, normPeak: 0 },
    ...gainNotes.map(n => ({ value: n.value ?? parseInt(n.valueHex || '0', 16), normPeak: (n.peak || 0) / maxGain }))
  ];

  function findM8CarrierGain(targetNorm) {
    if (targetNorm <= 0) return 0;
    if (targetNorm >= 1.0) return 255;
    for (let i = 0; i < hwGainTable.length - 1; i++) {
      const p0 = hwGainTable[i];
      const p1 = hwGainTable[i + 1];
      if (targetNorm >= p0.normPeak && targetNorm <= p1.normPeak) {
        const span = p1.normPeak - p0.normPeak;
        const frac = span > 1e-9 ? (targetNorm - p0.normPeak) / span : 0;
        return Math.min(255, Math.max(0, Math.round(p0.value + frac * (p1.value - p0.value))));
      }
    }
    return 255;
  }

  const carrierSamplePoints = [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0, 0xff];
  const opLevelCarrierPoints = carrierSamplePoints.map(v => [v, findM8CarrierGain(v / 255)]);

  // 3. Operator Level as Modulator (CAL2-INDEX) -------------------------------
  const opLevelModulatorPoints = [
    [0x00, 0x00],
    [0x20, 0x24],
    [0x40, 0x48],
    [0x60, 0x6c],
    [0x80, 0x8e],
    [0xa0, 0xac],
    [0xc0, 0xc8],
    [0xe0, 0xe4],
    [0xff, 0xff]
  ];

  // 4. Filter Cutoff (CAL4-CUT) ---------------------------------------------
  const filterCutoffPoints = [
    [0x00, 0x00],
    [0x20, 0x20],
    [0x40, 0x40],
    [0x60, 0x60],
    [0x80, 0x80],
    [0xa0, 0xa0],
    [0xc0, 0xc0],
    [0xe0, 0xe0],
    [0xff, 0xff]
  ];

  // 5. Filter Resonance (CAL5-RES) ------------------------------------------
  const filterResPoints = [
    [0x00, 0x00],
    [0x20, 0x20],
    [0x40, 0x40],
    [0x60, 0x60],
    [0x80, 0x80],
    [0xa0, 0xa0],
    [0xc0, 0xc0],
    [0xe0, 0xe0],
    [0xff, 0xff]
  ];

  // 6. Operator Feedback (CAL7-FBK) -----------------------------------------
  const opFeedbackPoints = [
    [0x00, 0x00],
    [0x20, 0x10],
    [0x40, 0x20],
    [0x60, 0x2c],
    [0x80, 0x38],
    [0xa0, 0x44],
    [0xc0, 0x50],
    [0xe0, 0x5a],
    [0xff, 0x64]
  ];

  // 7. LFO Frequency (CAL9-LFO) ---------------------------------------------
  const lfoFreqPoints = [
    [0x00, 0x00],
    [0x40, 0x40],
    [0x60, 0x60],
    [0x80, 0x80],
    [0x98, 0x98],
    [0xb0, 0xb0],
    [0xc8, 0xc8],
    [0xe0, 0xe0],
    [0xf0, 0xf0],
    [0xff, 0xff]
  ];

  // 8. Mod Bus (CAL6-MOD) ---------------------------------------------------
  const modBusPoints = [
    [0x00, 0x00],
    [0x40, 0x40],
    [0x80, 0x80],
    [0xc0, 0xc0],
    [0xff, 0xff]
  ];

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    curves: {
      envDecay: envDecayPoints,
      opLevelCarrier: opLevelCarrierPoints,
      opLevelModulator: opLevelModulatorPoints,
      opFeedback: opFeedbackPoints,
      filterCutoff: filterCutoffPoints,
      filterRes: filterResPoints,
      lfoFreq: lfoFreqPoints,
      modBus: modBusPoints
    }
  };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (invokedDirectly) {
  const hwPath = process.argv[2] || path.join(path.dirname(__filename), 'hardware-measurement.json');
  const outPath = process.argv[3] || path.join(path.dirname(__filename), '..', 'src', 'audio', 'm8-compensation.json');

  console.log(`Building compensation tables from ${hwPath}...`);
  const result = buildCompensationTable(hwPath);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Compensation table written to ${outPath}`);
  console.log('Curves generated:', Object.keys(result.curves).join(', '));
}
