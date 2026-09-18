import { LitElement, html, svg, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import './style.css';
import { AudioController } from './audio/AudioController';
import type { AnchorName } from './audio/MacroMapper';

const audio = new AudioController();
(window as any).audio = audio;

export interface PresetVals {
  ratio: number;
  bend: number;
  time: number;
  fbk: number;
  noise: number;
  atk: number;
  rel: number;
  mod: number;
}

export interface MachineDef {
  id: string;
  name: string;
  algo: string;
  glyph: string;
  presets: [string, PresetVals][];
}

const MACHINES: MachineDef[] = [
  {
    id: 'ep',
    name: 'ELECTRIC\nPIANO',
    algo: 'A>B+C>D',
    glyph: 'M4 14h26v14H4z M12.6 14v9 M21.2 14v9 M4 23h26 M7 9.5c6-4.5 14-4.5 20 0 M17 5.6h.1',
    presets: [
      ['MK1', { ratio: 2, bend: 0.46, time: 0.52, fbk: 18, noise: 5, atk: 0.07, rel: 0.74, mod: 38 }],
      ['GLASS', { ratio: 4, bend: 0.3, time: 0.68, fbk: 8, noise: 2, atk: 0.05, rel: 0.62, mod: 26 }],
      ['DIRT WURLI', { ratio: 1.5, bend: 0.68, time: 0.34, fbk: 44, noise: 18, atk: 0.09, rel: 0.85, mod: 58 }]
    ]
  },
  {
    id: 'sb',
    name: 'SUB\nBASS',
    algo: 'A>B>C>D',
    glyph: 'M2 27h30 M6 27a11 11 0 0122 0 M11 27a6 6 0 0112 0 M17 24.4h.1',
    presets: [
      ['DEEP', { ratio: 0.5, bend: 0.78, time: 0.6, fbk: 26, noise: 0, atk: 0.1, rel: 0.96, mod: 54 }],
      ['REESE', { ratio: 1, bend: 0.58, time: 0.72, fbk: 48, noise: 4, atk: 0.14, rel: 0.9, mod: 66 }],
      ['808', { ratio: 0.5, bend: 0.9, time: 0.3, fbk: 12, noise: 2, atk: 0.05, rel: 1, mod: 72 }]
    ]
  },
  {
    id: 'ml',
    name: 'MALLET',
    algo: 'A+B>C>D',
    glyph: 'M4 21h22v5H4z M10 18 21.4 7.6 M23.6 5.4a2.7 2.7 0 100 5.4 2.7 2.7 0 100-5.4 M8 26v3 M22 26v3',
    presets: [
      ['WOOD', { ratio: 3, bend: 0.72, time: 0.26, fbk: 10, noise: 14, atk: 0.05, rel: 0.7, mod: 44 }],
      ['GLASS BELL', { ratio: 7, bend: 0.34, time: 0.7, fbk: 6, noise: 4, atk: 0.05, rel: 0.6, mod: 30 }],
      ['BONE', { ratio: 2.5, bend: 0.86, time: 0.2, fbk: 34, noise: 24, atk: 0.05, rel: 0.78, mod: 50 }]
    ]
  },
  {
    id: 'pd',
    name: 'PAD',
    algo: '(A+B)>(C+D)',
    glyph: 'M6 10h22 M3 16h28 M8 22h18 M12 28h10',
    presets: [
      ['DRIFT', { ratio: 1.5, bend: 0.22, time: 0.86, fbk: 14, noise: 6, atk: 0.42, rel: 0.5, mod: 24 }],
      ['CHOIR', { ratio: 2, bend: 0.18, time: 0.9, fbk: 8, noise: 2, atk: 0.56, rel: 0.44, mod: 18 }],
      ['VOID', { ratio: 6, bend: 0.26, time: 0.8, fbk: 40, noise: 12, atk: 0.34, rel: 0.56, mod: 46 }]
    ]
  },
  {
    id: 'pc',
    name: 'PERCUSSION',
    algo: 'A>B+C>D',
    glyph: 'M9 9h16l3 18H6z M6 15h22 M11 9 9.6 27 M23 9l1.4 18',
    presets: [
      ['KICK', { ratio: 0.5, bend: 0.92, time: 0.18, fbk: 22, noise: 8, atk: 0.05, rel: 1, mod: 78 }],
      ['SNARE', { ratio: 2.5, bend: 0.8, time: 0.24, fbk: 30, noise: 52, atk: 0.05, rel: 0.82, mod: 48 }],
      ['CLOSED HAT', { ratio: 8, bend: 0.94, time: 0.14, fbk: 16, noise: 74, atk: 0.05, rel: 0.55, mod: 34 }],
      ['OPEN HAT', { ratio: 8, bend: 0.5, time: 0.5, fbk: 20, noise: 68, atk: 0.05, rel: 0.6, mod: 38 }]
    ]
  },
  {
    id: 'vl',
    name: 'VINTAGE\nLEAD',
    algo: 'A>B+C+D',
    glyph: 'M4 26 11 11v15l7-15v15l7-15v15 M4 30h26',
    presets: [
      ['VOLT', { ratio: 2, bend: 0.5, time: 0.46, fbk: 32, noise: 6, atk: 0.1, rel: 0.7, mod: 52 }],
      ['ACID', { ratio: 1, bend: 0.62, time: 0.36, fbk: 62, noise: 10, atk: 0.06, rel: 0.8, mod: 82 }],
      ['DRUNK', { ratio: 1.5, bend: 0.4, time: 0.62, fbk: 24, noise: 20, atk: 0.2, rel: 0.52, mod: 40 }]
    ]
  }
];

const PSET_ICONS: Record<string, string> = {
  'MK1': 'M6 3.2v7.6 M14 3.2v7.6 M6 10.8h8 M10 10.8v6',
  'GLASS': 'M10 2.4 17.6 10 10 17.6 2.4 10z M10 6.6 13.4 10 10 13.4 6.6 10z',
  'DIRT WURLI': 'M3 10a7 7 0 1114 0 7 7 0 01-14 0 M6 11.4l2-3 2 3 2-3 2 3',
  'DEEP': 'M10 3v9.2 M6.4 8.8 10 12.4 13.6 8.8 M3 16.4h14',
  'REESE': 'M2.6 7.4c2.2 0 2.2-3.2 4.4-3.2s2.2 3.2 4.4 3.2 2.2-3.2 4.4-3.2 M2.6 15.2c2.6 0 2.6-3.4 5.2-3.4s2.6 3.4 5.2 3.4',
  '808': 'M10 3.2a3 3 0 100 6 3 3 0 100-6 M10 9.2a3.9 3.9 0 100 7.8 3.9 3.9 0 100-7.8',
  'WOOD': 'M10 4c3.4 0 6 2.7 6 6s-2.6 6-6 6-6-2.7-6-6 2.6-6 6-6 M10 7.4c1.6 0 2.8 1.2 2.8 2.6s-1.2 2.6-2.8 2.6-2.8-1.2-2.8-2.6 1.2-2.6 2.8-2.6',
  'GLASS BELL': 'M5.6 13.6c0-5.2 1-8.8 4.4-8.8s4.4 3.6 4.4 8.8z M4.4 13.6h11.2 M10 16h.1',
  'BONE': 'M5 8.2a2.4 2.4 0 100 4.8 2.4 2.4 0 100-4.8 M15 8.2a2.4 2.4 0 100 4.8 2.4 2.4 0 100-4.8 M7.4 10.6h5.2',
  'DRIFT': 'M2.6 6.4h10 M6.4 10h11 M2.6 13.6h9',
  'CHOIR': 'M2.8 12.6a7.2 7.2 0 0114.4 0 M5.6 15.6a4.4 4.4 0 018.8 0 M8.6 8.6a1.4 1.4 0 012.8 0',
  'VOID': 'M13.6 3.9a7.4 7.4 0 11-7.2 0',
  'KICK': 'M10 5.8a5.6 5.6 0 100 11.2 5.6 5.6 0 100-11.2 M10 2.2v2.2 M4.8 4.2l1.5 1.6 M15.2 4.2l-1.5 1.6',
  'SNARE': 'M3.6 6.4h12.8v7.2H3.6z M4.8 7.8 15.2 12.2 M4.8 12.2 15.2 7.8',
  'CLOSED HAT': 'M3.6 9.2h12.8 M3.6 11.6h12.8 M10 5.2v2.4',
  'OPEN HAT': 'M3.6 7h12.8 M3.6 13.4h12.8 M10 3.4v2 M5.8 10.2h2.4 M11.8 10.2h2.4',
  'VOLT': 'M11.4 2.6 6 10.8h3.6l-1 6.6 5.4-8.4h-3.6z',
  'ACID': 'M2.8 15.4c3.4 0 3-9.8 6.2-9.8s2.4 9.8 8.2 9.8',
  'DRUNK': 'M2.8 10c2.6-4.4 3.6 4.6 6-.6s2.8 5.4 8.4.2'
};

const SLOT_GLYPHS = [
  'M10 2.6a7.4 7.4 0 100 14.8 7.4 7.4 0 100-14.8 M10 7.2a2.8 2.8 0 100 5.6 2.8 2.8 0 100-5.6',
  'M2.6 7.4c2 0 2-3.4 4-3.4s2 3.4 4 3.4 2-3.4 4-3.4 2 3.4 2.8 3.4 M2.6 14c2 0 2-3.4 4-3.4s2 3.4 4 3.4 2-3.4 4-3.4 2 3.4 2.8 3.4',
  'M10 2 11.9 8.1 18 10l-6.1 1.9L10 18l-1.9-6.1L2 10l6.1-1.9z',
  'M3.4 3.4h5.2v5.2H3.4z M11.4 11.4h5.2v5.2h-5.2z M11.4 3.4h5.2v5.2h-5.2z'
];

const DETENTS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8];

export interface Palette {
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

const PALETTES: Palette[] = [
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

const EPS: Record<string, number> = {
  ratio: 0.002,
  bend: 0.0008,
  time: 0.0008,
  atk: 0.0008,
  rel: 0.0008,
  fbk: 0.03,
  noise: 0.03,
  mod: 0.03
};

@customElement('fm-studio')
export class FmStudio extends LitElement {
  createRenderRoot() {
    return this;
  }

  @state() accessor machine = 0;
  @state() accessor preset = 0;
  @state() accessor v: Partial<PresetVals> | null = null;
  @state() accessor palId = 'amber';
  @state() accessor spin = 0;
  @state() accessor burst = false;
  @state() accessor grab: string | null = null;
  @state() accessor view: 'desktop' | 'mobile' = 'desktop';

  private _disp: PresetVals | null = null;
  private _raf: number | null = null;
  private _last = 0;
  private _t1: any;
  private _t2: any;
  private _onResize?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.selectMachine(0);
    this._onResize = () => {
      this.view = window.innerWidth <= 640 ? 'mobile' : 'desktop';
    };
    window.addEventListener('resize', this._onResize);
    this._onResize();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._raf) cancelAnimationFrame(this._raf);
    clearTimeout(this._t1);
    clearTimeout(this._t2);
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
    }
  }

  clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
  }

  mach(): MachineDef {
    return MACHINES[this.machine];
  }

  pIdx(): number {
    const m = this.mach();
    return this.preset % m.presets.length;
  }

  vals(): PresetVals {
    const defaultVals = this.mach().presets[this.pIdx()][1];
    return Object.assign({}, defaultVals, this.v || {});
  }

  smooth(): PresetVals {
    const t = this.vals();
    if (!this._disp) this._disp = Object.assign({}, t);
    return this._disp;
  }

  _pump() {
    if (this._raf) return;
    this._last = 0;
    this._raf = requestAnimationFrame(ts => this._tick(ts));
  }

  _tick(ts: number) {
    this._raf = null;
    const dt = this.clamp(this._last ? ts - this._last : 16, 4, 64);
    this._last = ts;
    const t = this.vals();
    const d = this._disp;
    if (!d) return;

    const k = 1 - Math.exp(-dt / 78);
    let moving = false;
    for (const key in t) {
      const kTyped = key as keyof PresetVals;
      const gap = t[kTyped] - d[kTyped];
      if (Math.abs(gap) <= (EPS[key] || 0.001)) {
        d[kTyped] = t[kTyped];
      } else {
        d[kTyped] += gap * k;
        moving = true;
      }
    }
    this.requestUpdate();
    if (moving) {
      this._raf = requestAnimationFrame(s2 => this._tick(s2));
    }
  }

  pal(): Palette {
    return PALETTES.find(p => p.id === this.palId) || PALETTES.find(p => p.id === 'amber') || PALETTES[0];
  }

  nextPal(): Palette {
    const i = PALETTES.findIndex(t => t.id === this.pal().id);
    return PALETTES[(i + 1) % PALETTES.length];
  }

  cycleTheme = () => {
    if (this.burst) return;
    const nx = this.nextPal();
    this.spin += 180;
    this.burst = true;
    this._t1 = setTimeout(() => {
      this.palId = nx.id;
    }, 200);
    this._t2 = setTimeout(() => {
      this.burst = false;
    }, 700);
  };

  selectMachine(i: number) {
    this.machine = i;
    this.preset = 0;
    this.v = null;
    const m = MACHINES[i];
    audio.loadAnchor(this.getAnchorName(m.id));
    this.syncAudioParams();
    audio.triggerNote(60, 0.85, 320);
  }

  selectPreset(i: number) {
    this.preset = i;
    this.v = null;
    this.syncAudioParams();
    audio.triggerNote(60, 0.85, 320);
  }

  resetAll() {
    this.v = null;
    this.syncAudioParams();
    audio.triggerNote(60, 0.85, 320);
  }

  private getAnchorName(id: string): AnchorName {
    switch (id) {
      case 'ep': return 'Electric Piano';
      case 'sb': return 'Sub Bass';
      case 'ml': return 'Mallet';
      case 'pd': return 'Pad';
      case 'pc': return 'Percussion';
      case 'vl': return 'Vintage Lead';
      default: return 'Electric Piano';
    }
  }

  private syncAudioParams() {
    const v = this.vals();
    // Map the 6 universal parameters to the FM engine
    const m = this.mach();
    const anchor = this.getAnchorName(m.id);
    
    // Normalize macros per machine anchor
    audio.setMacro('Ratio', v.ratio / 8);
    audio.setMacro('Contour Time', v.time);
    audio.setMacro('Contour Bend', v.bend);
    audio.setMacro('Feedback', v.fbk / 100);
    audio.setMacro('Noise', v.noise / 100);
    audio.setMacro('Attack', v.atk);
    audio.setMacro('Release', v.rel);
    audio.setMacro('Mod Index', v.mod / 100);

    // Also map to machine-specific named anchors where applicable
    if (anchor === 'Electric Piano') {
      audio.setMacro('Tine Material', v.ratio / 8);
      audio.setMacro('Strike Force', v.bend);
      audio.setMacro('Bark', v.fbk / 100);
      audio.setMacro('Tremolo Depth', v.mod / 100);
    } else if (anchor === 'Sub Bass') {
      audio.setMacro('Sub Weight', v.rel);
      audio.setMacro('Pitch Snap', v.bend);
      audio.setMacro('Top-End Growl', v.fbk / 100);
      audio.setMacro('Boom', v.time);
    } else if (anchor === 'Mallet') {
      audio.setMacro('Harmonic Focus', v.ratio / 8);
      audio.setMacro('Dampening', 1 - v.rel);
      audio.setMacro('Impact Noise', v.noise / 100);
      audio.setMacro('Tail', v.time);
    } else if (anchor === 'Pad') {
      audio.setMacro('Wash', v.time);
      audio.setMacro('Shimmer', v.noise / 100);
      audio.setMacro('Chorus', v.mod / 100);
      audio.setMacro('Hollow', v.bend);
    } else if (anchor === 'Percussion') {
      audio.setMacro('Body', v.rel);
      audio.setMacro('Snap', v.bend);
      audio.setMacro('Noise', v.noise / 100);
      audio.setMacro('Decay', v.time);
    } else if (anchor === 'Vintage Lead') {
      audio.setMacro('Timbre', v.ratio / 8);
      audio.setMacro('Filter Cutoff', v.mod / 100);
      audio.setMacro('Filter Envelope', v.bend);
      audio.setMacro('Analog Slop', v.fbk / 100);
    }
  }

  positional(spec: {
    x?: { key: keyof PresetVals; lo?: number; hi?: number; steps?: number[] };
    y?: { key: keyof PresetVals; lo: number; hi: number };
  }) {
    return (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const r = target.getBoundingClientRect();
      const base = Object.assign({}, this.vals());
      this.grab = (spec.x || spec.y)!.key;

      const apply = (ev: PointerEvent) => {
        const patch: Partial<PresetVals> = {};
        if (spec.x) {
          const n = this.clamp((ev.clientX - r.left) / r.width, 0, 1);
          patch[spec.x.key] = spec.x.steps
            ? spec.x.steps[Math.round(n * (spec.x.steps.length - 1))]
            : spec.x.lo! + n * (spec.x.hi! - spec.x.lo!);
        }
        if (spec.y) {
          const n = this.clamp(1 - (ev.clientY - r.top) / r.height, 0, 1);
          patch[spec.y.key] = spec.y.lo + n * (spec.y.hi - spec.y.lo);
        }
        this.v = Object.assign({}, this.v || base, patch);
        this.syncAudioParams();
        this._pump();
      };

      apply(e);
      audio.triggerNote(60, 0.85, 300);

      const up = () => {
        this.grab = null;
        target.removeEventListener('pointermove', apply);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', up);
      };

      target.addEventListener('pointermove', apply);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', up);
    };
  }

  line(w: number, h: number, n: number, f: (t: number) => number): string {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = t * w;
      const y = h - this.clamp(f(t), 0, 1) * h;
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d;
  }

  exportM8() {
    const m = this.mach();
    audio.exportPatch(`${m.name.replace(/\n/g, '_')}_Patch.m8i`);
  }

  render() {
    const tgt = this.vals();
    const d = this.smooth();
    const W = 100;
    const H = 52;
    const P = this.pal();
    const mach = this.mach();

    for (const key in tgt) {
      const kTyped = key as keyof PresetVals;
      if (Math.abs(tgt[kTyped] - d[kTyped]) > (EPS[key] || 0.001)) {
        this._pump();
        break;
      }
    }

    const grab = this.grab;
    const hs = (n: string) => (grab === n ? 'scale(1.5)' : 'scale(1)');

    // Ratio scale
    const lastDet = DETENTS.length - 1;
    let di = 0;
    while (di < lastDet && DETENTS[di + 1] <= d.ratio) di++;
    const span = DETENTS[Math.min(di + 1, lastDet)] - DETENTS[di];
    const frac = span > 0 ? this.clamp((d.ratio - DETENTS[di]) / span, 0, 1) : 0;
    const rx = this.clamp((di + frac) / lastDet, 0, 1) * W;
    let ticks = '';
    DETENTS.forEach((_, i) => {
      ticks += 'M' + ((i / (DETENTS.length - 1)) * W).toFixed(1) + ' 24v8';
    });

    // Contour curve
    const cT = this.clamp(d.time, 0.06, 0.94);
    const cB = this.clamp(d.bend, 0.04, 0.96);
    const p = Math.log(cB) / Math.log(1 - cT);
    const contourCurve = this.line(W, H, 48, t => Math.pow(1 - this.clamp(t, 0, 0.999), p));

    // Noise field
    let noiseField = '';
    for (let i = 0; i < 26; i++) {
      const x = 2 + (i / 25) * (W - 4);
      const s = ((i * 7919) % 97) / 97;
      const h = 1.5 + s * (d.noise / 100) * 42;
      noiseField += 'M' + x.toFixed(1) + ' ' + (H / 2 - h / 2).toFixed(1) + 'v' + h.toFixed(1);
    }

    // Envelope curve
    const eA = this.clamp(d.atk, 0.05, 0.8);
    const eL = this.clamp(d.rel, 0.06, 1);
    const envCurve = this.line(W, H, 48, t =>
      t <= eA ? (t / eA) * eL : eL * Math.pow(1 - (t - eA) / (1 - eA), 2.2)
    );

    // Mod index stems
    let stems = '';
    for (let i = 0; i < 12; i++) {
      const fall = 1 / (1 + i * (1.6 - (d.mod / 100) * 1.5));
      stems += 'M' + (4 + i * 8) + ' ' + H + 'v-' + (3 + fall * (H - 7)).toFixed(1);
    }

    // Feedback
    const fbkY = (1 - d.fbk / 100) * H;

    // Mathematical waveform onset + decay slices
    const TAU = Math.PI * 2;
    const ampEnv = (t: number) =>
      t <= eA ? (t / eA) * eL : eL * Math.pow(1 - (t - eA) / (1 - eA), 2.2);
    const idxEnv = (t: number) => Math.pow(1 - this.clamp(t, 0, 0.999), p);
    const fb = d.fbk / 100;
    const grain = (t: number) => {
      const i = Math.floor(t * 220);
      return ((((i * 9301 + 49297) % 233280) / 233280) - 0.5) * (d.noise / 100) * 0.5;
    };
    const idxScale = (d.mod / 100) * 7;

    const local = (t: number, u: number, cyc: number) => {
      const ph = TAU * cyc * d.ratio * u;
      const m = Math.sin(ph + fb * 1.9 * Math.sin(ph));
      return Math.sin(TAU * cyc * u + idxScale * idxEnv(t) * m);
    };

    const ROWS = 11;
    let kOnset = '';
    let kRest = '';
    for (let j = 0; j < ROWS; j++) {
      const u0 = j / (ROWS - 1);
      const t = eA + u0 * (1 - eA);
      const y0 = 18 + u0 * 88;
      const life = j === 0 ? 1 : 0.22 + (0.78 * ampEnv(t)) / Math.max(0.08, eL);
      const amp = (j === 0 ? 14 : 8.6) * life;
      let seg = '';
      for (let i = 0; i <= 200; i++) {
        const u = i / 200;
        const y = y0 - amp * (local(t, u, 1.7) + grain(u) * 1.6);
        seg += (i ? 'L' : 'M') + (u * 640).toFixed(1) + ' ' + y.toFixed(1);
      }
      if (j === 0) kOnset = seg;
      else kRest += seg;
    }

    const pi = this.pIdx();
    const isMobile = this.view === 'mobile';

    const palVars = `--gnd:${P.gnd};--panel:${P.panel};--frame:${P.frame};--ink:${P.ink};--ink2:${P.ink2};--line:${P.line};--track:${P.track};--accent:${P.accent};`;
    const frameStyle = isMobile
      ? `width:100%;max-width:412px;margin:18px 0;background:${P.frame};border-radius:26px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 18px 44px rgba(0,0,0,.18);user-select:none;`
      : `width:100%;min-height:100vh;background:${P.frame};display:flex;flex-direction:column;user-select:none;`;
    const stripStyle = isMobile
      ? `display:flex;align-items:center;gap:8px;padding:18px 14px 14px;overflow-x:auto;-webkit-overflow-scrolling:touch;`
      : `display:flex;justify-content:center;align-items:center;gap:clamp(10px,3vw,34px);padding:clamp(18px,3vh,34px) 16px clamp(14px,2.4vh,26px);overflow-x:auto;`;

    const nextP = this.nextPal();

    return html`
      <div style="${palVars}">
        <div style="min-height:100vh;box-sizing:border-box;background:var(--gnd,#ecebe5);display:flex;flex-direction:column;align-items:center;padding:0;transition:background-color 200ms ease">
          
          <div style="${frameStyle}">

            <!-- Header: M8FM Brand & Theme Cycle Burst Button -->
            <div style="display:flex;align-items:center;gap:14px;padding:16px 20px 6px;flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:8px">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--accent,#2f49d8)" stroke-width="1.8" stroke-linecap="round">
                  <path d="M1 13c2.4 0 2.4-8 4.8-8s2.4 8 4.8 8 2.4-8 4.8-8"></path>
                </svg>
                <div style="font:700 12px 'JetBrains Mono',monospace;letter-spacing:.22em;color:var(--ink,#1b1e24)">M8FM</div>
              </div>
              <div style="flex:1;min-width:20px"></div>
              
              <div
                @click=${this.cycleTheme}
                title="${nextP.name}"
                style="cursor:pointer;width:26px;height:26px;border-radius:9px;display:flex;align-items:center;justify-content:center;overflow:hidden;opacity:.72;transition:opacity 150ms ease"
              >
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                  <defs>
                    <pattern id="om-dither" width="3" height="3" patternUnits="userSpaceOnUse">
                      <circle cx="1.5" cy="1.5" r=".85" fill="${nextP.accent}"></circle>
                    </pattern>
                  </defs>
                  ${this.burst ? svg`
                    <circle data-pip="1" cx="13" cy="13" r="0" fill="url(#om-dither)"></circle>
                    <circle data-pring="1" cx="13" cy="13" r="1" fill="none" stroke="${nextP.accent}" stroke-width="1.2"></circle>
                  ` : nothing}
                  <g style="transform:rotate(${this.spin}deg);transform-origin:13px 13px;transition:transform 640ms cubic-bezier(.2,.75,.2,1)">
                    <path d="M13 5.6a7.4 7.4 0 100 14.8 7.4 7.4 0 100-14.8" stroke="${nextP.accent}" stroke-width="1.6"></path>
                    <path d="M13 5.6a7.4 7.4 0 010 14.8z" fill="${nextP.accent}"></path>
                  </g>
                </svg>
              </div>
            </div>

            <!-- Machine Navigation Strip: 6 Machines Centered in Full Width -->
            <div data-mstrip="1" style="${stripStyle}">
              ${MACHINES.map((mDef, i) => {
                const on = i === this.machine;
                const box = isMobile ? '52px' : '54px';
                const ico = isMobile ? '28' : '30';
                return html`
                  <div
                    @click=${() => this.selectMachine(i)}
                    style="cursor:pointer;flex:0 0 auto;width:${box};height:${box};border-radius:11px;display:flex;align-items:center;justify-content:center;background:${on ? P.ink : 'transparent'};transition:background-color 180ms ease,transform 180ms ease;transform:${on ? 'translateY(-1px)' : 'none'}"
                    title="${mDef.name.replace('\n', ' ')}"
                  >
                    <svg width="${ico}" height="${ico}" viewBox="0 0 34 34" fill="none" stroke="${on ? P.frame : P.ink}" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round" style="opacity:${on ? '1' : '.72'}">
                      <path d="${mDef.glyph}"></path>
                    </svg>
                  </div>
                `;
              })}
            </div>

            <!-- Main Workspace -->
            <div style="flex:1;display:flex;flex-direction:column;padding:18px;gap:16px;min-height:0">
              
              <!-- Presets & Machine Title Bar -->
              <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
                <div style="display:flex;gap:6px">
                  ${mach.presets.map((pr, i) => {
                    const on = i === pi;
                    const iconPath = PSET_ICONS[pr[0]] || SLOT_GLYPHS[i % 4];
                    return html`
                      <div
                        @click=${() => this.selectPreset(i)}
                        style="cursor:pointer;width:30px;height:30px;border-radius:7px;background:${on ? P.accent : P.track};display:flex;align-items:center;justify-content:center;transition:background-color 150ms ease"
                        title="${pr[0]}"
                      >
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="${on ? P.panel : P.ink2}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                          <path d="${iconPath}"></path>
                        </svg>
                      </div>
                    `;
                  })}
                </div>
                <div style="font:600 26px/1 'Space Grotesk',sans-serif;letter-spacing:-.02em;color:var(--ink,#1b1e24)">${mach.name.replace('\n', ' ')}</div>
                <div style="font:500 10px 'JetBrains Mono',monospace;letter-spacing:.16em;color:var(--ink2,rgba(0,0,0,.72))">${(this.v ? '*' : '') + mach.presets[pi][0]}</div>
                <div style="flex:1;min-width:12px"></div>
              </div>

              <!-- Real-Time Onset & Decay Waveform Visualizer -->
              <div style="position:relative;border-radius:14px;background:var(--panel,#f3f2ee);padding:14px 0 10px">
                <svg viewBox="0 0 640 120" preserveAspectRatio="none" style="width:100%;height:clamp(104px,17vh,196px);overflow:visible">
                  <path d="${kRest}" stroke="var(--ink,#1b1e24)" stroke-width="1.5" fill="none" stroke-linejoin="round" opacity=".5"></path>
                  <path d="${kOnset}" stroke="var(--accent,#2f49d8)" stroke-width="2.2" fill="none" stroke-linejoin="round"></path>
                </svg>
                <div style="position:absolute;left:16px;bottom:6px;display:flex;align-items:center;gap:14px;font:500 8px 'JetBrains Mono',monospace;letter-spacing:.18em;color:var(--ink2,rgba(0,0,0,.72))">
                  <div style="display:flex;align-items:center;gap:6px">
                    <div style="width:12px;height:2px;background:var(--accent,#2f49d8)"></div>
                    <span>ONSET</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px">
                    <div style="width:12px;height:2px;background:var(--ink,#1b1e24)"></div>
                    <span>DECAY SLICES</span>
                  </div>
                </div>
                <div style="position:absolute;right:16px;bottom:6px;font:500 8px 'JetBrains Mono',monospace;letter-spacing:.18em;color:var(--ink2,rgba(0,0,0,.72))">
                  NOTE DECAY · ${tgt.ratio.toFixed(2)}×F
                </div>
              </div>

              <!-- 6 Interactive Flat Instrument Cells -->
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
                
                <!-- Cell 1: RATIO -->
                <div style="background:var(--panel,#f3f2ee);border-radius:14px;padding:15px 17px 16px;display:flex;flex-direction:column;gap:10px">
                  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px">
                    <div style="font:500 9px 'JetBrains Mono',monospace;letter-spacing:.2em;color:var(--ink2,rgba(0,0,0,.72))">RATIO</div>
                    <div style="display:flex;align-items:baseline;gap:4px">
                      <div style="font:700 21px/1 'JetBrains Mono',monospace;letter-spacing:-.035em;color:var(--accent,#2f49d8)">${tgt.ratio.toFixed(2)}</div>
                      <div style="font:500 8px 'JetBrains Mono',monospace;letter-spacing:.14em;color:var(--ink2,rgba(0,0,0,.6))">×F</div>
                    </div>
                  </div>
                  <div
                    @pointerdown=${this.positional({ x: { key: 'ratio', steps: DETENTS } })}
                    @dblclick=${() => this.resetAll()}
                    style="cursor:pointer;touch-action:none;position:relative;padding:8px 0 2px"
                  >
                    <svg viewBox="0 0 100 40" preserveAspectRatio="none" style="width:100%;height:46px;overflow:visible">
                      <path d="M0 28h100" stroke="var(--ink,#1b1e24)" stroke-width="1.6"></path>
                      <path d="${ticks}" stroke="var(--ink,#1b1e24)" stroke-width="1.2" opacity=".45"></path>
                      <path d="M${rx.toFixed(1)} 28V8" stroke="var(--accent,#2f49d8)" stroke-width="1.6"></path>
                    </svg>
                    <div style="position:absolute;left:${rx.toFixed(1)}%;top:24px;width:12px;height:12px;margin:-6px 0 0 -6px;background:var(--accent,#2f49d8);border-radius:2px;transform:${hs('ratio')};transition:transform 220ms cubic-bezier(.2,.8,.2,1);will-change:transform"></div>
                    <div style="display:flex;justify-content:space-between;font:500 7.5px 'JetBrains Mono',monospace;letter-spacing:.1em;color:var(--ink2,rgba(0,0,0,.55))">
                      <span>0.5</span><span>2</span><span>4</span><span>8</span>
                    </div>
                  </div>
                </div>

                <!-- Cell 2: CONTOUR -->
                <div style="background:var(--panel,#f3f2ee);border-radius:14px;padding:15px 17px 16px;display:flex;flex-direction:column;gap:10px">
                  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px">
                    <div style="font:500 9px 'JetBrains Mono',monospace;letter-spacing:.2em;color:var(--ink2,rgba(0,0,0,.72))">CONTOUR</div>
                    <div style="font:700 21px/1 'JetBrains Mono',monospace;letter-spacing:-.035em;color:var(--accent,#2f49d8)">${cB.toFixed(2)}</div>
                  </div>
                  <div
                    @pointerdown=${this.positional({ x: { key: 'time', lo: 0, hi: 1 }, y: { key: 'bend', lo: 0, hi: 1 } })}
                    @dblclick=${() => this.resetAll()}
                    style="cursor:crosshair;touch-action:none;position:relative"
                  >
                    <svg viewBox="0 0 100 52" preserveAspectRatio="none" style="width:100%;height:clamp(56px,7vh,78px);overflow:visible">
                      <rect x="0" y="0" width="100" height="52" fill="none" stroke="var(--ink,#1b1e24)" stroke-width="1" stroke-dasharray="3 5" opacity=".18"></rect>
                      <path d="${contourCurve}" stroke="var(--ink,#1b1e24)" stroke-width="2.2" fill="none"></path>
                      <path d="M${(cT * W).toFixed(1)} 0V52" stroke="var(--accent,#2f49d8)" stroke-width="1" opacity=".35" stroke-dasharray="3 3"></path>
                    </svg>
                    <div style="position:absolute;left:${(cT * 100).toFixed(1)}%;top:${((1 - cB) * 100).toFixed(1)}%;width:12px;height:12px;margin:-6px 0 0 -6px;background:var(--accent,#2f49d8);border-radius:2px;transform:${hs('time')};transition:transform 220ms cubic-bezier(.2,.8,.2,1);will-change:transform"></div>
                  </div>
                  <div style="display:flex;justify-content:space-between;font:500 7.5px 'JetBrains Mono',monospace;letter-spacing:.14em;color:var(--ink2,rgba(0,0,0,.55))">
                    <span>← TIME →</span><span>↕ BEND</span>
                  </div>
                </div>

                <!-- Cell 3: FEEDBACK -->
                <div style="background:var(--panel,#f3f2ee);border-radius:14px;padding:15px 17px 16px;display:flex;flex-direction:column;gap:10px">
                  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px">
                    <div style="font:500 9px 'JetBrains Mono',monospace;letter-spacing:.2em;color:var(--ink2,rgba(0,0,0,.72))">FEEDBACK</div>
                    <div style="display:flex;align-items:baseline;gap:4px">
                      <div style="font:700 21px/1 'JetBrains Mono',monospace;letter-spacing:-.035em;color:var(--accent,#2f49d8)">${d.fbk.toFixed(1)}</div>
                      <div style="font:500 8px 'JetBrains Mono',monospace;letter-spacing:.14em;color:var(--ink2,rgba(0,0,0,.6))">%</div>
                    </div>
                  </div>
                  <div
                    @pointerdown=${this.positional({ y: { key: 'fbk', lo: 0, hi: 100 } })}
                    @dblclick=${() => this.resetAll()}
                    style="cursor:ns-resize;touch-action:none"
                  >
                    <svg viewBox="0 0 100 52" preserveAspectRatio="none" style="width:100%;height:clamp(56px,7vh,78px);overflow:visible">
                      <rect x="0" y="0" width="100" height="52" fill="var(--track,#dedcd4)"></rect>
                      <rect x="0" y="${fbkY.toFixed(1)}" width="100" height="${(H - fbkY).toFixed(1)}" fill="var(--ink,#1b1e24)"></rect>
                      <rect x="0" y="${fbkY.toFixed(1)}" width="100" height="3" fill="var(--accent,#2f49d8)"></rect>
                    </svg>
                  </div>
                  <div style="display:flex;justify-content:space-between;font:500 7.5px 'JetBrains Mono',monospace;letter-spacing:.14em;color:var(--ink2,rgba(0,0,0,.55))">
                    <span>DRAG ↕</span><span>SELF-MOD</span>
                  </div>
                </div>

                <!-- Cell 4: NOISE -->
                <div style="background:var(--panel,#f3f2ee);border-radius:14px;padding:15px 17px 16px;display:flex;flex-direction:column;gap:10px">
                  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px">
                    <div style="font:500 9px 'JetBrains Mono',monospace;letter-spacing:.2em;color:var(--ink2,rgba(0,0,0,.72))">NOISE</div>
                    <div style="display:flex;align-items:baseline;gap:4px">
                      <div style="font:700 21px/1 'JetBrains Mono',monospace;letter-spacing:-.035em;color:var(--accent,#2f49d8)">${d.noise.toFixed(1)}</div>
                      <div style="font:500 8px 'JetBrains Mono',monospace;letter-spacing:.14em;color:var(--ink2,rgba(0,0,0,.6))">%</div>
                    </div>
                  </div>
                  <div
                    @pointerdown=${this.positional({ y: { key: 'noise', lo: 0, hi: 100 } })}
                    @dblclick=${() => this.resetAll()}
                    style="cursor:ns-resize;touch-action:none"
                  >
                    <svg viewBox="0 0 100 52" preserveAspectRatio="none" style="width:100%;height:clamp(56px,7vh,78px);overflow:visible">
                      <path d="${noiseField}" stroke="var(--ink,#1b1e24)" stroke-width="2.4" stroke-linecap="round" opacity=".85"></path>
                      <path d="M0 ${((1 - d.noise / 100) * H).toFixed(1)}h100" stroke="var(--accent,#2f49d8)" stroke-width="1.6"></path>
                    </svg>
                  </div>
                  <div style="display:flex;justify-content:space-between;font:500 7.5px 'JetBrains Mono',monospace;letter-spacing:.14em;color:var(--ink2,rgba(0,0,0,.55))">
                    <span>DRAG ↕</span><span>GRAIN</span>
                  </div>
                </div>

                <!-- Cell 5: ENVELOPE -->
                <div style="background:var(--panel,#f3f2ee);border-radius:14px;padding:15px 17px 16px;display:flex;flex-direction:column;gap:10px">
                  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px">
                    <div style="font:500 9px 'JetBrains Mono',monospace;letter-spacing:.2em;color:var(--ink2,rgba(0,0,0,.72))">ENVELOPE</div>
                    <div style="font:700 21px/1 'JetBrains Mono',monospace;letter-spacing:-.035em;color:var(--accent,#2f49d8)">${eL.toFixed(2)}</div>
                  </div>
                  <div
                    @pointerdown=${this.positional({ x: { key: 'atk', lo: 0, hi: 1 }, y: { key: 'rel', lo: 0, hi: 1 } })}
                    @dblclick=${() => this.resetAll()}
                    style="cursor:crosshair;touch-action:none;position:relative"
                  >
                    <svg viewBox="0 0 100 52" preserveAspectRatio="none" style="width:100%;height:clamp(56px,7vh,78px);overflow:visible">
                      <path d="M0 52h100" stroke="var(--ink,#1b1e24)" stroke-width="1" opacity=".3"></path>
                      <path d="${envCurve}" stroke="var(--ink,#1b1e24)" stroke-width="2.2" fill="none"></path>
                    </svg>
                    <div style="position:absolute;left:${(eA * 100).toFixed(1)}%;top:${((1 - eL) * 100).toFixed(1)}%;width:12px;height:12px;margin:-6px 0 0 -6px;background:var(--accent,#2f49d8);border-radius:2px;transform:${hs('atk')};transition:transform 220ms cubic-bezier(.2,.8,.2,1);will-change:transform"></div>
                  </div>
                  <div style="display:flex;justify-content:space-between;font:500 7.5px 'JetBrains Mono',monospace;letter-spacing:.14em;color:var(--ink2,rgba(0,0,0,.55))">
                    <span>← ATTACK →</span><span>↕ LEVEL</span>
                  </div>
                </div>

                <!-- Cell 6: MOD INDEX -->
                <div style="background:var(--panel,#f3f2ee);border-radius:14px;padding:15px 17px 16px;display:flex;flex-direction:column;gap:10px">
                  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px">
                    <div style="font:500 9px 'JetBrains Mono',monospace;letter-spacing:.2em;color:var(--ink2,rgba(0,0,0,.72))">MOD INDEX</div>
                    <div style="font:700 21px/1 'JetBrains Mono',monospace;letter-spacing:-.035em;color:var(--accent,#2f49d8)">${d.mod.toFixed(1)}</div>
                  </div>
                  <div
                    @pointerdown=${this.positional({ y: { key: 'mod', lo: 0, hi: 100 } })}
                    @dblclick=${() => this.resetAll()}
                    style="cursor:ns-resize;touch-action:none;position:relative"
                  >
                    <svg viewBox="0 0 100 52" preserveAspectRatio="none" style="width:100%;height:clamp(56px,7vh,78px);overflow:visible">
                      <path d="${stems}" stroke="var(--ink,#1b1e24)" stroke-width="2.6" opacity=".8"></path>
                      <path d="M0 ${((1 - d.mod / 100) * H).toFixed(1)}h100" stroke="var(--accent,#2f49d8)" stroke-width="1.6" stroke-dasharray="4 4"></path>
                    </svg>
                    <div style="position:absolute;right:0;top:${(100 - d.mod).toFixed(1)}%;width:12px;height:12px;margin:-6px -6px 0 0;background:var(--accent,#2f49d8);border-radius:2px;transform:${hs('mod')};transition:transform 220ms cubic-bezier(.2,.8,.2,1);will-change:transform"></div>
                  </div>
                  <div style="display:flex;justify-content:space-between;font:500 7.5px 'JetBrains Mono',monospace;letter-spacing:.14em;color:var(--ink2,rgba(0,0,0,.55))">
                    <span>DRAG ↕</span><span>SIDEBANDS</span>
                  </div>
                </div>

              </div>

            </div>

            <!-- Footer Legend & Export M8 Action -->
            <div style="display:flex;align-items:center;gap:14px;padding:6px 20px 18px;flex-wrap:wrap">
              <div style="font:400 8.5px 'JetBrains Mono',monospace;letter-spacing:.12em;color:var(--ink2,rgba(0,0,0,.72))">
                DRAG A CELL · DOUBLE-CLICK TO REVERT SLOT
              </div>
              <div style="flex:1"></div>
              <button
                type="button"
                @click=${() => this.exportM8()}
                style="border:none;background:transparent;cursor:pointer;font:500 8.5px 'JetBrains Mono',monospace;letter-spacing:.12em;color:var(--accent,#2f49d8);padding:0"
              >
                EXPORT .M8I
              </button>
            </div>

          </div>

        </div>
      </div>
    `;
  }
}
