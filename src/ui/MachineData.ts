export const A = (d: string, w?: number, c?: string, s?: string | number) => ({
  d: d, w: w || 1.5, c: c || 'square', s: s || 'none', j: c === 'round' ? 'round' : 'miter'
});

export interface PaletteTheme {
  id: string;
  name: string;
  gnd: string;
  panel: string;
  frame: string;
  ink: string;
  ink2: string;
  line: string;
  track: string;
  accent: string;
}

export const PALETTES: PaletteTheme[] = [
  { id: 'cobalt', name: 'Bone / Cobalt', gnd: '#cfcdc9', panel: '#f3f2ee', frame: '#ecebe5', ink: '#1b1e24', ink2: 'rgba(27,30,36,.74)', line: 'rgba(27,30,36,.18)', track: '#dedcd4', accent: '#2f49d8' },
  { id: 'teal', name: 'Sand / Teal', gnd: '#d3ccbb', panel: '#f0ece1', frame: '#e8e3d6', ink: '#1f2f2c', ink2: 'rgba(31,47,44,.74)', line: 'rgba(31,47,44,.2)', track: '#d8d2c2', accent: '#0d7a6f' },
  { id: 'citron', name: 'Slate / Citron', gnd: '#c9ccc7', panel: '#eceeea', frame: '#e4e6e3', ink: '#242a28', ink2: 'rgba(36,42,40,.74)', line: 'rgba(36,42,40,.18)', track: '#d6d9d4', accent: '#6f8200' },
  { id: 'plum', name: 'Ash / Plum', gnd: '#cdc9d1', panel: '#f1eff2', frame: '#e9e7ea', ink: '#1e1a22', ink2: 'rgba(30,26,34,.74)', line: 'rgba(30,26,34,.18)', track: '#dcd8df', accent: '#8a3ea8' },
  { id: 'amber', name: 'Graphite / Amber', gnd: '#101114', panel: '#212327', frame: '#1a1b1e', ink: '#f0eee9', ink2: 'rgba(240,238,233,.66)', line: 'rgba(240,238,233,.2)', track: 'rgba(240,238,233,.12)', accent: '#e8a33d' },
  { id: 'monokai', name: 'Monokai', gnd: '#1c1d17', panel: '#31322b', frame: '#272822', ink: '#f8f8f2', ink2: 'rgba(248,248,242,.68)', line: 'rgba(248,248,242,.16)', track: 'rgba(248,248,242,.1)', accent: '#a6e22e' },
  { id: 'dracula', name: 'Dracula', gnd: '#1b1c24', panel: '#343746', frame: '#282a36', ink: '#f8f8f2', ink2: 'rgba(248,248,242,.68)', line: 'rgba(248,248,242,.16)', track: 'rgba(248,248,242,.1)', accent: '#bd93f9' },
  { id: 'nord', name: 'Nord', gnd: '#242933', panel: '#3b4252', frame: '#2e3440', ink: '#eceff4', ink2: 'rgba(236,239,244,.7)', line: 'rgba(236,239,244,.18)', track: 'rgba(236,239,244,.11)', accent: '#88c0d0' },
  { id: 'gruvbox', name: 'Gruvbox', gnd: '#1d2021', panel: '#32302f', frame: '#282828', ink: '#ebdbb2', ink2: 'rgba(235,219,178,.7)', line: 'rgba(235,219,178,.18)', track: 'rgba(235,219,178,.1)', accent: '#fe8019' },
  { id: 'solarized', name: 'Solarized Light', gnd: '#e4ddc8', panel: '#fdf6e3', frame: '#eee8d5', ink: '#073642', ink2: 'rgba(7,54,66,.74)', line: 'rgba(7,54,66,.16)', track: '#e0d8be', accent: '#268bd2' }
];

export const PRESET_ICONS: Record<string, string> = {
  'Classic MK1': 'M6 3.2v7.6 M14 3.2v7.6 M6 10.8h8 M10 10.8v6',
  'Glassy Rhodes': 'M10 2.4 17.6 10 10 17.6 2.4 10z M10 6.6 13.4 10 10 13.4 6.6 10z',
  'Dirty Wurli': 'M3 10a7 7 0 1114 0 7 7 0 01-14 0 M6 11.4l2-3 2 3 2-3 2 3',
  'Deep': 'M10 3v9.2 M6.4 8.8 10 12.4 13.6 8.8 M3 16.4h14',
  'Reese': 'M2.6 7.4c2.2 0 2.2-3.2 4.4-3.2s2.2 3.2 4.4 3.2 2.2-3.2 4.4-3.2 M2.6 15.2c2.6 0 2.6-3.4 5.2-3.4s2.6 3.4 5.2 3.4',
  '808': 'M10 3.2a3 3 0 100 6 3 3 0 100-6 M10 9.2a3.9 3.9 0 100 7.8 3.9 3.9 0 100-7.8',
  'Wood': 'M10 4c3.4 0 6 2.7 6 6s-2.6 6-6 6-6-2.7-6-6 2.6-6 6-6 M10 7.4c1.6 0 2.8 1.2 2.8 2.6s-1.2 2.6-2.8 2.6-2.8-1.2-2.8-2.6 1.2-2.6 2.8-2.6',
  'Glass Bell': 'M5.6 13.6c0-5.2 1-8.8 4.4-8.8s4.4 3.6 4.4 8.8z M4.4 13.6h11.2 M10 16h.1',
  'Bone': 'M5 8.2a2.4 2.4 0 100 4.8 2.4 2.4 0 100-4.8 M15 8.2a2.4 2.4 0 100 4.8 2.4 2.4 0 100-4.8 M7.4 10.6h5.2',
  'Drift': 'M2.6 6.4h10 M6.4 10h11 M2.6 13.6h9',
  'Choir': 'M2.8 12.6a7.2 7.2 0 0114.4 0 M5.6 15.6a4.4 4.4 0 018.8 0 M8.6 8.6a1.4 1.4 0 012.8 0',
  'Void': 'M13.6 3.9a7.4 7.4 0 11-7.2 0',
  'Kick': 'M10 5.8a5.6 5.6 0 100 11.2 5.6 5.6 0 100-11.2 M10 2.2v2.2 M4.8 4.2l1.5 1.6 M15.2 4.2l-1.5 1.6',
  'Snare': 'M3.6 6.4h12.8v7.2H3.6z M4.8 7.8 15.2 12.2 M4.8 12.2 15.2 7.8',
  'Closed Hat': 'M3.6 9.2h12.8 M3.6 11.6h12.8 M10 5.2v2.4',
  'Open Hat': 'M3.6 7h12.8 M3.6 13.4h12.8 M10 3.4v2 M5.8 10.2h2.4 M11.8 10.2h2.4',
  'Volt': 'M11.4 2.6 6 10.8h3.6l-1 6.6 5.4-8.4h-3.6z',
  'Acid': 'M2.8 15.4c3.4 0 3-9.8 6.2-9.8s2.4 9.8 8.2 9.8',
  'Drunk': 'M2.8 10c2.6-4.4 3.6 4.6 6-.6s2.8 5.4 8.4.2'
};

export interface Machine {
  id: string;
  name: string;
  algo: string;
  glyph: string;
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
    glyph: 'M4 14h26v14H4z M12.6 14v9 M21.2 14v9 M4 23h26 M7 9.5c6-4.5 14-4.5 20 0 M17 5.6h.1',
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
    glyph: 'M2 27h30 M6 27a11 11 0 0122 0 M11 27a6 6 0 0112 0 M17 24.4h.1',
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
    glyph: 'M4 21h22v5H4z M10 18 21.4 7.6 M23.6 5.4a2.7 2.7 0 100 5.4 2.7 2.7 0 100-5.4 M8 26v3 M22 26v3',
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
    glyph: 'M6 10h22 M3 16h28 M8 22h18 M12 28h10',
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
    glyph: 'M9 9h16l3 18H6z M6 15h22 M11 9 9.6 27 M23 9l1.4 18',
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
    glyph: 'M4 26 11 11v15l7-15v15l7-15v15 M4 30h26',
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

