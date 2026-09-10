export const A = (d: string, w?: number, c?: string, s?: string | number) => ({
  d: d, w: w || 1.5, c: c || 'square', s: s || 'none', j: c === 'round' ? 'round' : 'miter'
});

export interface Machine {
  id: string;
  name: string;
  algo: string;
  waves: string[];
  icon: any[];
  mods: [string, string, string, ((v: number) => any[])?][];
  presets: [string, number[]][];
}

export const MACHINES: Machine[] = [
  {
    id: 'ep',
    name: 'Electric Piano',
    algo: 'A>B+C>D',
    waves: ['SIN', 'SIN', 'SIN', 'SIN'],
    icon: [
      A('M4 14h16v6H4z'), A('M9 14v6'), A('M15 14v6'), 
      A('M12 5h0', 2.5, 'square', 0)
    ],
    mods: [
      ['TINE', 'TIN', 'Rungs lengthen — the bar rings wider and glassier.'],
      ['STRIKE', 'STR', 'The hammer falls from higher and lands harder.'],
      ['BARK', 'BRK', 'Sharp bite on the peak: fast attack, slow release.'],
      ['TREMOLO', 'TRM', 'The rails move apart as the wave swells between them.']
    ],
    presets: [['Classic MK1', [62, 74, 38, 46]], ['Glassy Rhodes', [88, 40, 12, 58]], ['Dirty Wurli', [44, 86, 72, 30]]]
  },

  {
    id: 'sb',
    name: 'Sub Bass',
    algo: 'A>B>C>D',
    waves: ['SIN', 'SIN', 'TRI', 'SIN'],
    icon: [
      A('M12 12h0', 4, 'square', 0), A('M8 8h8v8H8z'), A('M4 4h16v16H4z')
    ],
    mods: [
      ['WEIGHT', 'WGT', 'The stack sinks and the bottom line thickens.'],
      ['SNAP', 'SNP', 'The dot drops in from further out and snaps to the step.'],
      ['GROWL', 'GRW', 'The teeth grind sideways — faster and further as it opens up.'],
      ['BOOM', 'BOM', 'Each hit thumps the core and pushes a ring out.']
    ],
    presets: [['Deep', [81, 29, 20, 67]], ['Reese', [60, 44, 78, 50]], ['808', [90, 70, 10, 88]]]
  },

  {
    id: 'ml',
    name: 'Mallet',
    algo: 'A+B>C>D',
    waves: ['SIN', 'TRI', 'SIN', 'SQR'],
    icon: [
      A('M4 20h16'), A('M9 9 15 15'), A('M6 18 9 15'), A('M16 8h0', 4, 'square', 0)
    ],
    mods: [
      ['FOCUS', 'FOC', 'The ring tightens onto the core — energy converging.'],
      ['DAMPEN', 'DMP', 'Bars collapse in sequence, left to right, then recover.'],
      ['IMPACT', 'IMP', 'One burst at the hit, then scatter — never a steady flicker.'],
      ['TAIL', 'TAL', 'How long the bar keeps speaking after the hit.']
    ],
    presets: [['Wood', [44, 70, 13, 28]], ['Glass Bell', [72, 30, 8, 64]], ['Bone', [30, 88, 40, 18]]]
  },

  {
    id: 'pd',
    name: 'Pad',
    algo: '(A+B)>(C+D)',
    waves: ['SIN', 'SIN', 'SIN', 'SIN'],
    icon: [
      A('M6 6h12v4H6z'), A('M8 10h8v4H8z'), A('M10 14h4v4h-4z', 1.5, 'square', 0)
    ],
    mods: [
      ['WASH', 'WSH', 'Layers glide across each other at different speeds.'],
      ['SHIMMER', 'SHM', 'Sparkles swell and fade out of phase with each other.'],
      ['CHORUS', 'CHO', 'Two copies drift in opposite directions — detuning made visible.'],
      ['HOLLOW', 'HLW', 'The core shrinks and dissolves; the shell stays put.']
    ],
    presets: [['Drift', [58, 34, 51, 22]], ['Choir', [70, 60, 66, 14]], ['Void', [40, 20, 30, 80]]]
  },

  {
    id: 'pc',
    name: 'Percussion',
    algo: 'A>B+C>D',
    waves: ['SIN', 'SQR', 'SAW', 'SQR'],
    icon: [
      A('M4 4h6v6H4z', 1.5, 'square'), A('M14 4h6v6h-6z', 1.5, 'square'),
      A('M4 14h6v6H4z', 1.5, 'square'), A('M14 14h6v6h-6z', 1.5, 'square'),
      A('M12 12h0', 3, 'square', 0)
    ],
    mods: [
      ['BODY', 'BDY', 'The shell stretches — the drum tunes down and rings wider.'],
      ['SNAP', 'SNP', 'The transient drops in from further out and lands harder.'],
      ['NOISE', 'NOI', 'Grain washes in over the tone — sand replacing the core.'],
      ['DECAY', 'DEC', 'The tail closes down — each step falls away sooner.']
    ],
    presets: [
      ['Kick', [78, 46, 12, 62]],
      ['Snare', [42, 74, 64, 36]],
      ['Closed Hat', [22, 66, 88, 10]],
      ['Open Hat', [26, 58, 84, 66]]
    ]
  },

  {
    id: 'vl',
    name: 'Vintage Lead',
    algo: 'A>B+C+D',
    waves: ['SAW', 'SIN', 'SIN', 'TRI'],
    icon: [
      A('M3 18v-4h3v-4h3v-4h3v12', 1.5, 'square', 0), A('M12 18v-4h3v-4h3v-4h3v12', 1.5, 'square', 0)
    ],
    mods: [
      ['TIMBRE', 'TMB', 'Waveforms hand over one to the next — sine, triangle, square.'],
      ['CUTOFF', 'CUT', 'The cut sweeps back and forth across the curve.'],
      ['ENVELOPE', 'ENV', 'The peak jumps on attack and settles back down.'],
      ['SLOP', 'SLP', 'Lazy, irregular wander — drift plus a slight tilt, never on the grid.']
    ],
    presets: [['Volt', [37, 72, 49, 27]], ['Acid', [60, 88, 80, 15]], ['Drunk', [30, 50, 40, 85]]]
  }
];

export const FM_NAMES = ['ALGO', 'RATIO', 'FBK', 'MOD A', 'MOD B'];

