import { describe, it, expect } from 'vitest';
import { MacroMapper } from './MacroMapper';
import { M8Serializer } from './M8Serializer';
import { getM8ModString } from './FmEngine';
// @ts-ignore
import fs from 'fs';
// @ts-ignore
import { loadM8File } from 'm8-js';

describe('M8 Piano Synthesis & Binary Export Test Suite', () => {
  it('should generate an Electric Piano patch matching the reference E PIANO07 baseline', () => {
    const mapper = new MacroMapper('Electric Piano');
    const params = mapper.getComputedFmParams();
    const serializer = new M8Serializer();

    const binaryBytes = serializer.serializeFmInstrument(params);
    expect(binaryBytes).toBeDefined();
    expect(binaryBytes.length).toBeGreaterThan(0);

    const gen = loadM8File(binaryBytes).asObject();

    // 1. Algorithm: [A>B]+[A>C]+[A>D] (M8 Algo 08)
    expect(gen.instrParams.algo).toBe(8);
    expect(gen.instrParams.algoStr).toBe('[A>B]+[A>C]+[A>D]');

    // 2. Mod Base Amounts
    expect(gen.instrParams.mod1).toBe(128); // 80 hex
    expect(gen.instrParams.mod2).toBe(32);  // 20 hex

    // 3. Operator Parameters
    const ops = gen.instrParams.operators;

    // Op A (Modulator - 3rd Harmonic Tine Ring)
    expect(ops[0].ratio).toBe(3);
    expect(ops[0].ratioFine).toBe(0);
    expect(ops[0].level).toBe(128); // 80 hex
    expect(ops[0].modA).toBe(2);   // 2▸LEV
    expect(ops[0].feedback).toBe(0); // 00 hex

    // Op B (Sub-Octave Body Carrier)
    expect(ops[1].ratio).toBe(0);
    expect(ops[1].ratioFine).toBe(50); // 0.50
    expect(ops[1].level).toBe(104); // 68 hex
    expect(ops[1].modA).toBe(0);   // -----

    // Op C (5th Overtone Carrier)
    expect(ops[2].ratio).toBe(1);
    expect(ops[2].ratioFine).toBe(50); // 1.50
    expect(ops[2].level).toBe(136); // 88 hex
    expect(ops[2].modA).toBe(0);   // -----

    // Op D (Root Pitch Carrier)
    expect(ops[3].ratio).toBe(1);
    expect(ops[3].ratioFine).toBe(0);  // 1.00
    expect(ops[3].level).toBe(144); // 90 hex
    expect(ops[3].modA).toBe(0);   // -----

    // 4. Envelopes
    // Env 1 (Body Decay -> MOD 1)
    expect(gen.envelopes[0].dest).toBe(3); // MOD 1
    expect(gen.envelopes[0].decay).toBe(31); // 20 hex (~32 dec)

    // Env 2 (Tine Attack Sweep -> MOD 2)
    expect(gen.envelopes[1].dest).toBe(4); // MOD 2
    expect(gen.envelopes[1].amount).toBe(255); // FF hex
    expect(gen.envelopes[1].decay).toBe(23); // 18 hex (~24 dec)

    // 5. Lowpass Filter
    expect(gen.filterParams.type).toBe(1); // LP Lowpass
    expect(gen.filterParams.cutoff).toBe(206); // D0 hex (~8kHz)

    // 6. Stereo Chorus
    expect(gen.mixerParams.cho).toBe(160); // A0 hex (63%)
  });

  it('should properly render M8 MOD slot strings', () => {
    expect(getM8ModString(0)).toBe('-----');
    expect(getM8ModString(1)).toBe('1\u25b8LEV');
    expect(getM8ModString(2)).toBe('2\u25b8LEV');
    expect(getM8ModString(3)).toBe('3\u25b8LEV');
    expect(getM8ModString(4)).toBe('4\u25b8LEV');
    expect(getM8ModString(undefined)).toBe('-----');
  });

  it('should verify generated .m8i file against real disk file E PIANO07.m8i', () => {
    const diskPath = 'e:/work/m8-tracker-instruments/E PIANO07.m8i';
    if (!fs.existsSync(diskPath)) return;

    const refDisk = loadM8File(fs.readFileSync(diskPath)).asObject();

    const mapper = new MacroMapper('Electric Piano');
    const params = mapper.getComputedFmParams();
    const serializer = new M8Serializer();
    const gen = loadM8File(serializer.serializeFmInstrument(params)).asObject();

    // Algorithm
    expect(gen.instrParams.algo).toBe(refDisk.instrParams.algo);
    expect(gen.instrParams.algoStr).toBe(refDisk.instrParams.algoStr);

    // All 4 operators
    for (let i = 0; i < 4; i++) {
      const label = ['A', 'B', 'C', 'D'][i];
      expect(gen.instrParams.operators[i].ratio, `Op ${label} ratio`).toBe(refDisk.instrParams.operators[i].ratio);
      expect(gen.instrParams.operators[i].ratioFine, `Op ${label} ratioFine`).toBe(refDisk.instrParams.operators[i].ratioFine);
      expect(gen.instrParams.operators[i].level, `Op ${label} level`).toBe(refDisk.instrParams.operators[i].level);
      expect(gen.instrParams.operators[i].modA, `Op ${label} modA`).toBe(refDisk.instrParams.operators[i].modA);
      expect(gen.instrParams.operators[i].modB, `Op ${label} modB`).toBe(refDisk.instrParams.operators[i].modB);
      expect(gen.instrParams.operators[i].feedback, `Op ${label} feedback`).toBe(refDisk.instrParams.operators[i].feedback);
    }

    // Envelope destinations (critical for buzzing vs silky)
    expect(gen.envelopes[0].dest, 'Env1 dest').toBe(refDisk.envelopes[0].dest);
    expect(gen.envelopes[1].dest, 'Env2 dest').toBe(refDisk.envelopes[1].dest);
    expect(gen.envelopes[1].amount, 'Env2 amount').toBe(refDisk.envelopes[1].amount);

    // Envelope decay values (allow ±1 for rounding)
    expect(Math.abs(gen.envelopes[0].decay - refDisk.envelopes[0].decay), 'Env1 decay drift').toBeLessThanOrEqual(1);
    expect(Math.abs(gen.envelopes[1].decay - refDisk.envelopes[1].decay), 'Env2 decay drift').toBeLessThanOrEqual(1);

    // Filter (LP type, cutoff within ±3)
    expect(gen.filterParams.type, 'Filter type').toBe(refDisk.filterParams.type);
    expect(Math.abs(gen.filterParams.cutoff - refDisk.filterParams.cutoff), 'Filter cutoff drift').toBeLessThanOrEqual(3);

    // Mixer (Chorus within ±1)
    expect(Math.abs(gen.mixerParams.cho - refDisk.mixerParams.cho), 'Chorus drift').toBeLessThanOrEqual(1);
  });
});

