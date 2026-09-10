import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import './style.css';
import { AudioController } from './audio/AudioController';
import { AnchorMacroConfig, type AnchorName } from './audio/MacroMapper';
import { MACHINES } from './ui/MachineData';
import { getDemoPatternForMachine } from './audio/DemoPatterns';

const audio = new AudioController();
(window as any).audio = audio;

// 2a — Machine Mood. Tailored stocks per machine from Orbit Meridian 3D
const STOCK = (h: number, c: number, hues: number[]) => ({
  gnd: 'oklch(0.936 ' + (c * 0.25).toFixed(3) + ' ' + h + ')',
  ink: 'oklch(0.27 ' + (c * 0.4).toFixed(3) + ' ' + h + ')',
  ink2: 'oklch(0.44 ' + (c * 0.4).toFixed(3) + ' ' + h + ')',
  ink3: 'oklch(0.40 ' + (c * 0.4).toFixed(3) + ' ' + h + ')',
  line: 'oklch(0.27 ' + (c * 0.4).toFixed(3) + ' ' + h + ' / 0.2)',
  line2: 'oklch(0.27 ' + (c * 0.4).toFixed(3) + ' ' + h + ' / 0.34)',
  soft: 'oklch(0.27 ' + (c * 0.4).toFixed(3) + ' ' + h + ' / 0.08)',
  selBg: 'oklch(0.5 ' + c.toFixed(3) + ' ' + h + ' / 0.13)',
  acc: 'oklch(0.48 ' + c.toFixed(3) + ' ' + h + ')',
  accFg: 'oklch(0.965 ' + (c * 0.2).toFixed(3) + ' ' + h + ')',
  off: 'oklch(0.5 ' + c.toFixed(3) + ' ' + h + ' / 0.22)',
  hues: hues,
  chroma: c
});

const STOCKS: Record<string, ReturnType<typeof STOCK>> = {
  ep: STOCK(88, 0.05, [88, 104, 72, 120]),
  sb: STOCK(262, 0.062, [262, 240, 285, 220]),
  ml: STOCK(155, 0.058, [155, 176, 138, 196]),
  pd: STOCK(318, 0.055, [318, 342, 296, 270]),
  pc: STOCK(64, 0.02, [64, 88, 40, 108]),
  vl: STOCK(205, 0.06, [205, 226, 188, 246])
};

const INK = {
  key: 'ink',
  name: 'Ink',
  gnd: '#17170f',
  ink: '#dcd9c6',
  ink2: '#b9b5a1',
  ink3: '#928e7c',
  line: 'rgba(220,217,198,.16)',
  line2: 'rgba(220,217,198,.3)',
  soft: 'rgba(220,217,198,.09)',
  off: 'rgba(220,217,198,.34)',
  acc: '#dcd9c6',
  accFg: '#17170f',
  selBg: 'rgba(220,217,198,.12)',
  hues: null as number[] | null,
  chroma: 0
};

// Orbit geometry: eccentric centers, staggered starts, tapered heads
const CX = 350;
const CY = 343;
const RADII = [296, 252, 208, 164];
const WIDTHS = [19, 17, 15, 13];
const ECC: [number, number][] = [[0, 0], [7, -5], [13, -9], [18, -12]];
const START = [-90, -71, -107, -58];
const CEN = (i: number): [number, number] => [CX + ECC[i % ECC.length][0], CY + ECC[i % ECC.length][1]];

const THEME_KEY = 'm8fm_theme';
const TILT_KEY = 'm8fm_tilt';
const SWAY_KEY = 'm8fm_sway';
const SPIN_KEY = 'm8fm_spin';
const PUSH_KEY = 'm8fm_push';
const PULL_KEY = 'm8fm_pull';

function getStoredTheme(): 'ink' | 'color' {
  const t = localStorage.getItem(THEME_KEY);
  return t === 'color' ? 'color' : 'ink';
}

function getStoredNumber(key: string, def: number): number {
  const val = localStorage.getItem(key);
  if (val === null) return def;
  const num = parseFloat(val);
  return isNaN(num) ? def : num;
}

@customElement('fm-studio')
export class FmStudio extends LitElement {
  createRenderRoot() {
    return this;
  }

  @state() accessor sel = 0;
  @state() accessor preset = 0;
  @state() accessor v: Record<string, number> = {};
  @state() accessor dirty = false;
  @state() accessor vol = 0.5;

  @state() accessor isPlayingDemo = false;
  @state() accessor currentDemoStep = -1;

  // Orbit Meridian 3D options
  @state() accessor theme: 'ink' | 'color' = getStoredTheme();
  @state() accessor tilt = getStoredNumber(TILT_KEY, 12);
  @state() accessor sway = getStoredNumber(SWAY_KEY, 4);
  @state() accessor spin = getStoredNumber(SPIN_KEY, 44);
  @state() accessor push = getStoredNumber(PUSH_KEY, 26);
  @state() accessor pull = getStoredNumber(PULL_KEY, 0);
  @state() accessor view = 32;
  @state() accessor turn = 0;
  @state() accessor isOrbiting = false;

  @state() accessor liveKeyNote: number | null = null;
  @state() accessor motionOpen = false;
  @state() accessor machOpen = false;
  @state() accessor ring = 0;
  @state() accessor isDraggingRing = false;
  @state() accessor mobileBrowseOpen = false;

  connectedCallback() {
    super.connectedCallback();
    this.selectMachine(0);
    this.updateBodyBg();

    audio.onNoteTrigger = (note) => {
      this.liveKeyNote = note;
      setTimeout(() => {
        if (this.liveKeyNote === note) {
          this.liveKeyNote = null;
        }
      }, 140);
    };

    // Close machine popover when clicking outside
    window.addEventListener('pointerdown', this.handleWindowPointerDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    audio.stopDemo();
    window.removeEventListener('pointerdown', this.handleWindowPointerDown);
  }

  handleWindowPointerDown = (e: PointerEvent) => {
    if (this.machOpen) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-mach-dropdown]')) {
        this.machOpen = false;
      }
    }
  };

  getPal() {
    if (this.theme === 'ink') return INK;
    const mach = MACHINES[this.sel];
    return { key: 'color', ...(STOCKS[mach.id] || STOCKS.ep) };
  }

  updateBodyBg() {
    const P = this.getPal();
    document.body.style.backgroundColor = P.gnd;
    document.documentElement.style.backgroundColor = P.gnd;
  }

  toggleTheme() {
    this.theme = this.theme === 'ink' ? 'color' : 'ink';
    localStorage.setItem(THEME_KEY, this.theme);
    this.updateBodyBg();
  }

  getVal(mi: number, i: number) {
    const m = MACHINES[mi];
    const key = m.id + i;
    return this.v[key] !== undefined ? this.v[key] : m.presets[this.preset % m.presets.length][1][i] ?? 50;
  }

  setVal(i: number, nv: number) {
    const m = MACHINES[this.sel];
    const key = m.id + i;
    const clamped = Math.max(0, Math.min(100, nv));
    this.v = { ...this.v, [key]: clamped };
    this.dirty = true;

    const macroName = AnchorMacroConfig[m.name as AnchorName]?.[i];
    if (macroName) {
      audio.setMacro(macroName, clamped / 100);
    }
  }

  hx(v: number) {
    return Math.round(Math.max(0, Math.min(100, v)) / 100 * 255).toString(16).toUpperCase().padStart(2, '0');
  }

  selectMachine(idx: number) {
    this.sel = idx;
    this.preset = 0;
    this.v = {};
    this.dirty = false;
    this.ring = 0;
    this.machOpen = false;
    this.mobileBrowseOpen = false;

    const m = MACHINES[idx];
    audio.loadAnchor(m.name as AnchorName);

    for (let i = 0; i < m.mods.length; i++) {
      const val = this.getVal(idx, i);
      const macroName = AnchorMacroConfig[m.name as AnchorName]?.[i];
      if (macroName) {
        audio.setMacro(macroName, val / 100);
      }
    }

    if (this.isPlayingDemo) {
      const pattern = getDemoPatternForMachine(m.name);
      audio.playDemo(pattern, (step) => {
        this.currentDemoStep = step;
      });
    }

    this.updateBodyBg();
  }

  selectPreset(idx: number) {
    this.preset = idx;
    this.v = {};
    this.dirty = false;

    const m = MACHINES[this.sel];
    audio.selectPreset(idx);

    for (let i = 0; i < m.mods.length; i++) {
      const val = this.getVal(this.sel, i);
      const macroName = AnchorMacroConfig[m.name as AnchorName]?.[i];
      if (macroName) {
        audio.setMacro(macroName, val / 100);
      }
    }
  }

  toggleDemo() {
    if (this.isPlayingDemo) {
      audio.stopDemo();
      this.isPlayingDemo = false;
      this.currentDemoStep = -1;
    } else {
      const m = MACHINES[this.sel];
      const pattern = getDemoPatternForMachine(m.name);
      audio.playDemo(pattern, (step) => {
        this.currentDemoStep = step;
      });
      this.isPlayingDemo = true;
    }
  }

  getPatchFilename(ext: string) {
    const m = MACHINES[this.sel];
    const p = m.presets[this.preset % m.presets.length][0];
    return `${m.name.replace(/[^a-zA-Z0-9_\-]/g, '_')}_${p.replace(/[^a-zA-Z0-9_\-]/g, '_')}.${ext}`;
  }

  exportInstrument() {
    const filename = this.getPatchFilename('m8i');
    audio.exportPatch(filename);
  }

  exportSong() {
    const m = MACHINES[this.sel];
    const pattern = getDemoPatternForMachine(m.name);
    const filename = this.getPatchFilename('m8s');
    const title = `M8FM ${m.name}`.slice(0, 12);
    audio.exportSong(filename, pattern, title);
  }

  // 3D Geometry and Perspective Math
  tiltOf(i: number) { return i * this.tilt; }
  yawOf(i: number) { return -i * 4; }
  zOf(i: number) {
    const baseDepth = i * (this.push - this.pull);
    return baseDepth + (i === this.ring ? 24 : 0);
  }

  frame(tilt: number, yaw: number, z: number, shapes: [number, number, number][]) {
    const t = tilt * Math.PI / 180, y = yaw * Math.PI / 180, P = 1500;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    shapes.forEach(sh => {
      for (let k = 0; k < 48; k++) {
        const a = k / 48 * Math.PI * 2;
        const px = sh[1] + sh[0] * Math.cos(a), py = sh[2] + sh[0] * Math.sin(a);
        const xa = px * Math.cos(y) + z * Math.sin(y), za = -px * Math.sin(y) + z * Math.cos(y);
        const yb = py * Math.cos(t) - za * Math.sin(t), zb = py * Math.sin(t) + za * Math.cos(t);
        const s = P / (P - zb), sx = xa * s, sy = yb * s;
        if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
        if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
      }
    });
    return { dx: -(x0 + x1) / 2, dy: -(y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }

  place(tilt: number, yaw: number, z: number, shapes: [number, number, number][], sc = 1, fit = false) {
    const f = this.frame(tilt, yaw, z, shapes);
    const s = fit ? Math.min(sc, 660 / f.w, 648 / f.h) : sc;
    return 'translate(' + (f.dx * s).toFixed(1) + 'px,' + (f.dy * s).toFixed(1) + 'px) scale('
      + s + ') rotateX(' + tilt.toFixed(1) + 'deg) rotateY(' + yaw.toFixed(1)
      + 'deg) translateZ(' + z.toFixed(0) + 'px)';
  }

  tf(i: number) {
    const c = CEN(i);
    const r = RADII[i % RADII.length];
    return this.place(this.tiltOf(i), this.yawOf(i), this.zOf(i),
      [[r, c[0] - 350, c[1] - 343]], 1);
  }

  // Tapered ribbon path generator from Orbit Meridian 3D
  segD(i: number, v: number, k = 1, shift = 0): string {
    const rr = RADII[i % RADII.length];
    const sweep = (Math.max(0, Math.min(100, v)) / 100) * 360;
    if (sweep < 1.2) return '';
    const c = CEN(i);
    const n = Math.max(6, Math.ceil(sweep / 4));
    const sc = k;
    const sh = shift;
    const wide = WIDTHS[i % WIDTHS.length];
    const thin = wide * 0.34;
    const w = (t: number) => (thin + (wide - thin) * Math.pow(t, 0.62)) * sc;
    const mid = (t: number) => (thin + (wide - thin) * Math.pow(t, 0.62)) * sh;
    const pt = (t: number, off: number): [string, string] => {
      const ang = (START[i % START.length] + sweep * t) * Math.PI / 180;
      const r = rr + off;
      return [(c[0] + r * Math.cos(ang)).toFixed(2), (c[1] + r * Math.sin(ang)).toFixed(2)];
    };
    const p0 = pt(0, mid(0) + w(0) / 2);
    let d = `M${p0[0]} ${p0[1]}`;
    for (let k2 = 1; k2 <= n; k2++) {
      const t = k2 / n;
      const p = pt(t, mid(t) + w(t) / 2);
      d += `L${p[0]} ${p[1]}`;
    }
    for (let k2 = n; k2 >= 0; k2--) {
      const t = k2 / n;
      const p = pt(t, mid(t) - w(t) / 2);
      d += `L${p[0]} ${p[1]}`;
    }
    return d + 'Z';
  }

  arc(i: number, on: boolean) {
    const P = this.getPal();
    if (!P.hues) return on ? P.acc : P.off;
    const h = P.hues[i % P.hues.length];
    const l = on ? (0.42 + (i % 2) * 0.03) : (0.63 + (i % 2) * 0.025);
    const c = (P.chroma * (on ? 2.1 : 1.25)).toFixed(3);
    return `oklch(${l.toFixed(3)} ${c} ${h})`;
  }

  arcAt(i: number, on: boolean, dl: number) {
    const P = this.getPal();
    if (!P.hues) return on ? P.acc : P.off;
    const l = Math.max(0.2, Math.min(0.9, (on ? 0.42 + (i % 2) * 0.03 : 0.63 + (i % 2) * 0.025) + dl));
    return `oklch(${l.toFixed(3)} ${(P.chroma * (on ? 2.1 : 1.25)).toFixed(3)} ${P.hues[i % P.hues.length]})`;
  }

  waveOf(i: number) {
    if (!this.isPlayingDemo) return 'none';
    const bar = 16 * 0.145;
    return 'o-wave ' + bar.toFixed(3) + 's ease-in-out infinite ' + (-(bar - i * 0.145)).toFixed(3) + 's';
  }

  orbitOf() {
    return this.spin > 0 ? `o-orb ${this.spin.toFixed(1)}s ease-in-out infinite` : 'none';
  }

  // Pointer interactions
  startDrag(ringIdx: number, e: PointerEvent, stage: HTMLElement) {
    const r = stage.getBoundingClientRect(), k = r.width / 700, c0 = CEN(ringIdx);
    const cx = r.left + c0[0] * k, cy = r.top + c0[1] * k;
    const ang = (x: number, y: number) => Math.atan2(y - cy, x - cx) * 180 / Math.PI;
    let last = ang(e.clientX, e.clientY);
    let v = this.getVal(this.sel, ringIdx);
    this.isDraggingRing = true;

    const move = (ev: PointerEvent) => {
      const a = ang(ev.clientX, ev.clientY);
      let d = a - last;
      if (d > 180) d -= 360; else if (d < -180) d += 360;
      last = a;
      v = Math.max(0, Math.min(100, v + d / 360 * 100 * (ev.shiftKey ? 0.22 : 1)));
      this.setVal(ringIdx, v);
    };

    const up = () => {
      this.isDraggingRing = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  handleRingPointerDown(i: number, e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.ring = i;
    const stage = (e.currentTarget as HTMLElement).closest('[data-stage]') as HTMLElement;
    if (stage) this.startDrag(i, e, stage);
  }

  handleOrbitPointerDown = (e: PointerEvent) => {
    const stage = e.currentTarget as HTMLElement;
    const bands = stage.querySelectorAll<SVGCircleElement>('circle[stroke-width="38"]');
    if (!bands.length) return this.startOrbit(e, stage);
    let targetRing = -1, best = 1e9;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i].getBoundingClientRect();
      const mx = b.left + b.width / 2, my = b.top + b.height / 2;
      const rx = Math.max(8, b.width / 2), ry = Math.max(8, b.height / 2);
      const u = Math.hypot((e.clientX - mx) / rx, (e.clientY - my) / ry);
      const d = Math.abs(u - 1) * Math.min(rx, ry);
      if (d < best) { best = d; targetRing = i % 4; }
    }
    if (targetRing < 0 || best > 28) {
      return this.startOrbit(e, stage);
    }
    e.preventDefault();
    this.ring = targetRing;
    this.startDrag(targetRing, e, stage);
  };

  startOrbit = (e: PointerEvent, stage: HTMLElement) => {
    const x0 = e.clientX, y0 = e.clientY;
    const v0 = this.view;
    const t0 = this.turn;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    this.isOrbiting = true;

    const mv = (ev: PointerEvent) => {
      this.view = Math.max(0, Math.min(72, v0 - (ev.clientY - y0) * 0.28));
      this.turn = t0 + (ev.clientX - x0) * 0.3;
    };

    const up = () => {
      this.isOrbiting = false;
      stage.removeEventListener('pointermove', mv);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', up);
    };

    stage.addEventListener('pointermove', mv);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
  };

  handleParamDrag(i: number, e: PointerEvent) {
    e.preventDefault();
    this.ring = i;
    const el = e.currentTarget as HTMLElement;
    const TRAVEL = 260;
    const x0 = e.clientX;
    const v0 = this.getVal(this.sel, i);
    el.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const nv = Math.max(0, Math.min(100, v0 + (ev.clientX - x0) / TRAVEL * 100));
      this.setVal(i, nv);
    };

    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  handleMotionDrag(key: 'view' | 'tilt' | 'sway' | 'spin' | 'push' | 'pull', min: number, max: number, step: number, e: PointerEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const w = el.getBoundingClientRect().width || 180;
    const x0 = e.clientX;
    const v0 = this[key];
    el.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      let n = v0 + (ev.clientX - x0) / w * (max - min);
      n = Math.max(min, Math.min(max, Math.round(n / step) * step));
      if (key === 'push') {
        this.push = n;
        localStorage.setItem(PUSH_KEY, String(n));
      } else if (key === 'pull') {
        this.pull = n;
        localStorage.setItem(PULL_KEY, String(n));
      } else if (key === 'tilt') {
        this.tilt = n;
        localStorage.setItem(TILT_KEY, String(n));
      } else if (key === 'sway') {
        this.sway = n;
        localStorage.setItem(SWAY_KEY, String(n));
      } else if (key === 'spin') {
        this.spin = n;
        localStorage.setItem(SPIN_KEY, String(n));
      } else {
        this[key] = n;
      }
    };

    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  handleVolDrag = (e: PointerEvent) => {
    e.preventDefault();
    const bar = e.currentTarget as HTMLElement;
    const set = (cx: number) => {
      const r = bar.getBoundingClientRect();
      this.vol = Math.max(0, Math.min(1, (cx - r.left) / r.width));
      audio.setVolume(this.vol);
    };
    set(e.clientX);
    const move = (ev: PointerEvent) => set(ev.clientX);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  handleVolWheel(e: WheelEvent) {
    e.preventDefault();
    this.vol = Math.max(0, Math.min(1, this.vol - e.deltaY * 0.001));
    audio.setVolume(this.vol);
  }

  // Dual-hemisphere depth rendering for desktop
  renderDesktopRing(i: number, v: number, on: boolean) {
    const c = CEN(i);
    const rr = RADII[i % RADII.length];
    const ang = (START[i % START.length] + (v / 100) * 360) * Math.PI / 180;
    const op = on ? 1 : [1, 0.84, 0.72, 0.6][i % 4];
    const gid = `gr_d_${i}`;
    const gy0 = (c[1] - rr).toFixed(0);
    const gy1 = (c[1] + rr).toFixed(0);
    const cFar = this.arcAt(i, on, 0.13);
    const cNear = this.arcAt(i, on, -0.07);
    const arcColor = this.arc(i, on);
    const d = this.segD(i, v);
    const hx = (c[0] + rr * Math.cos(ang)).toFixed(1);
    const hy = (c[1] + rr * Math.sin(ang)).toFixed(1);
    const hr = on ? 9 : 6;

    return html`
      <div style="position:absolute;inset:0;transform-style:preserve-3d;pointer-events:none;animation:${this.waveOf(i)}">
        <!-- Upper hemisphere -->
        <div style="position:absolute;left:0;right:0;top:-25%;height:75%;overflow:hidden;pointer-events:none;transform-origin:50% 100%;transition:transform 460ms cubic-bezier(.16,1,.3,1),opacity 460ms cubic-bezier(.16,1,.3,1);opacity:${op};transform:${this.tf(i)}">
          <svg viewBox="0 0 700 686" fill="none" preserveAspectRatio="xMidYMid meet" style="position:absolute;left:0;top:33.333%;width:100%;height:133.333%;overflow:visible;pointer-events:none">
            <defs>
              <linearGradient id="${gid}" x1="0" y1="${gy0}" x2="0" y2="${gy1}" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="${cFar}"></stop>
                <stop offset="1" stop-color="${cNear}"></stop>
              </linearGradient>
            </defs>
            <circle cx="${c[0]}" cy="${c[1]}" r="${rr}" stroke="${on ? 'var(--line2)' : 'var(--line)'}" stroke-width="${on ? 1.4 : 1}"></circle>
            <path d="${d}" fill="url(#${gid})"></path>
            <circle cx="${hx}" cy="${hy}" r="${hr}" fill="${arcColor}" style="transition:r 140ms cubic-bezier(.23,1,.32,1)"></circle>
            <circle @pointerdown=${(e: PointerEvent) => this.handleRingPointerDown(i, e)} cx="${c[0]}" cy="${c[1]}" r="${rr}" stroke="transparent" stroke-width="38" style="pointer-events:stroke;cursor:ew-resize"></circle>
          </svg>
        </div>

        <!-- Lower hemisphere -->
        <div style="position:absolute;left:0;right:0;top:50%;height:75%;overflow:hidden;pointer-events:none;transform-origin:50% 0%;transition:transform 460ms cubic-bezier(.16,1,.3,1),opacity 460ms cubic-bezier(.16,1,.3,1);opacity:${op};transform:${this.tf(i)}">
          <svg viewBox="0 0 700 686" fill="none" preserveAspectRatio="xMidYMid meet" style="position:absolute;left:0;top:-66.667%;width:100%;height:133.333%;overflow:visible;pointer-events:none">
            <circle cx="${c[0]}" cy="${c[1]}" r="${rr}" stroke="${on ? 'var(--line2)' : 'var(--line)'}" stroke-width="${on ? 1.4 : 1}"></circle>
            <path d="${d}" fill="url(#${gid})"></path>
            <circle cx="${hx}" cy="${hy}" r="${hr}" fill="${arcColor}" style="transition:r 140ms cubic-bezier(.23,1,.32,1)"></circle>
            <circle @pointerdown=${(e: PointerEvent) => this.handleRingPointerDown(i, e)} cx="${c[0]}" cy="${c[1]}" r="${rr}" stroke="transparent" stroke-width="38" style="pointer-events:stroke;cursor:ew-resize"></circle>
          </svg>
        </div>
      </div>
    `;
  }

  // Single-plane rendering for mobile
  renderMobileRing(i: number, v: number, on: boolean) {
    const c = CEN(i);
    const rr = RADII[i % RADII.length];
    const ang = (START[i % START.length] + (v / 100) * 360) * Math.PI / 180;
    const op = on ? 1 : [1, 0.84, 0.72, 0.6][i % 4];
    const gid = `gr_m_${i}`;
    const gy0 = (c[1] - rr).toFixed(0);
    const gy1 = (c[1] + rr).toFixed(0);
    const cFar = this.arcAt(i, on, 0.13);
    const cNear = this.arcAt(i, on, -0.07);
    const arcColor = this.arc(i, on);
    const d = this.segD(i, v);
    const hx = (c[0] + rr * Math.cos(ang)).toFixed(1);
    const hy = (c[1] + rr * Math.sin(ang)).toFixed(1);
    const hr = on ? 9 : 6;

    return html`
      <div style="position:absolute;inset:0;transform-style:preserve-3d;pointer-events:none;animation:${this.waveOf(i)}">
        <div style="position:absolute;inset:0;transform-style:preserve-3d;pointer-events:none;transition:transform 460ms cubic-bezier(.16,1,.3,1),opacity 460ms cubic-bezier(.16,1,.3,1);opacity:${op};transform:${this.tf(i)}">
          <svg viewBox="0 0 700 686" fill="none" style="width:100%;height:100%;overflow:visible;pointer-events:none">
            <defs>
              <linearGradient id="${gid}" x1="0" y1="${gy0}" x2="0" y2="${gy1}" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="${cFar}"></stop>
                <stop offset="1" stop-color="${cNear}"></stop>
              </linearGradient>
            </defs>
            <circle cx="${c[0]}" cy="${c[1]}" r="${rr}" stroke="${on ? 'var(--line2)' : 'var(--line)'}" stroke-width="${on ? 1.4 : 1}"></circle>
            <path d="${d}" fill="url(#${gid})"></path>
            <circle cx="${hx}" cy="${hy}" r="${hr}" fill="${arcColor}" style="transition:r 140ms cubic-bezier(.23,1,.32,1)"></circle>
            <circle @pointerdown=${(e: PointerEvent) => this.handleRingPointerDown(i, e)} cx="${c[0]}" cy="${c[1]}" r="${rr}" stroke="transparent" stroke-width="38" style="pointer-events:stroke;cursor:grab"></circle>
          </svg>
        </div>
      </div>
    `;
  }

  render() {
    const mi = this.sel;
    const mach = MACHINES[mi];
    const pi = this.preset % mach.presets.length;
    const P = this.getPal();
    const vals = [0, 1, 2, 3].map(i => this.getVal(mi, i));
    const activeVal = vals[this.ring] ?? vals[0];
    const activeMod = mach.mods[this.ring] || mach.mods[0];
    const activeModName = activeMod ? activeMod[0] : '';
    const activeModHint = activeMod ? activeMod[2] : '';

    const eyeLeft = ((CX + ECC[3][0] * 0.72) / 700 * 100).toFixed(2) + '%';
    const eyeTop = ((CY + ECC[3][1] * 0.72) / 686 * 100).toFixed(2) + '%';

    const palVars = `--gnd:${P.gnd};--ink:${P.ink};--ink2:${P.ink2};--ink3:${P.ink3};--line:${P.line};--line2:${P.line2};--soft:${P.soft};--acc:${P.acc};--accFg:${P.accFg};--dotc:${P.line};--selbg:${P.selBg};--turn:${this.turn.toFixed(2)}deg;--view:${this.view}deg;--nview:${-this.view}deg;--sway:${this.sway}deg;`;

    return html`
      <div id="app">
        <div class="orbit-frame" style="${palVars}">

          <!-- ==================== DESKTOP LAYOUT (>800px) ==================== -->
          <div class="desktop-view">
            
            <!-- Left: 3D Dial Stage Area -->
            <div style="flex:1;min-width:0;height:100%;min-height:0;display:flex;justify-content:center;align-items:center;position:relative;overflow:hidden">
              <!-- Full-bleed background dot grid covering entire stage edge-to-edge -->
              <div style="position:absolute;inset:0;background-image:radial-gradient(var(--dotc) 1px,transparent 1px);background-size:9px 9px;opacity:.28;pointer-events:none"></div>

              <div @pointerdown=${this.handleOrbitPointerDown}
                style="position:relative;aspect-ratio:700/686;width:100%;max-width:100%;max-height:100%;cursor:grab;touch-action:none;user-select:none;perspective:1020px;perspective-origin:50% 50%"
                data-stage="1">

                <!-- 3D Transform Container with Tilt, Camera Turn, Sway and Spin -->
                <div style="position:absolute;inset:6% 4%;pointer-events:none;transform-style:preserve-3d;transform:rotateX(var(--view,32deg)) rotateY(var(--turn,0deg))">
                  
                  <!-- Center Eye Numerical Readout facing viewer directly -->
                  <div style="position:absolute;left:${eyeLeft};top:${eyeTop};transform:translate(-50%,-52%) rotateY(calc(var(--turn,0deg) * -1)) rotateX(var(--nview,-32deg));transform-style:flat;display:flex;flex-direction:column;align-items:center;gap:9px;pointer-events:none">
                    <div style="font:700 clamp(38px, 9vmin, 76px)/1 'JetBrains Mono',monospace;letter-spacing:-.035em;color:var(--ink);animation:o-swell 6.2s ease-in-out infinite">
                      ${activeVal.toFixed(1)}
                    </div>
                    <div style="display:flex;align-items:center;gap:9px">
                      <div style="width:16px;height:1px;background:var(--line2)"></div>
                      <div style="font:500 clamp(8px, 1.5vmin, 10px)/1 'JetBrains Mono',monospace;letter-spacing:.26em;color:var(--ink2)">
                        ${activeModName}
                      </div>
                      <div style="width:16px;height:1px;background:var(--line2)"></div>
                    </div>
                  </div>

                  <!-- Ring Stack with Orbit Spin & Drift -->
                  <div style="position:absolute;inset:0;pointer-events:none;transform-style:preserve-3d;animation:${this.orbitOf()};animation-play-state:${this.isDraggingRing ? 'paused' : 'running'}">
                    <div style="position:absolute;inset:0;pointer-events:none;transform-style:preserve-3d;animation:o-drift 38s linear infinite">

                      <!-- 4 Depth-Shaded Split-Plane Rings -->
                      ${[0, 1, 2, 3].map(i => this.renderDesktopRing(i, vals[i], i === this.ring))}

                    </div>
                  </div>
                </div>

              </div>
            </div>

            <!-- Right: Control Sidebar (Orbit Meridian 3D layout) -->
            <div style="width:clamp(290px, 28vw, 340px);flex:none;border-left:1px solid var(--line);display:flex;align-items:stretch;height:100%;min-height:0;overflow:hidden">
              
              <!-- Vertical Side Label -->
              <div style="width:30px;flex:none;display:flex;align-items:center;justify-content:center;padding:0">
                <div style="writing-mode:vertical-rl;transform:rotate(180deg);font:500 8.5px 'JetBrains Mono',monospace;letter-spacing:.44em;color:var(--ink3);white-space:nowrap">M8FM FOUR-OP</div>
              </div>

              <!-- Main Sidebar Column -->
              <div data-scroll="1" style="flex:1;min-width:0;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:22px 20px 18px;display:flex;flex-direction:column;height:100%">
                
                <!-- MACHINE Header with Index -->
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="font:500 8px 'JetBrains Mono',monospace;letter-spacing:.3em;color:var(--ink3)">MACHINE</div>
                  <div style="flex:1;height:1px;background:var(--line);border-radius:1px"></div>
                  <div style="font:400 8px 'JetBrains Mono',monospace;letter-spacing:.14em;color:var(--ink3)">
                    ${String(mi + 1).padStart(2, '0')} / ${String(MACHINES.length).padStart(2, '0')}
                  </div>
                </div>

                <!-- Machine Title Dropdown Trigger & Popover -->
                <div data-mach-dropdown="1" style="flex:none;position:relative;margin:13px 0 0;z-index:30">
                  <button type="button" @click=${() => { this.machOpen = !this.machOpen; }}
                    style="display:flex;align-items:flex-start;gap:10px;width:100%;border:none;background:none;padding:0;cursor:pointer;text-align:left">
                    <div style="flex:1;min-width:0;font:700 32px/.92 'Space Grotesk',sans-serif;letter-spacing:-.042em;color:var(--ink);text-wrap:balance">
                      ${mach.name}
                    </div>
                    <div style="flex:none;margin-top:7px;color:${this.machOpen ? 'var(--ink)' : 'var(--ink3)'};transform:${this.machOpen ? 'rotate(180deg)' : 'rotate(0deg)'};transition:transform 260ms cubic-bezier(.16,1,.3,1),color 200ms ease">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 9l7 7 7-7" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                    </div>
                  </button>

                  <!-- Machine Dropdown Popover Overlay -->
                  <div style="position:absolute;left:-8px;right:-8px;top:100%;margin-top:11px;padding:7px;border-radius:20px;background:var(--gnd);box-shadow:0 22px 46px -24px rgba(16,16,16,.5),inset 0 0 0 1px var(--line2);display:flex;flex-direction:column;gap:2px;opacity:${this.machOpen ? 1 : 0};transform:${this.machOpen ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(.985)'};pointer-events:${this.machOpen ? 'auto' : 'none'};transform-origin:50% 0;transition:opacity 200ms ease,transform 280ms cubic-bezier(.16,1,.3,1);z-index:40">
                    ${MACHINES.map((m, idx) => {
                      const on = idx === mi;
                      return html`
                        <button type="button" @click=${() => { this.selectMachine(idx); this.machOpen = false; }}
                          style="display:flex;align-items:center;gap:6px;min-height:31px;border:none;background:transparent;padding:0 14px 0 3px;border-radius:999px;cursor:pointer;text-align:left;position:relative">
                          <div style="position:absolute;inset:0;border-radius:999px;background:var(--selbg);opacity:${on ? 1 : 0};transition:opacity 200ms ease;pointer-events:none"></div>
                          <div style="position:relative;flex:none;display:flex;align-items:center;justify-content:center;width:21px;height:21px;border-radius:50%;background:${on ? P.acc : 'transparent'};color:${on ? P.accFg : P.ink3};font:500 8px/1 'JetBrains Mono',monospace;letter-spacing:.04em">
                            ${String(idx + 1).padStart(2, '0')}
                          </div>
                          <div style="position:relative;font:${on ? '600' : '400'} 12.5px/1.2 'Space Grotesk',sans-serif;letter-spacing:-.012em;color:${on ? P.ink : P.ink2}">
                            ${m.name}
                          </div>
                        </button>
                      `;
                    })}
                  </div>
                </div>

                <!-- Active Mod Hint -->
                <div style="flex:none;font:400 11px/1.55 'Space Grotesk',sans-serif;color:var(--ink2);margin:11px 0 0;max-width:22em">
                  ${activeModHint}
                </div>

                <!-- PRESET Section -->
                <div style="flex:none;display:flex;align-items:center;gap:10px;margin:20px 0 0">
                  <div style="font:500 8px 'JetBrains Mono',monospace;letter-spacing:.3em;color:var(--ink3)">PRESET</div>
                  <div style="flex:1;height:1px;background:var(--line);border-radius:1px"></div>
                </div>
                <div data-scroll="1" style="flex:none;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;display:flex;flex-direction:column;gap:2px;margin:9px -6px 0;padding:0 6px;max-height:120px">
                  ${mach.presets.map((pr, idx) => {
                    const on = idx === pi;
                    return html`
                      <button type="button" @click=${() => this.selectPreset(idx)}
                        style="display:flex;align-items:center;gap:11px;min-height:31px;border:none;background:transparent;padding:0 14px 0 11px;border-radius:999px;cursor:pointer;text-align:left;position:relative">
                        <div style="position:absolute;inset:0;border-radius:999px;background:var(--selbg);opacity:${on ? 1 : 0};transition:opacity 200ms ease;pointer-events:none"></div>
                        <div style="position:relative;flex:none;width:7px;height:7px;border-radius:50%;background:var(--acc);opacity:${on ? 1 : 0};transition:opacity 220ms ease"></div>
                        <div style="position:relative;flex:1;min-width:0;font:${on ? '600' : '400'} 12.5px/1.2 'Space Grotesk',sans-serif;letter-spacing:-.012em;color:${on ? P.ink : P.ink2};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                          ${pr[0]}
                        </div>
                        <div style="position:relative;flex:none;font:400 8.5px/1 'JetBrains Mono',monospace;letter-spacing:.12em;color:${on ? P.ink2 : P.ink3}">
                          SLOT ${String(idx + 1).padStart(2, '0')}
                        </div>
                      </button>
                    `;
                  })}
                </div>

                <!-- PARAMETERS Section (Signature 4-Column Concentric Grid Cards) -->
                <div style="flex:none;display:flex;align-items:center;gap:10px;margin:20px 0 0">
                  <div style="font:500 8px 'JetBrains Mono',monospace;letter-spacing:.3em;color:var(--ink3)">PARAMETERS</div>
                  <div style="flex:1;height:1px;background:var(--line);border-radius:1px"></div>
                </div>
                <div style="flex:none;display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:9px 0 0">
                  ${[0, 1, 2, 3].map(i => {
                    const on = i === this.ring;
                    const v = vals[i];
                    const mod = mach.mods[i];
                    const short3 = mod ? mod[1] : '';
                    return html`
                      <button type="button"
                        @pointerdown=${(e: PointerEvent) => this.handleParamDrag(i, e)}
                        @wheel=${(e: WheelEvent) => { e.preventDefault(); this.setVal(i, Math.max(0, Math.min(100, this.getVal(mi, i) - e.deltaY * 0.12))); }}
                        @click=${() => { this.ring = i; }}
                        style="display:flex;flex-direction:column;align-items:center;gap:6px;min-height:70px;padding:10px 2px;border:none;border-radius:18px;background:transparent;cursor:ew-resize;touch-action:none;user-select:none;position:relative">
                        <div style="position:absolute;inset:0;border-radius:18px;background:var(--selbg);opacity:${on ? 1 : 0};transition:opacity 220ms ease;pointer-events:none"></div>
                        <!-- Concentric Circle Glyphs highlighting ring i -->
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="flex:none;overflow:visible">
                          <circle cx="12" cy="12" r="11" stroke="${i === 0 ? this.arc(0, on) : 'var(--line)'}" stroke-width="${i === 0 ? (on ? 2.6 : 2.0) : 1}"></circle>
                          <circle cx="12" cy="12" r="8.4" stroke="${i === 1 ? this.arc(1, on) : 'var(--line)'}" stroke-width="${i === 1 ? (on ? 2.6 : 2.0) : 1}"></circle>
                          <circle cx="12" cy="12" r="5.8" stroke="${i === 2 ? this.arc(2, on) : 'var(--line)'}" stroke-width="${i === 2 ? (on ? 2.6 : 2.0) : 1}"></circle>
                          <circle cx="12" cy="12" r="3.2" stroke="${i === 3 ? this.arc(3, on) : 'var(--line)'}" stroke-width="${i === 3 ? (on ? 2.6 : 2.0) : 1}"></circle>
                        </svg>
                        <div style="position:relative;font:${on ? '700' : '500'} 8px/1 'JetBrains Mono',monospace;letter-spacing:.1em;color:${on ? 'var(--ink)' : 'var(--ink3)'};transition:color 200ms ease">${short3}</div>
                        <div style="position:relative;font:${on ? '700' : '400'} 15px/1 'JetBrains Mono',monospace;letter-spacing:-.02em;color:${on ? 'var(--ink)' : 'var(--ink2)'};transition:color 200ms ease">${this.hx(v)}</div>
                      </button>
                    `;
                  })}
                </div>

                <!-- Bottom Area with Motion Drawer Popover & Controls -->
                <div style="flex:none;margin-top:auto;padding-top:20px;position:relative">
                  
                  <!-- Motion Drawer Popover -->
                  <div style="position:absolute;left:0;right:0;bottom:100%;margin-bottom:10px;padding:13px 14px 14px;border-radius:20px;background:var(--gnd);box-shadow:0 18px 40px -22px rgba(16,16,16,.45),inset 0 0 0 1px var(--line2);opacity:${this.motionOpen ? 1 : 0};transform:${this.motionOpen ? 'translateY(0)' : 'translateY(8px)'};pointer-events:${this.motionOpen ? 'auto' : 'none'};transition:opacity 220ms ease,transform 260ms cubic-bezier(.16,1,.3,1);z-index:25">
                    <div style="display:flex;align-items:center;gap:10px;margin:0 0 8px">
                      <div style="font:500 8px 'JetBrains Mono',monospace;letter-spacing:.3em;color:var(--ink3)">MOTION</div>
                      <div style="flex:1;height:1px;background:var(--line);border-radius:1px"></div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:3px">
                      ${[
                        { name: 'VIEW', key: 'view' as const, val: this.view, min: 0, max: 70, step: 1, unit: '°' },
                        { name: 'TILT', key: 'tilt' as const, val: this.tilt, min: 0, max: 22, step: 1, unit: '°' },
                        { name: 'SWAY', key: 'sway' as const, val: this.sway, min: 0, max: 10, step: 0.5, unit: '°' },
                        { name: 'SPIN', key: 'spin' as const, val: this.spin, min: 0, max: 120, step: 2, unit: 's' },
                        { name: 'PUSH', key: 'push' as const, val: this.push, min: 0, max: 70, step: 2, unit: 'px' },
                        { name: 'PULL', key: 'pull' as const, val: this.pull, min: 0, max: 260, step: 5, unit: 'px' }
                      ].map(mo => {
                        const fillPct = ((mo.val - mo.min) / (mo.max - mo.min) * 100).toFixed(1) + '%';
                        return html`
                          <button type="button"
                            @pointerdown=${(e: PointerEvent) => this.handleMotionDrag(mo.key, mo.min, mo.max, mo.step, e)}
                            style="display:flex;align-items:center;gap:11px;border:none;background:none;padding:0;cursor:ew-resize;text-align:left;touch-action:none;user-select:none">
                            <div style="position:relative;flex:1;min-width:0;height:28px;border-radius:999px;background:var(--soft);overflow:hidden;display:flex;align-items:center;padding:0 12px 0 28px">
                              <div style="position:absolute;left:0;top:0;bottom:0;width:${fillPct};border-radius:999px;background:var(--ink);opacity:.14"></div>
                              <div style="position:relative;font:500 8.5px/1 'JetBrains Mono',monospace;letter-spacing:.16em;color:var(--ink2)">${mo.name}</div>
                            </div>
                            <div style="flex:none;min-width:34px;text-align:right;font:400 12px/1 'JetBrains Mono',monospace;color:var(--ink2)">
                              ${mo.step < 1 ? mo.val.toFixed(1) : Math.round(mo.val)}${mo.unit}
                            </div>
                          </button>
                        `;
                      })}
                    </div>
                  </div>

                  <!-- Utility Bar -->
                  <div style="display:flex;align-items:center;gap:10px">
                    <button type="button" @click=${this.toggleDemo}
                      title="${this.isPlayingDemo ? 'Stop Demo' : 'Play Demo'}"
                      style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;flex:none;border:1px solid ${this.isPlayingDemo ? P.acc : P.line2};background:${this.isPlayingDemo ? P.acc : 'transparent'};color:${this.isPlayingDemo ? P.accFg : P.ink};border-radius:50%;cursor:pointer;font:400 10px/1 'JetBrains Mono',monospace;transition:all 160ms ease">
                      ${this.isPlayingDemo ? '■' : '▶'}
                    </button>

                    <div @pointerdown=${this.handleVolDrag} @wheel=${this.handleVolWheel}
                      style="flex:1;min-width:0;display:flex;align-items:center;gap:9px;cursor:ew-resize;touch-action:none;user-select:none">
                      <div style="flex:1;height:6px;border-radius:3px;background:var(--soft);position:relative">
                        <div style="position:absolute;left:0;top:0;bottom:0;width:${this.vol * 100}%;border-radius:3px;background:var(--ink);opacity:.8"></div>
                        <div style="position:absolute;top:-3px;left:${this.vol * 100}%;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:var(--gnd);box-shadow:inset 0 0 0 2px var(--ink)"></div>
                      </div>
                      <div style="font:400 14px/1 'Space Grotesk',sans-serif;font-variant-numeric:tabular-nums;color:var(--ink);width:18px;text-align:right">
                        ${Math.round(this.vol * 10)}
                      </div>
                    </div>

                    <button type="button" @click=${this.toggleTheme}
                      title="Theme: ${this.theme === 'ink' ? 'Ink (Monochrome) — Click for Machine Mood' : 'Machine Mood — Click for Ink'}"
                      style="flex:none;display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--line2);background:${this.theme === 'ink' ? 'rgba(220,217,198,.08)' : P.acc};color:${this.theme === 'ink' ? 'var(--ink)' : P.accFg};border-radius:50%;cursor:pointer;font:700 8px/1 'JetBrains Mono',monospace;letter-spacing:.05em;transition:all 180ms ease">
                      ${this.theme === 'ink' ? 'INK' : 'CLR'}
                    </button>

                    <button type="button" @click=${() => { this.motionOpen = !this.motionOpen; }}
                      title="Motion & View Options"
                      style="flex:none;display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid ${this.motionOpen ? P.acc : P.line2};background:${this.motionOpen ? P.acc : 'transparent'};color:${this.motionOpen ? P.accFg : P.ink3};border-radius:50%;cursor:pointer;font:400 12px/1 'JetBrains Mono',monospace;transition:all 180ms ease">
                      ◎
                    </button>
                  </div>

                  <!-- Exports -->
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:16px 0 0">
                    <button type="button" @click=${this.exportInstrument} title="Export M8 Instrument (.m8i)"
                      style="flex:1;border:1px solid var(--line2);background:none;color:var(--ink2);padding:8px 6px;border-radius:999px;cursor:pointer;font:500 8.5px 'JetBrains Mono',monospace;letter-spacing:.18em;transition:all 180ms ease">
                      .M8I
                    </button>
                    <button type="button" @click=${this.exportSong} title="Export M8 Song (.m8s)"
                      style="flex:1;border:1px solid var(--acc);background:var(--acc);color:var(--accFg);padding:8px 6px;border-radius:999px;cursor:pointer;font:500 8.5px 'JetBrains Mono',monospace;letter-spacing:.18em;transition:transform 180ms cubic-bezier(.23,1,.32,1)">
                      .M8S
                    </button>
                  </div>

                </div>

              </div>
            </div>

          </div>

          <!-- ==================== MOBILE LAYOUT (<=800px Orbit Meridian Mobile) ==================== -->
          <div class="mobile-view" style="display:none;width:100%;height:100%;overflow-y:auto;position:relative">
            
            <!-- Mobile Container styled like Orbit Meridian Mobile device frame -->
            <div style="width:100%;max-width:440px;margin:0 auto;height:100%;min-height:100%;display:flex;flex-direction:column;position:relative;background:var(--gnd)">
              
              <!-- Mobile Header -->
              <div style="flex:none;padding:18px 20px 0">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="font:500 8px 'JetBrains Mono',monospace;letter-spacing:.3em;color:var(--ink3)">MACHINE</div>
                  <div style="flex:1;height:1px;background:var(--line);border-radius:1px"></div>
                  <div style="font:400 8px 'JetBrains Mono',monospace;letter-spacing:.14em;color:var(--ink3)">
                    ${String(mi + 1).padStart(2, '0')} / ${String(MACHINES.length).padStart(2, '0')}
                  </div>
                </div>
                <button type="button" @click=${() => { this.mobileBrowseOpen = true; }}
                  style="display:flex;align-items:center;gap:12px;width:100%;border:none;background:none;padding:8px 0 0;cursor:pointer;text-align:left">
                  <div style="flex:1;min-width:0;font:700 28px/.92 'Space Grotesk',sans-serif;letter-spacing:-.042em;color:var(--ink)">
                    ${mach.name}
                  </div>
                  <div style="flex:none;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:var(--soft);font:400 13px/1 'JetBrains Mono',monospace;color:var(--ink2)">
                    ▾
                  </div>
                </button>
                <div style="font:400 11px/1.5 'Space Grotesk',sans-serif;color:var(--ink2);margin:8px 0 0">
                  ${activeModHint}
                </div>
              </div>

              <!-- Mobile 3D Dial Stage -->
              <div style="flex:none;position:relative;margin:0 0 4px">
                <div @pointerdown=${this.handleOrbitPointerDown}
                  style="flex:1;min-width:0;position:relative;aspect-ratio:1.18;cursor:grab;touch-action:none;user-select:none;perspective:1500px;perspective-origin:50% 50%"
                  data-stage="1">
                  <div style="position:absolute;inset:0;background-image:radial-gradient(var(--dotc) 1px,transparent 1px);background-size:9px 9px;opacity:.3;pointer-events:none"></div>
                  
                  <div style="position:absolute;inset:0;pointer-events:none;transform-style:preserve-3d;transform:rotateX(2deg)">
                    <div style="position:absolute;inset:0;pointer-events:none;transform-style:preserve-3d;animation:${this.orbitOf()};animation-play-state:${this.isDraggingRing ? 'paused' : 'running'}">
                      <div style="position:absolute;inset:0;pointer-events:none;transform-style:preserve-3d;animation:o-drift 38s linear infinite">
                        ${[0, 1, 2, 3].map(i => this.renderMobileRing(i, vals[i], i === this.ring))}
                      </div>
                    </div>
                  </div>

                  <div style="position:absolute;left:${eyeLeft};top:${eyeTop};transform:translate(-50%,-52%);display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none">
                    <div style="font:700 54px/1 'JetBrains Mono',monospace;letter-spacing:-.035em;color:var(--ink);animation:o-swell 6.2s ease-in-out infinite">
                      ${activeVal.toFixed(1)}
                    </div>
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="width:14px;height:1px;background:var(--line2)"></div>
                      <div style="font:500 9px/1 'JetBrains Mono',monospace;letter-spacing:.22em;color:var(--ink2)">
                        ${activeModName}
                      </div>
                      <div style="width:14px;height:1px;background:var(--line2)"></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Mobile Controls Section -->
              <div style="flex:1;min-height:0;display:flex;flex-direction:column;padding:0 20px 4px">
                
                <!-- 4-Column Parameter Cards -->
                <div style="flex:none;display:flex;align-items:center;gap:10px">
                  <div style="font:500 8px 'JetBrains Mono',monospace;letter-spacing:.3em;color:var(--ink3)">PARAMETERS</div>
                  <div style="flex:1;height:1px;background:var(--line);border-radius:1px"></div>
                  <div style="font:400 8px 'JetBrains Mono',monospace;letter-spacing:.14em;color:var(--ink3)">DRAG</div>
                </div>
                <div style="flex:none;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0 14px">
                  ${[0, 1, 2, 3].map(i => {
                    const on = i === this.ring;
                    const v = vals[i];
                    const mod = mach.mods[i];
                    const short3 = mod ? mod[1] : '';
                    return html`
                      <button type="button"
                        @pointerdown=${(e: PointerEvent) => this.handleParamDrag(i, e)}
                        @click=${() => { this.ring = i; }}
                        style="display:flex;flex-direction:column;align-items:center;gap:6px;min-height:72px;padding:9px 3px;border:none;border-radius:18px;background:transparent;cursor:ew-resize;touch-action:none;user-select:none;position:relative">
                        <div style="position:absolute;inset:0;border-radius:18px;background:var(--selbg);opacity:${on ? 1 : 0};transition:opacity 220ms ease;pointer-events:none"></div>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="flex:none;overflow:visible">
                          <circle cx="12" cy="12" r="11" stroke="${i === 0 ? this.arc(0, on) : 'var(--line)'}" stroke-width="${i === 0 ? (on ? 2.6 : 2.0) : 1}"></circle>
                          <circle cx="12" cy="12" r="8.4" stroke="${i === 1 ? this.arc(1, on) : 'var(--line)'}" stroke-width="${i === 1 ? (on ? 2.6 : 2.0) : 1}"></circle>
                          <circle cx="12" cy="12" r="5.8" stroke="${i === 2 ? this.arc(2, on) : 'var(--line)'}" stroke-width="${i === 2 ? (on ? 2.6 : 2.0) : 1}"></circle>
                          <circle cx="12" cy="12" r="3.2" stroke="${i === 3 ? this.arc(3, on) : 'var(--line)'}" stroke-width="${i === 3 ? (on ? 2.6 : 2.0) : 1}"></circle>
                        </svg>
                        <div style="font:${on ? '700' : '500'} 8.5px/1 'JetBrains Mono',monospace;letter-spacing:.12em;color:${on ? 'var(--ink)' : 'var(--ink3)'}">${short3}</div>
                        <div style="font:${on ? '700' : '400'} 15px/1 'JetBrains Mono',monospace;letter-spacing:-.02em;color:${on ? 'var(--ink)' : 'var(--ink2)'}">${this.hx(v)}</div>
                      </button>
                    `;
                  })}
                </div>

                <!-- Presets Row with Circular Badges -->
                <div style="flex:none;display:flex;align-items:center;gap:10px">
                  <div style="font:500 8px 'JetBrains Mono',monospace;letter-spacing:.3em;color:var(--ink3)">PRESET</div>
                  <div style="flex:1;height:1px;background:var(--line);border-radius:1px"></div>
                </div>
                <div style="flex:none;display:flex;align-items:center;gap:12px;margin:8px 0 0">
                  <div style="flex:1;min-width:0;font:600 15px/1.2 'Space Grotesk',sans-serif;letter-spacing:-.018em;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${mach.presets[pi][0]}
                  </div>
                  <div style="flex:none;display:flex;gap:6px">
                    ${mach.presets.map((pr, idx) => {
                      const on = idx === pi;
                      return html`
                        <button type="button" @click=${() => this.selectPreset(idx)} aria-label="${pr[0]}"
                          style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid ${on ? 'var(--acc)' : 'var(--line2)'};background:transparent;border-radius:50%;cursor:pointer;font:500 10px/1 'JetBrains Mono',monospace;letter-spacing:.06em;position:relative;transition:border-color 200ms ease">
                          <div style="position:absolute;inset:-1px;border-radius:50%;background:var(--acc);opacity:${on ? 1 : 0};transition:opacity 200ms ease;pointer-events:none"></div>
                          <div style="position:relative;color:${on ? 'var(--accFg)' : 'var(--ink2)'}">0${idx + 1}</div>
                        </button>
                      `;
                    })}
                  </div>
                </div>

              </div>

              <!-- Mobile Bottom Utility Bar -->
              <div style="flex:none;display:flex;flex-direction:column;gap:10px;padding:12px 20px 20px;border-top:1px solid var(--line);margin-top:auto">
                <div style="display:flex;align-items:center;gap:12px">
                  <button type="button" @click=${this.toggleDemo}
                    style="display:flex;align-items:center;justify-content:center;width:42px;height:42px;flex:none;border:1px solid ${this.isPlayingDemo ? P.acc : P.line2};background:${this.isPlayingDemo ? P.acc : 'transparent'};color:${this.isPlayingDemo ? P.accFg : P.ink};border-radius:50%;cursor:pointer;font:400 11px/1 'JetBrains Mono',monospace;transition:all 140ms ease">
                    ${this.isPlayingDemo ? '■' : '▶'}
                  </button>
                  <div @pointerdown=${this.handleVolDrag}
                    style="flex:1;min-width:0;display:flex;align-items:center;gap:10px;cursor:ew-resize;touch-action:none;user-select:none">
                    <div style="flex:1;height:6px;border-radius:3px;background:var(--soft);position:relative">
                      <div style="position:absolute;left:0;top:0;bottom:0;width:${this.vol * 100}%;border-radius:3px;background:var(--ink);opacity:.8"></div>
                      <div style="position:absolute;top:-4px;left:${this.vol * 100}%;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--gnd);box-shadow:inset 0 0 0 2px var(--ink)"></div>
                    </div>
                    <div style="font:400 14px/1 'Space Grotesk',sans-serif;color:var(--ink);width:20px;text-align:right">
                      ${Math.round(this.vol * 10)}
                    </div>
                  </div>
                  <button type="button" @click=${this.toggleTheme}
                    style="flex:none;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--line2);background:${this.theme === 'ink' ? 'rgba(220,217,198,.08)' : P.acc};color:${this.theme === 'ink' ? 'var(--ink)' : P.accFg};border-radius:50%;cursor:pointer;font:700 8.5px/1 'JetBrains Mono',monospace">
                    ${this.theme === 'ink' ? 'INK' : 'CLR'}
                  </button>
                </div>
                <div style="display:flex;gap:8px">
                  <button type="button" @click=${this.exportInstrument}
                    style="flex:1;border:1px solid var(--line2);background:none;color:var(--ink2);height:40px;border-radius:999px;cursor:pointer;font:500 9px 'JetBrains Mono',monospace;letter-spacing:.18em">
                    .M8I
                  </button>
                  <button type="button" @click=${this.exportSong}
                    style="flex:1;border:1px solid var(--acc);background:var(--acc);color:var(--accFg);height:40px;border-radius:999px;cursor:pointer;font:500 9px 'JetBrains Mono',monospace;letter-spacing:.18em">
                    .M8S
                  </button>
                </div>
              </div>

              <!-- Mobile Bottom Sheet Drawer for Machine Selection -->
              <div style="position:fixed;inset:0;pointer-events:${this.mobileBrowseOpen ? 'auto' : 'none'};background:rgba(16,16,16,${this.mobileBrowseOpen ? 0.5 : 0});transition:background-color 260ms ease;z-index:90"
                @click=${() => { this.mobileBrowseOpen = false; }}></div>
              <div style="position:fixed;left:0;right:0;bottom:0;max-width:440px;margin:0 auto;transform:${this.mobileBrowseOpen ? 'translateY(0)' : 'translateY(105%)'};transition:transform 380ms cubic-bezier(.16,1,.3,1);background:var(--gnd);border-radius:30px 30px 0 0;box-shadow:0 -20px 50px -24px rgba(16,16,16,.4),0 0 0 1px var(--line2);padding:18px 20px 30px;pointer-events:${this.mobileBrowseOpen ? 'auto' : 'none'};z-index:100">
                <div style="display:flex;align-items:center;gap:10px;padding:0 4px 12px">
                  <div style="font:500 8px 'JetBrains Mono',monospace;letter-spacing:.3em;color:var(--ink3)">SELECT MACHINE</div>
                  <div style="flex:1;height:1px;background:var(--line);border-radius:1px"></div>
                  <button type="button" @click=${() => { this.mobileBrowseOpen = false; }}
                    style="flex:none;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border:none;border-radius:50%;background:var(--soft);color:var(--ink2);cursor:pointer;font:400 13px/1 'JetBrains Mono',monospace">✕</button>
                </div>
                <div style="display:flex;flex-direction:column;gap:3px">
                  ${MACHINES.map((m, idx) => {
                    const on = idx === mi;
                    return html`
                      <button type="button" @click=${() => { this.selectMachine(idx); this.mobileBrowseOpen = false; }}
                        style="display:flex;align-items:center;gap:9px;min-height:42px;border:none;background:${on ? 'var(--selbg)' : 'transparent'};padding:0 16px 0 5px;border-radius:999px;cursor:pointer;text-align:left;transition:background-color 200ms ease-out">
                        <div style="flex:none;display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:${on ? 'var(--acc)' : 'transparent'};color:${on ? 'var(--accFg)' : 'var(--ink3)'};font:500 8.5px/1 'JetBrains Mono',monospace;letter-spacing:.04em">
                          ${String(idx + 1).padStart(2, '0')}
                        </div>
                        <div style="font:${on ? '600' : '400'} 13.5px/1.2 'Space Grotesk',sans-serif;letter-spacing:-.014em;color:${on ? 'var(--ink)' : 'var(--ink2)'}">
                          ${m.name}
                        </div>
                      </button>
                    `;
                  })}
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    `;
  }
}
