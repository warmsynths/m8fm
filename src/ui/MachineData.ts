export const A = (d: string, w?: number, c?: string, s?: string | number, anim?: string, dl?: string | number, ease?: string) => ({
  d: d, w: w || 1.6, c: c || 'round', s: s || 'none',
  style: anim ? 'animation:' + anim + ' var(--dur) ' + (ease || 'ease-in-out') + ' infinite ' + (dl === 0 ? '0s' : (dl || '0s')) : ''
});

export interface Machine {
  id: string;
  name: string;
  icon: any[];
  mods: [string, string, any[]][];
  presets: [string, number[]][];
}

export const MACHINES: Machine[] = [
  {
    id: 'ep', name: 'Electric Piano', icon: [A('M5 20h14'), A('M10 20V6'), A('M14 20V10'), A('M10 3.6h0', 3.6, 'round', 0, 'k-idle')],
    mods: [
      ['TINE\nMATERIAL', 'Rungs lengthen — the bar rings wider and glassier.', [
        A('M12 3v18'), A('M7.5 8h9', 1.6, 'round', 0, 'k-tine'), A('M7.5 12h9', 1.6, 'round', 0, 'k-tine', '.18s'), A('M7.5 16h9', 1.6, 'round', 0, 'k-tine', '.36s')]],
      ['STRIKE\nFORCE', 'The hammer falls from higher and lands harder.', [
        A('M12 3v10.5', 1.6, 'round', 0, 'k-strike', 0, 'ease-in'), A('M8.6 10.2 12 13.6l3.4-3.4', 1.6, 'round', 0, 'k-strike', 0, 'ease-in'),
        A('M4 19.5h16'), A('M6.6 16.4 5 14.8M17.4 16.4 19 14.8', 1.6, 'round', 0, 'k-spark', 0, 'steps(1,end)')]],
      ['BARK', 'Sharp bite on the peak: fast attack, slow release.', [
        A('M2.5 18h3.6L9 5l2.6 13L14 9.5l2 8.5h5.5', 1.6, 'round', 0, 'k-bark', 0, 'ease-out')]],
      ['TREMOLO\nDEPTH', 'The rails move apart as the wave swells between them.', [
        A('M2.5 6.5h19', 1.6, 'round', '2 2.6', 'k-rail'), A('M2.5 17.5h19', 1.6, 'round', '2 2.6', 'k-railb'),
        A('M2.5 12q2.4-7 4.75 0T12 12t4.75 0T21.5 12', 1.6, 'butt', 0, 'k-trem')]]
    ],
    presets: [['Classic MK1', [62, 74, 38, 46]], ['Glassy Rhodes', [88, 40, 12, 58]], ['Dirty Wurli', [44, 86, 72, 30]]]
  },

  {
    id: 'sb', name: 'Sub Bass', icon: [A('M12 12h0', 6, 'round', 0, 'k-idle'), A('M7.2 8.2a6.4 6.4 0 000 7.6'), A('M16.8 8.2a6.4 6.4 0 010 7.6'), A('M3.8 5.4a11 11 0 000 13.2'), A('M20.2 5.4a11 11 0 010 13.2')],
    mods: [
      ['SUB\nWEIGHT', 'The stack sinks and the bottom line thickens.', [
        A('M4.5 6.5h15', 1.2, 'round', 0, 'k-weight'), A('M4.5 12h15', 2.4, 'round', 0, 'k-weight', '.12s'), A('M4.5 18h15', 4, 'round', 0, 'k-weight', '.24s')]],
      ['PITCH\nSNAP', 'The dot drops in from further out and snaps to the step.', [
        A('M2.5 5.5h4.6l3.4 12.5h11'), A('M10.5 18h0', 3.4, 'round', 0, 'k-snap', 0, 'ease-out')]],
      ['TOP-END\nGROWL', 'The teeth grind sideways — faster and further as it opens up.', [
        A('M2.5 17.5h19', 1.5), A('M3.4 11.5 4.9 6.5 6.4 11.5 7.9 6.5 9.4 11.5 10.9 6.5 12.4 11.5 13.9 6.5 15.4 11.5 16.9 6.5 18.4 11.5 19.9 6.5', 1.5, 'round', 0, 'k-growl', 0, 'linear')]],
      ['BOOM', 'Each hit thumps the core and pushes a ring out.', [
        A('M12 19.5h0', 3.8, 'round', 0, 'k-thump', 0, 'ease-out'), A('M6.2 19.5a5.8 5.8 0 0111.6 0', 1.6, 'butt', 0, 'k-ring', 0, 'ease-out'),
        A('M2.4 19.5a9.6 9.6 0 0119.2 0', 1.6, 'butt', 0, 'k-ring', '.7s', 'ease-out')]]
    ],
    presets: [['Deep Sub', [85, 10, 15, 60]], ['Grime Reese', [70, 0, 85, 40]], ['Classic 808', [100, 80, 0, 95]]]
  },

  {
    id: 'ml', name: 'Mallet', icon: [A('M4 20h16'), A('M7.5 4.5 13.6 12.4'), A('M5.5 15.5 3.6 17.4'), A('M8.6 17.6 7.4 19.4'), A('M15.6 14.6h0', 5.8, 'round', 0, 'k-idle')],
    mods: [
      ['HARMONIC\nFOCUS', 'The ring tightens onto the core — energy converging.', [
        A('M12 5.8a6.2 6.2 0 010 12.4 6.2 6.2 0 010-12.4', 1.6, 'butt', 0, 'k-focus'),
        A('M12 2v3.2M12 18.8V22M2 12h3.2M18.8 12H22'), A('M12 12h0', 3.8, 'round', 0, 'k-core')]],
      ['DAMPENING', 'Bars collapse in sequence, left to right, then recover.', [
        A('M4 20V5', 1.8, 'round', 0, 'k-damp', 0, 'ease-out'), A('M8.8 20v-8.5', 1.8, 'round', 0, 'k-damp', '.13s', 'ease-out'),
        A('M13.6 20v-5.4', 1.8, 'round', 0, 'k-damp', '.26s', 'ease-out'), A('M18.4 20v-2.8', 1.8, 'round', 0, 'k-damp', '.39s', 'ease-out')]],
      ['IMPACT\nNOISE', 'One burst at the hit, then scatter — never a steady flicker.', [
        A('M3 6h2M3 12h2M3 18h2', 2, 'butt', 0, 'k-burst', 0, 'steps(1,end)'),
        A('M6.4 9h2M6.4 15h2', 2, 'butt', 0, 'k-burst', '.06s', 'steps(1,end)'),
        A('M9.8 6h2M9.8 12h2', 2, 'butt', 0, 'k-burst', '.12s', 'steps(1,end)'),
        A('M13.2 16.5h2', 2, 'butt', 0, 'k-burst', '.19s', 'steps(1,end)'),
        A('M16.6 10h2', 2, 'butt', 0, 'k-burst', '.26s', 'steps(1,end)')]]
    ],
    presets: [['WOOD', [44, 70, 13]], ['GLASS BELL', [72, 30, 8]], ['BONE', [30, 88, 40]]]
  },

  {
    id: 'pd', name: 'Pad', icon: [A('M7 4.5h10a3 3 0 013 3v3'), A('M6 8h11a2.5 2.5 0 012.5 2.5v6a2.5 2.5 0 01-2.5 2.5H6a2.5 2.5 0 01-2.5-2.5v-6A2.5 2.5 0 016 8z'), A('M6 14.2q2.6-2.6 5.2 0t5.2 0', 1.4, 'round', 0, 'k-idle')],
    mods: [
      ['WASH', 'Layers glide across each other at different speeds.', [
        A('M2.5 7q3-3.6 6 0t6 0 6 0', 1.5, 'round', 0, 'k-wash'), A('M2.5 12q3-3.6 6 0t6 0 6 0', 1.5, 'round', 0, 'k-washb', '.4s'),
        A('M2.5 17q3-3.6 6 0t6 0 6 0', 1.5, 'round', 0, 'k-wash', '.9s')]],
      ['SHIMMER', 'Sparkles swell and fade out of phase with each other.', [
        A('M8 3.5v7M4.5 7h7', 1.6, 'round', 0, 'k-shimmer'), A('M17 11v6M14 14h6', 1.6, 'round', 0, 'k-shimmer', '.55s'),
        A('M7.5 16.5v3.4M5.8 18.2h3.4', 1.6, 'round', 0, 'k-shimmer', '1.1s')]],
      ['CHORUS', 'Two copies drift in opposite directions — detuning made visible.', [
        A('M2.5 9.5q2.9-6 5.75 0T14 9.5t5.75 0', 1.6, 'round', 0, 'k-wash'), A('M4.2 16.5q2.9-6 5.75 0T15.7 16.5t5.75 0', 1.6, 'round', 0, 'k-washb')]],
      ['HOLLOW', 'The core shrinks and dissolves; the shell stays put.', [
        A('M12 3.4a8.6 8.6 0 010 17.2 8.6 8.6 0 010-17.2', 1.6, 'butt'),
        A('M12 8.4a3.6 3.6 0 010 7.2 3.6 3.6 0 010-7.2', 1.6, 'butt', '2 2.8', 'k-hollow')]]
    ],
    presets: [['DRIFT', [58, 34, 51, 22]], ['CHOIR', [70, 60, 66, 14]], ['VOID', [40, 20, 30, 80]]]
  },

  {
    id: 'dg', name: 'Digital Glitch', icon: [A('M3.2 5.1h2.4M8.2 5.1h2.4M18.2 5.1h2.4', 2.2, 'butt'), A('M5.6 10.1h2.4M10.6 10.1h2.4M15.6 10.1h2.4', 2.2, 'butt', 0, 'k-idle'), A('M3.2 15.1h2.4M13.2 15.1h2.4M18.2 15.1h2.4', 2.2, 'butt'), A('M7.2 19.7h2.4M12.2 19.7h2.4', 2.2, 'butt')],
    mods: [
      ['DIGITAL\nDIRT', 'Rows drop out at random — a steady, mechanical corruption.', [
        A('M3 4.9h1.8M7.4 4.9h1.8M14 4.9h1.8', 1.8, 'butt', 0, 'k-dirt', 0, 'steps(1,end)'),
        A('M5.2 8.5h1.8M9.6 8.5h1.8M18.4 8.5h1.8', 1.8, 'butt', 0, 'k-dirt', '.16s', 'steps(1,end)'),
        A('M3 12.1h1.8M11.8 12.1h1.8M16.2 12.1h1.8', 1.8, 'butt', 0, 'k-dirt', '.34s', 'steps(1,end)'),
        A('M7.4 15.7h1.8M14 15.7h1.8M18.4 15.7h1.8', 1.8, 'butt', 0, 'k-dirt', '.52s', 'steps(1,end)'),
        A('M5.2 19.3h1.8M11.8 19.3h1.8M16.2 19.3h1.8', 1.8, 'butt', 0, 'k-dirt', '.7s', 'steps(1,end)')]],
      ['LASER\nZAP', 'The beam fires further down the diagonal each cycle.', [
        A('M20.5 3.5 8 16', 1.6, 'round', '26', 'k-beam', 0, 'ease-in'), A('M8 10.2V16h5.8'),
        A('M4.2 19.8 5.6 18.4', 1.6, 'round', 0, 'k-spark', 0, 'steps(1,end)')]],
      ['PULSE\nWIDTH', 'The duty cycle narrows and opens — the wave itself squeezing.', [
        A('M2.5 17h4V7h3v10h4.5V7h3v10h4', 1.6, 'round', 0, 'k-duty')]]
    ],
    presets: [['SHRED', [88, 63, 41]], ['BITCRUSH', [96, 30, 70]], ['ZAP', [40, 92, 25]]]
  },

  {
    id: 'vl', name: 'Vintage Lead', icon: [A('M2.5 18 7 6.5V18l4.5-11.5V18L16 6.5V18l4.5-11.5', 1.6, 'butt', 0, 'k-idle')],
    mods: [
      ['TIMBRE', 'Waveforms hand over one to the next — sine, triangle, square.', [
        A('M2.5 6q2.4-4.5 4.8 0T12.1 6', 1.5, 'round', 0, 'k-morph'),
        A('M2.5 13.5 5 10l2.4 3.5L9.8 10l2.3 3.5', 1.5, 'round', 0, 'k-morph', '1.1s'),
        A('M2.5 20.5h2.4v-3.4h2.4v3.4h2.4v-3.4h2.4', 1.5, 'round', 0, 'k-morph', '2.2s'),
        A('M16.5 5.5v13', 1.5, 'round', '2 2.6'), A('M19.4 5.5v13', 1.5, 'round', '2 2.6')]],
      ['FILTER\nCUTOFF', 'The cut sweeps back and forth across the curve.', [
        A('M2.5 8h9.5c2.6 0 3.4 2.6 8 11'), A('M12 3.5v17', 1.6, 'round', '2 2.6', 'k-sweep')]],
      ['FILTER\nENVELOPE', 'The peak jumps on attack and settles back down.', [
        A('M2.5 20 6.6 5l2.6 7.4h5.4L20.5 20', 1.6, 'round', 0, 'k-fenv', 0, 'ease-out')]],
      ['ANALOG\nSLOP', 'Lazy, irregular wander — drift plus a slight tilt, never on the grid.', [
        A('M2.5 16.5h19', 1.6, 'round', '2 2.6'),
        A('M2.5 9.5q1.6 3.4 3.2 0 1.7-4 3.4 0t3.3.4q1.7-3.4 3.4 0t3.7-.8', 1.6, 'round', 0, 'k-slop')]]
    ],
    presets: [['Classic Saw', [50, 70, 20, 20]], ['Acid Sweep', [80, 40, 90, 10]], ['Drifting VCO', [30, 60, 40, 85]]]
  }
];

export const FM_NAMES = ['ALGO', 'RATIO', 'FBK', 'MOD A', 'MOD B'];
