export interface DemoNote {
  /** Track index on M8 (0..7). Default 0. Multiple tracks allow polyphonic chords. */
  track: number;
  /** Step index within the pattern (0..totalSteps-1, 16th notes). */
  step: number;
  /** MIDI note number (0..127). e.g. 60 = C4, 48 = C3, 36 = C2. */
  note: number;
  /** Note velocity (0..1). Default 1.0. */
  velocity?: number;
  /** Duration in 16th note steps. */
  length?: number;
}

export interface DemoPattern {
  id: string;
  name: string;
  tempo: number;
  totalSteps: number;
  notes: DemoNote[];
}

/**
 * Curated, highly musical demo patterns designed specifically for each
 * instrument type in the M8 FM synth engine.
 */

// 1. Electric Piano: 32-step Neo-Soul / Jazz Rhodes progression (110 BPM)
// Chords: Dm9 -> G13 -> Cmaj9 -> A7#9 with syncopated comping
const EP_DEMO_PATTERN: DemoPattern = {
  id: 'ep_soul',
  name: 'Neo-Soul Rhodes',
  tempo: 110,
  totalSteps: 32,
  notes: [
    // Bar 1: Dm9 (D3, F4, A4, C5, E5) -> G13 (G2, F4, B4, E5)
    // Track 0: Bass root
    { track: 0, step: 0, note: 50, length: 5 },  // D3
    { track: 0, step: 6, note: 50, length: 2 },  // D3 bounce
    { track: 0, step: 8, note: 43, length: 6 },  // G2
    { track: 0, step: 14, note: 48, length: 2 }, // C3 passing
    // Track 1: Mid harmony
    { track: 1, step: 0, note: 65, length: 5 },  // F4
    { track: 1, step: 6, note: 65, length: 2 },  // F4
    { track: 1, step: 8, note: 65, length: 4 },  // F4
    { track: 1, step: 12, note: 67, length: 2 }, // G4
    { track: 1, step: 14, note: 70, length: 2 }, // Bb4
    // Track 2: Upper extensions / melody
    { track: 2, step: 0, note: 72, length: 4 },  // C5
    { track: 2, step: 4, note: 76, length: 2 },  // E5
    { track: 2, step: 6, note: 72, length: 2 },  // C5
    { track: 2, step: 8, note: 71, length: 4 },  // B4
    { track: 2, step: 12, note: 76, length: 2 }, // E5
    { track: 2, step: 14, note: 74, length: 2 }, // D5

    // Bar 2: Cmaj9 (C3, E4, G4, B4, D5) -> A7#9 (A2, G4, C#5, F5)
    // Track 0: Bass root
    { track: 0, step: 16, note: 48, length: 6 }, // C3
    { track: 0, step: 22, note: 48, length: 2 }, // C3 bounce
    { track: 0, step: 24, note: 45, length: 6 }, // A2
    { track: 0, step: 30, note: 47, length: 2 }, // B2 passing
    // Track 1: Mid harmony
    { track: 1, step: 16, note: 64, length: 6 }, // E4
    { track: 1, step: 22, note: 67, length: 2 }, // G4
    { track: 1, step: 24, note: 67, length: 4 }, // G4
    { track: 1, step: 28, note: 69, length: 2 }, // A4
    { track: 1, step: 30, note: 70, length: 2 }, // Bb4
    // Track 2: Upper extensions / melody
    { track: 2, step: 16, note: 71, length: 4 }, // B4
    { track: 2, step: 20, note: 74, length: 2 }, // D5
    { track: 2, step: 22, note: 76, length: 2 }, // E5
    { track: 2, step: 24, note: 73, length: 4 }, // C#5
    { track: 2, step: 28, note: 77, length: 2 }, // F5
    { track: 2, step: 30, note: 76, length: 2 }  // E5
  ]
};

// 2. Sub Bass: 32-step heavy syncopated bassline in D minor (128 BPM)
const SUB_BASS_DEMO_PATTERN: DemoPattern = {
  id: 'sub_groove',
  name: 'Heavy Sub Groove',
  tempo: 128,
  totalSteps: 32,
  notes: [
    // Phrase 1 (steps 0..15)
    { track: 0, step: 0, note: 38, length: 3 },  // D2 heavy drop
    { track: 0, step: 3, note: 38, length: 2 },  // D2 punch
    { track: 0, step: 6, note: 50, length: 2 },  // D3 octave pop
    { track: 0, step: 8, note: 38, length: 2 },  // D2
    { track: 0, step: 11, note: 41, length: 2 }, // F2 minor 3rd
    { track: 0, step: 14, note: 43, length: 2 }, // G2 4th

    // Phrase 2 (steps 16..31)
    { track: 0, step: 16, note: 38, length: 3 }, // D2
    { track: 0, step: 19, note: 38, length: 2 }, // D2
    { track: 0, step: 22, note: 48, length: 2 }, // C3 7th pop
    { track: 0, step: 24, note: 46, length: 3 }, // Bb2 6th slide
    { track: 0, step: 27, note: 45, length: 2 }, // A2 5th
    { track: 0, step: 30, note: 36, length: 2 }  // C2 deep turnaround
  ]
};

// 3. Mallet: 32-step interlocking melodic kalimba / marimba ostinato in E Dorian (120 BPM)
const MALLET_DEMO_PATTERN: DemoPattern = {
  id: 'mallet_cascade',
  name: 'Kalimba Ostinato',
  tempo: 120,
  totalSteps: 32,
  notes: [
    // Track 0: Main bouncing bell melody
    { track: 0, step: 0, note: 64, length: 2 },  // E4
    { track: 0, step: 2, note: 71, length: 2 },  // B4
    { track: 0, step: 4, note: 67, length: 2 },  // G4
    { track: 0, step: 6, note: 74, length: 2 },  // D5
    { track: 0, step: 8, note: 76, length: 2 },  // E5
    { track: 0, step: 10, note: 71, length: 2 }, // B4
    { track: 0, step: 12, note: 74, length: 2 }, // D5
    { track: 0, step: 14, note: 69, length: 2 }, // A4

    { track: 0, step: 16, note: 64, length: 2 }, // E4
    { track: 0, step: 18, note: 71, length: 2 }, // B4
    { track: 0, step: 20, note: 67, length: 2 }, // G4
    { track: 0, step: 22, note: 74, length: 2 }, // D5
    { track: 0, step: 24, note: 79, length: 2 }, // G5 chime
    { track: 0, step: 26, note: 76, length: 2 }, // E5
    { track: 0, step: 28, note: 74, length: 2 }, // D5
    { track: 0, step: 30, note: 71, length: 2 }, // B4

    // Track 1: Counter-rhythm accents
    { track: 1, step: 3, note: 52, length: 3 },  // E3 bass pulse
    { track: 1, step: 11, note: 55, length: 3 }, // G3
    { track: 1, step: 19, note: 52, length: 3 }, // E3
    { track: 1, step: 27, note: 57, length: 3 }  // A3
  ]
};

// 4. Pad: 32-step ambient lush chord swell (92 BPM)
// Chords: Fmaj9 -> G6 -> Em7 -> Am9
const PAD_DEMO_PATTERN: DemoPattern = {
  id: 'pad_swell',
  name: 'Ambient Chord Swell',
  tempo: 92,
  totalSteps: 32,
  notes: [
    // Chord 1 (steps 0..7): Fmaj9 (F3, A4, C5, E5)
    { track: 0, step: 0, note: 53, length: 8 }, // F3
    { track: 1, step: 0, note: 69, length: 8 }, // A4
    { track: 2, step: 0, note: 72, length: 8 }, // C5
    { track: 2, step: 4, note: 76, length: 4 }, // E5 swell

    // Chord 2 (steps 8..15): G6 (G3, B4, D5, E5)
    { track: 0, step: 8, note: 55, length: 8 }, // G3
    { track: 1, step: 8, note: 71, length: 8 }, // B4
    { track: 2, step: 8, note: 74, length: 8 }, // D5
    { track: 2, step: 12, note: 76, length: 4 }, // E5

    // Chord 3 (steps 16..23): Em7 (E3, G4, B4, D5)
    { track: 0, step: 16, note: 52, length: 8 }, // E3
    { track: 1, step: 16, note: 67, length: 8 }, // G4
    { track: 2, step: 16, note: 71, length: 8 }, // B4
    { track: 2, step: 20, note: 74, length: 4 }, // D5

    // Chord 4 (steps 24..31): Am9 (A3, C5, E5, B5)
    { track: 0, step: 24, note: 57, length: 8 }, // A3
    { track: 1, step: 24, note: 72, length: 8 }, // C5
    { track: 2, step: 24, note: 76, length: 8 }, // E5
    { track: 2, step: 28, note: 83, length: 4 }  // B5
  ]
};

// 5. Percussion: 32-step Electro Breakbeat pattern (130 BPM)
const PERCUSSION_DEMO_PATTERN: DemoPattern = {
  id: 'percussion_electro',
  name: 'Electro Breakbeat',
  tempo: 130,
  totalSteps: 32,
  notes: [
    // Track 0: Kick
    { track: 0, step: 0, note: 48, length: 1, velocity: 1.0 },
    { track: 0, step: 6, note: 48, length: 1, velocity: 0.85 },
    { track: 0, step: 10, note: 48, length: 1, velocity: 0.9 },
    { track: 0, step: 16, note: 48, length: 1, velocity: 1.0 },
    { track: 0, step: 22, note: 48, length: 1, velocity: 0.85 },
    { track: 0, step: 26, note: 48, length: 1, velocity: 0.9 },
    { track: 0, step: 28, note: 48, length: 1, velocity: 0.8 },

    // Track 1: Snare
    { track: 1, step: 4, note: 55, length: 1, velocity: 1.0 },
    { track: 1, step: 12, note: 55, length: 1, velocity: 1.0 },
    { track: 1, step: 15, note: 55, length: 1, velocity: 0.45 },
    { track: 1, step: 20, note: 55, length: 1, velocity: 1.0 },
    { track: 1, step: 28, note: 55, length: 1, velocity: 1.0 },
    { track: 1, step: 30, note: 55, length: 1, velocity: 0.55 },
    { track: 1, step: 31, note: 55, length: 1, velocity: 0.4 },

    // Track 2: Closed Hat
    { track: 2, step: 0, note: 72, length: 1, velocity: 0.7 },
    { track: 2, step: 1, note: 72, length: 1, velocity: 0.4 },
    { track: 2, step: 3, note: 72, length: 1, velocity: 0.5 },
    { track: 2, step: 4, note: 72, length: 1, velocity: 0.6 },
    { track: 2, step: 5, note: 72, length: 1, velocity: 0.4 },
    { track: 2, step: 7, note: 72, length: 1, velocity: 0.5 },
    { track: 2, step: 8, note: 72, length: 1, velocity: 0.75 },
    { track: 2, step: 9, note: 72, length: 1, velocity: 0.4 },
    { track: 2, step: 11, note: 72, length: 1, velocity: 0.5 },
    { track: 2, step: 12, note: 72, length: 1, velocity: 0.6 },
    { track: 2, step: 13, note: 72, length: 1, velocity: 0.4 },
    { track: 2, step: 14, note: 72, length: 1, velocity: 0.5 },
    { track: 2, step: 16, note: 72, length: 1, velocity: 0.7 },
    { track: 2, step: 17, note: 72, length: 1, velocity: 0.4 },
    { track: 2, step: 19, note: 72, length: 1, velocity: 0.5 },
    { track: 2, step: 20, note: 72, length: 1, velocity: 0.6 },
    { track: 2, step: 21, note: 72, length: 1, velocity: 0.4 },
    { track: 2, step: 23, note: 72, length: 1, velocity: 0.5 },
    { track: 2, step: 24, note: 72, length: 1, velocity: 0.75 },
    { track: 2, step: 25, note: 72, length: 1, velocity: 0.4 },
    { track: 2, step: 27, note: 72, length: 1, velocity: 0.5 },
    { track: 2, step: 28, note: 72, length: 1, velocity: 0.6 },
    { track: 2, step: 29, note: 72, length: 1, velocity: 0.4 },

    // Track 3: Open Hat
    { track: 3, step: 2, note: 74, length: 2, velocity: 0.9 },
    { track: 3, step: 10, note: 74, length: 2, velocity: 0.85 },
    { track: 3, step: 18, note: 74, length: 2, velocity: 0.9 },
    { track: 3, step: 26, note: 74, length: 2, velocity: 0.95 }
  ]
};

// 6. Vintage Lead: 32-step driving synthwave / 80s lead hook in A minor (124 BPM)
const VINTAGE_LEAD_DEMO_PATTERN: DemoPattern = {
  id: 'lead_riff',
  name: 'Synthwave Lead Hook',
  tempo: 124,
  totalSteps: 32,
  notes: [
    // Phrase 1 (steps 0..15)
    { track: 0, step: 0, note: 57, length: 2 },  // A3
    { track: 0, step: 2, note: 69, length: 2 },  // A4
    { track: 0, step: 4, note: 67, length: 2 },  // G4
    { track: 0, step: 6, note: 64, length: 2 },  // E4
    { track: 0, step: 8, note: 65, length: 3 },  // F4
    { track: 0, step: 11, note: 64, length: 2 }, // E4
    { track: 0, step: 13, note: 62, length: 2 }, // D4
    { track: 0, step: 15, note: 60, length: 1 }, // C4

    // Phrase 2 (steps 16..31)
    { track: 0, step: 16, note: 57, length: 2 }, // A3
    { track: 0, step: 18, note: 69, length: 2 }, // A4
    { track: 0, step: 20, note: 72, length: 2 }, // C5
    { track: 0, step: 22, note: 71, length: 2 }, // B4
    { track: 0, step: 24, note: 69, length: 3 }, // A4
    { track: 0, step: 28, note: 67, length: 2 }, // G4
    { track: 0, step: 30, note: 64, length: 2 }  // E4
  ]
};

export const DEMO_PATTERNS: Record<string, DemoPattern> = {
  'Electric Piano': EP_DEMO_PATTERN,
  'Sub Bass': SUB_BASS_DEMO_PATTERN,
  'Mallet': MALLET_DEMO_PATTERN,
  'Pad': PAD_DEMO_PATTERN,
  'Percussion': PERCUSSION_DEMO_PATTERN,
  'Digital Glitch': PERCUSSION_DEMO_PATTERN,
  'Vintage Lead': VINTAGE_LEAD_DEMO_PATTERN,
  'ep': EP_DEMO_PATTERN,
  'sb': SUB_BASS_DEMO_PATTERN,
  'ml': MALLET_DEMO_PATTERN,
  'pd': PAD_DEMO_PATTERN,
  'pc': PERCUSSION_DEMO_PATTERN,
  'dg': PERCUSSION_DEMO_PATTERN,
  'vl': VINTAGE_LEAD_DEMO_PATTERN
};

/**
 * Returns the matching demo pattern for a given machine name or machine ID.
 * Falls back to Electric Piano demo if not found.
 */
export function getDemoPatternForMachine(machineNameOrId: string): DemoPattern {
  return DEMO_PATTERNS[machineNameOrId] ?? EP_DEMO_PATTERN;
}
