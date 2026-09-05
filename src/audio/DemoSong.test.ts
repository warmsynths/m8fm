import { describe, it, expect } from 'vitest';
import { getDemoPatternForMachine } from './DemoPatterns';
import { buildDemoSong, serializeDemoSong } from './DemoSong';
import { MacroMapper, type AnchorName } from './MacroMapper';
// @ts-ignore
import { loadM8File, dumpM8File } from 'm8-js';

const ANCHORS: AnchorName[] = [
  'Electric Piano',
  'Sub Bass',
  'Mallet',
  'Pad',
  'Percussion',
  'Vintage Lead'
];

describe('DemoPatterns', () => {
  it('defines valid demo patterns for all machines', () => {
    for (const anchor of ANCHORS) {
      const pattern = getDemoPatternForMachine(anchor);
      expect(pattern).toBeDefined();
      expect(pattern.tempo).toBeGreaterThan(60);
      expect(pattern.tempo).toBeLessThanOrEqual(200);
      expect(pattern.totalSteps).toBeGreaterThanOrEqual(16);
      expect(pattern.notes.length).toBeGreaterThan(0);

      for (const note of pattern.notes) {
        expect(note.step).toBeGreaterThanOrEqual(0);
        expect(note.step).toBeLessThan(pattern.totalSteps);
        expect(note.note).toBeGreaterThanOrEqual(0);
        expect(note.note).toBeLessThanOrEqual(127);
        expect(note.track).toBeGreaterThanOrEqual(0);
        expect(note.track).toBeLessThan(8);
      }
    }
  });
});

describe('DemoSong builder', () => {
  it('builds a valid M8 Song for each anchor machine', () => {
    for (const anchor of ANCHORS) {
      const mapper = new MacroMapper(anchor);
      const patch = mapper.getPatch();
      const pattern = getDemoPatternForMachine(anchor);

      const song = buildDemoSong(patch, pattern);
      expect(song).toBeDefined();

      const bytes = Uint8Array.from(dumpM8File(song));
      expect(bytes.length).toBeGreaterThan(50000);

      const reloaded = loadM8File(bytes).asObject();
      expect(reloaded.tempo).toBe(pattern.tempo);

      // Instrument 0 is our FM synth patch
      const instr = reloaded.instruments[0];
      expect(instr.kindStr).toBe('FMSYNTH');
      expect(instr.instrParams.algo).toBe(patch.algo);
      expect(instr.instrParams.operators[0].shape).toBe(patch.operators[0].shape);
      expect(instr.instrParams.operators[0].ratio).toBe(patch.operators[0].ratio);

      // Track 0 has a chain assigned
      expect(reloaded.steps[0].tracks[0]).not.toBe(0xff);

      // Check that at least one phrase has notes
      const chainIdx = reloaded.steps[0].tracks[0];
      const chain = reloaded.chains[chainIdx];
      const firstPhraseIdx = chain.steps[0].phrase;
      expect(firstPhraseIdx).not.toBe(0xff);

      const phrase = reloaded.phrases[firstPhraseIdx];
      const activeSteps = phrase.steps.filter((s: any) => s.note !== 0xff);
      expect(activeSteps.length).toBeGreaterThan(0);
    }
  });

  it('serializes directly through serializeDemoSong', () => {
    const mapper = new MacroMapper('Electric Piano');
    const patch = mapper.getPatch();
    const pattern = getDemoPatternForMachine('Electric Piano');

    const bytes = serializeDemoSong(patch, pattern, 'DEMO_EP');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(50000);

    const reloaded = loadM8File(bytes).asObject();
    expect(reloaded.name.trim()).toBe('DEMO_EP');
  });

  it('builds a multi-instrument song for Percussion with Kick, Snare, Closed Hat, and Open Hat', () => {
    const mapper = new MacroMapper('Percussion');
    const multiPatches = [
      mapper.getPatchForPreset(0),
      mapper.getPatchForPreset(1),
      mapper.getPatchForPreset(2),
      mapper.getPatchForPreset(3)
    ];
    const pattern = getDemoPatternForMachine('Percussion');

    const song = buildDemoSong(multiPatches[0], pattern, 'PERC_BEAT', multiPatches);
    expect(song).toBeDefined();

    const bytes = Uint8Array.from(dumpM8File(song));
    const reloaded = loadM8File(bytes).asObject();

    expect(reloaded.instruments[0].name.trim()).toBe('M8FM KIK');
    expect(reloaded.instruments[1].name.trim()).toBe('M8FM SNR');
    expect(reloaded.instruments[2].name.trim()).toBe('M8FM CHH');
    expect(reloaded.instruments[3].name.trim()).toBe('M8FM OHH');

    // Tracks 0, 1, 2, 3 have chains assigned
    expect(reloaded.steps[0].tracks[0]).not.toBe(0xff);
    expect(reloaded.steps[0].tracks[1]).not.toBe(0xff);
    expect(reloaded.steps[0].tracks[2]).not.toBe(0xff);
    expect(reloaded.steps[0].tracks[3]).not.toBe(0xff);
  });
});
