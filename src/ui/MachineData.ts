export const A = (d: string, w?: number, c?: string, s?: string | number) => ({
  d: d, w: w || 1.5, c: c || 'square', s: s || 'none', j: c === 'round' ? 'round' : 'miter'
});

export interface Machine {
  id: string;
  name: string;
  icon: any[];
  mods: [string, string, (v: number) => any[]][];
  presets: [string, number[]][];
}

export const MACHINES: Machine[] = [
  {
    id: 'ep', name: 'Electric Piano', icon: [
      A('M4 14h16v6H4z'), A('M9 14v6'), A('M15 14v6'), 
      A('M12 5h0', 2.5, 'square', 0)
    ],
    mods: [
      ['TINE\nMATERIAL', 'Rungs lengthen — the bar rings wider and glassier.', (v: number) => {
        const r = Math.round(v * 4);
        return [
          A('M12 4v16'), 
          A(`M${8-r} 8h${8+r*2}`, 1.5), 
          A(`M${8-r} 12h${8+r*2}`, 1.5), 
          A(`M${8-r} 16h${8+r*2}`, 1.5)
        ];
      }],
      ['STRIKE\nFORCE', 'The hammer falls from higher and lands harder.', (v: number) => {
        const h = Math.round(v * 8);
        return [
          A(`M12 4v${8+h}`, 1.5), 
          A(`M10 ${12+h}h4`, 1.5),
          A('M4 20h16'), 
          ...(v > 0.5 ? [A(`M${6-Math.round((v-0.5)*4)} 17 5 15M${18+Math.round((v-0.5)*4)} 17 19 15`, 1.5)] : [])
        ];
      }],
      ['BARK', 'Sharp bite on the peak: fast attack, slow release.', (v: number) => {
        const peak = Math.round(v * 8);
        return [A(`M4 20v-4h4v-${4+peak}h4v${4+peak}h4v4`, 1.5)];
      }],
      ['TREMOLO\nDEPTH', 'The rails move apart as the wave swells between them.', (v: number) => {
        const spread = Math.round(v * 4);
        const amp = Math.round(v * 6);
        return [
          A(`M4 ${8-spread}h16`, 1.5, 'square', '2 2'), 
          A(`M4 ${16+spread}h16`, 1.5, 'square', '2 2'),
          A(`M6 12v-${amp}h6v${amp*2}h6v-${amp}`, 1.5)
        ];
      }]
    ],
    presets: [['Classic MK1', [62, 74, 38, 46]], ['Glassy Rhodes', [88, 40, 12, 58]], ['Dirty Wurli', [44, 86, 72, 30]]]
  },

  {
    id: 'sb', name: 'Sub Bass', icon: [
      A('M12 12h0', 4, 'square', 0), A('M8 8h8v8H8z'), A('M4 4h16v16H4z')
    ],
    mods: [
      ['SUB\nWEIGHT', 'The stack sinks and the bottom line thickens.', (v: number) => {
        const t = Math.round(v * 4);
        return [
          A('M6 6h12', 1.5), 
          A('M6 12h12', 1.5 + t*0.5), 
          A('M6 18h12', 1.5 + t)
        ];
      }],
      ['PITCH\nSNAP', 'The dot drops in from further out and snaps to the step.', (v: number) => {
        const snap = Math.round(v * 6);
        return [
          A(`M4 ${12-snap}h4v${snap}h12`), 
          A('M10 12h4', 2.5)
        ];
      }],
      ['TOP-END\nGROWL', 'The teeth grind sideways — faster and further as it opens up.', (v: number) => {
        const amp = Math.round(v * 6);
        return [
          A('M4 18h16', 1.5), 
          A(`M4 12v-${amp}h3v${amp*2}h3v-${amp*2}h3v${amp*2}h3v-${amp*2}h3v${amp}`, 1.5)
        ];
      }],
      ['BOOM', 'Each hit thumps the core and pushes a ring out.', (v: number) => {
        const ring = Math.round(v * 6);
        return [
          A('M12 12h0', 4), 
          A(`M${8-ring/2} ${8-ring/2}h${8+ring}v${8+ring}H${8-ring/2}z`, 1.5),
          A(`M${4-ring} ${4-ring}h${16+ring*2}v${16+ring*2}H${4-ring}z`, 1.5)
        ];
      }]
    ],
    presets: [['Deep Sub', [85, 10, 15, 60]], ['Grime Reese', [70, 0, 85, 40]], ['Classic 808', [100, 80, 0, 95]]]
  },

  {
    id: 'ml', name: 'Mallet', icon: [
      A('M4 20h16'), A('M9 9 15 15'), A('M6 18 9 15'), A('M16 8h0', 4, 'square', 0)
    ],
    mods: [
      ['HARMONIC\nFOCUS', 'The ring tightens onto the core — energy converging.', (v: number) => {
        const focus = Math.round((1 - v) * 6);
        return [
          A(`M${8-focus} ${8-focus}h${8+focus*2}v${8+focus*2}H${8-focus}z`, 1.5),
          A('M12 4v4M12 16v4M4 12h4M16 12h4'), 
          A('M12 12h0', 4)
        ];
      }],
      ['DAMPENING', 'Bars collapse in sequence, left to right, then recover.', (v: number) => {
        const damp = Math.round(v * 8);
        return [
          A(`M4 20V${6+damp}`, 2), 
          A(`M9 20V${9+damp*0.8}`, 2),
          A(`M14 20V${12+damp*0.5}`, 2), 
          A(`M19 20V${15+damp*0.2}`, 2)
        ];
      }],
      ['IMPACT\nNOISE', 'One burst at the hit, then scatter — never a steady flicker.', (v: number) => {
        const s = Math.round(v * 5);
        return [
          A(`M${4-s} ${6-s}h2M${4-s} ${12}h2M${4-s} ${18+s}h2`, 2),
          A(`M${8-Math.floor(s*0.5)} ${9-Math.floor(s*0.8)}h2M${8-Math.floor(s*0.5)} ${15+Math.floor(s*0.8)}h2`, 2),
          A(`M${12} ${6-s}h2M${12} ${12}h2`, 2),
          A(`M${16+Math.floor(s*0.5)} ${16+Math.floor(s*0.5)}h2`, 2),
          A(`M${20+s} ${10-Math.floor(s*0.5)}h2`, 2)
        ];
      }]
    ],
    presets: [['WOOD', [44, 70, 13]], ['GLASS BELL', [72, 30, 8]], ['BONE', [30, 88, 40]]]
  },

  {
    id: 'pd', name: 'Pad', icon: [
      A('M6 6h12v4H6z'), A('M8 10h8v4H8z'), A('M10 14h4v4h-4z', 1.5, 'square', 0)
    ],
    mods: [
      ['WASH', 'Layers glide across each other at different speeds.', (v: number) => {
        const w1 = Math.round(v * 6);
        const w2 = Math.round(v * 4);
        return [
          A(`M${4-w1} 8h16`, 1.5, 'square', '4 4'), 
          A(`M${4+w2} 12h16`, 1.5, 'square', '2 6'),
          A(`M${4-w2} 16h16`, 1.5, 'square', '6 2')
        ];
      }],
      ['SHIMMER', 'Sparkles swell and fade out of phase with each other.', (v: number) => {
        const s1 = Math.round(v * 4);
        const s2 = Math.round(v * 2);
        return [
          A(`M8 ${4-s1}v${6+s1*2}M${5-s1} 7h${6+s1*2}`, 1.5), 
          A(`M16 ${10-s2}v${6+s2*2}M${13-s2} 13h${6+s2*2}`, 1.5),
          A(`M8 ${16-s1}v${4+s1*2}M${6-s1} 18h${4+s1*2}`, 1.5)
        ];
      }],
      ['CHORUS', 'Two copies drift in opposite directions — detuning made visible.', (v: number) => {
        const drift = Math.round(v * 6);
        return [
          A(`M${4-drift} 10h4v-4h8v4h4`, 1.5), 
          A(`M${4+drift} 16h4v4h8v-4h4`, 1.5)
        ];
      }],
      ['HOLLOW', 'The core shrinks and dissolves; the shell stays put.', (v: number) => {
        const shrink = Math.round(v * 4);
        return [
          A('M4 4h16v16H4z', 1.5),
          A(`M${8+shrink} ${8+shrink}h${Math.max(0, 8-shrink*2)}v${Math.max(0, 8-shrink*2)}H${8+shrink}z`, 1.5, 'square', '2 2')
        ];
      }]
    ],
    presets: [['DRIFT', [58, 34, 51, 22]], ['CHOIR', [70, 60, 66, 14]], ['VOID', [40, 20, 30, 80]]]
  },

  {
    id: 'dg', name: 'Digital Glitch', icon: [
      A('M4 6h2M10 6h2M18 6h2', 2, 'square'), A('M6 12h2M12 12h2M16 12h2', 2, 'square', 0), A('M4 18h2M14 18h2M18 18h2', 2, 'square')
    ],
    mods: [
      ['DIGITAL\nDIRT', 'Rows drop out at random — a steady, mechanical corruption.', (v: number) => {
        const pts = [
          [4,5], [8,5], [14,5],
          [6,9], [10,9], [18,9],
          [4,13], [12,13], [16,13],
          [8,17], [14,17], [18,17],
          [6,21], [12,21], [16,21]
        ];
        const keep = Math.floor((1 - v) * pts.length);
        const active = pts.slice(0, Math.max(2, keep));
        return [A(active.map(p => `M${p[0]} ${p[1]}h2`).join(''), 2)];
      }],
      ['LASER\nZAP', 'The beam fires further down the diagonal each cycle.', (v: number) => {
        const fire = Math.round(v * 16);
        return [
          A(`M20 4 ${20-fire} ${4+fire}`, 1.5, 'square', '2 4'), 
          A('M8 10v6h6'),
          ...(v > 0.8 ? [A('M4 20 6 18', 1.5)] : [])
        ];
      }],
      ['PULSE\nWIDTH', 'The duty cycle narrows and opens — the wave itself squeezing.', (v: number) => {
        const squeeze = Math.round(v * 4);
        return [
          A(`M4 16v-8h${4-squeeze}v8h${6+squeeze*2}v-8h${6-squeeze}`, 1.5)
        ];
      }]
    ],
    presets: [['SHRED', [88, 63, 41]], ['BITCRUSH', [96, 30, 70]], ['ZAP', [40, 92, 25]]]
  },

  {
    id: 'vl', name: 'Vintage Lead', icon: [
      A('M3 18v-4h3v-4h3v-4h3v12', 1.5, 'square', 0), A('M12 18v-4h3v-4h3v-4h3v12', 1.5, 'square', 0)
    ],
    mods: [
      ['TIMBRE', 'Waveforms hand over one to the next — sine, triangle, square.', (v: number) => {
        const h = Math.round(v * 4);
        return [
          A(`M4 12v-6h${h}l${4-h} 12h${h}l${4-h} -12h${h}v6`, 1.5)
        ];
      }],
      ['FILTER\nCUTOFF', 'The cut sweeps back and forth across the curve.', (v: number) => {
        const cut = Math.round(v * 16);
        return [
          A(`M4 10h4v4h4v4h${8 - Math.max(0, cut-8)}`), 
          A(`M${4+cut} 4v16`, 1.5, 'square', '2 2')
        ];
      }],
      ['FILTER\nENVELOPE', 'The peak jumps on attack and settles back down.', (v: number) => {
        const env = Math.round(v * 10);
        return [
          A(`M4 20v-${env}h4v${Math.round(env*0.6)}h4v${Math.round(env*0.4)}h8`, 1.5)
        ];
      }],
      ['ANALOG\nSLOP', 'Lazy, irregular wander — drift plus a slight tilt, never on the grid.', (v: number) => {
        const slop = Math.round(v * 4);
        return [
          A('M4 16h16', 1.5, 'square', '2 2'),
          A(`M4 10h${4-slop}v-2h4v4h${4+slop}v-2h4`, 1.5)
        ];
      }]
    ],
    presets: [['Classic Saw', [50, 70, 20, 20]], ['Hollow Square', [100, 60, 15, 30]], ['Drifting VCO', [30, 60, 40, 85]]]
  }
];

export const FM_NAMES = ['ALGO', 'RATIO', 'FBK', 'MOD A', 'MOD B'];
