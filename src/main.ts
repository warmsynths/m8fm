import { LitElement, html, svg, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import './style.css';
import { AudioController } from './audio/AudioController';
import { AnchorMacroConfig, type AnchorName } from './audio/MacroMapper';
import { MACHINES } from './ui/MachineData';
import { SysExParser, type Dx7Patch } from './audio/SysExParser';
import { DX7ToM8Translator } from './audio/DX7ToM8Translator';

const audio = new AudioController();

function getVars(v: number) {
  const u = v / 100;
  return {
    '--dur': (3.4 - u * 1.9).toFixed(2) + 's',
    '--amp': (u * 2.3).toFixed(2) + 'px',
    '--big': (1 + u * 0.5).toFixed(3),
    '--wide': (1 + u * 0.42).toFixed(3),
    '--small': (1 - u * 0.45).toFixed(3),
    '--tight': (1 - u * 0.3).toFixed(3),
    '--dim': (1 - u * 0.85).toFixed(3),
    '--re': (1 + u * 0.26).toFixed(3),
    '--beam': (26 * u).toFixed(1) + 'px',
    '--tilt': (u * 7).toFixed(1) + 'deg'
  };
}

@customElement('fm-studio')
export class FmStudio extends LitElement {
  
  // Since we rely on global styles (like keyframes and fonts)
  // we render into light DOM.
  createRenderRoot() {
    return this;
  }

  @state() accessor sel = 0;
  @state() accessor preset = 0;
  @state() accessor v: Record<string, number> = {};
  @state() accessor dirty = false;
  @state() accessor adv = false;
  @state() accessor advMod = false;
  @state() accessor vol = 0.5;

  @state() accessor dx7Patches: Dx7Patch[] = [];
  @state() accessor dx7Sel = 0;
  @state() accessor dx7Adv = false;
  @state() accessor dx7ManualOps: Set<number> = new Set();
  @state() accessor fullDx7Mode: boolean = false;

  connectedCallback() {
    super.connectedCallback();
    this.selectMachine(0);
  }

  getVal(mi: number, i: number) {
    const m = MACHINES[mi];
    const key = m.id + i;
    return this.v[key] !== undefined ? this.v[key] : m.presets[this.preset % m.presets.length][1][i];
  }

  setVal(i: number, nv: number) {
    const key = MACHINES[this.sel].id + i;
    this.v = { ...this.v, [key]: nv };
    this.dirty = true;
    
    const m = MACHINES[this.sel];
    const macroName = AnchorMacroConfig[m.name as AnchorName][i];
    audio.setMacro(macroName, nv / 100);
  }

  selectMachine(idx: number) {
    this.sel = idx;
    this.preset = 0;
    this.v = {};
    this.dirty = false;
    
    const m = MACHINES[idx];
    audio.loadAnchor(m.name as AnchorName);
    
    for (let i = 0; i < m.mods.length; i++) {
      const val = this.getVal(idx, i);
      const macroName = AnchorMacroConfig[m.name as AnchorName][i];
      audio.setMacro(macroName, val / 100);
    }
  }

  async handleSyxUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const buffer = await file.arrayBuffer();
    try {
      this.dx7Patches = SysExParser.parseFile(buffer);
      this.selectDx7Patch(0);
    } catch (err) {
      alert(err);
    }
    input.value = ''; // Reset so the same file can be loaded again
  }

  selectDx7Patch(idx: number) {
    if (this.dx7Patches.length === 0) return;
    this.dx7Sel = idx;
    const patch = this.dx7Patches[idx];
    const keepIndices = this.dx7ManualOps.size === 4 ? Array.from(this.dx7ManualOps) : undefined;
    const { m8Params, fullParams } = DX7ToM8Translator.translate(patch, keepIndices);
    audio.loadRawParams(this.fullDx7Mode ? fullParams : m8Params);
  }
  
  toggleFullDx7Mode() {
    this.fullDx7Mode = !this.fullDx7Mode;
    this.selectDx7Patch(this.dx7Sel);
  }
  
  toggleDx7Op(opIndex: number) {
    const newSet = new Set(this.dx7ManualOps);
    if (newSet.has(opIndex)) {
      newSet.delete(opIndex);
    } else {
      if (newSet.size >= 4) {
        // Remove the first one added to keep max 4
        newSet.delete(Array.from(newSet)[0]);
      }
      newSet.add(opIndex);
    }
    this.dx7ManualOps = newSet;
    this.selectDx7Patch(this.dx7Sel);
  }

  selectPreset(idx: number) {
    this.preset = idx;
    this.v = {};
    this.dirty = false;
    
    const m = MACHINES[this.sel];
    for (let i = 0; i < m.mods.length; i++) {
      const val = this.getVal(this.sel, i);
      const macroName = AnchorMacroConfig[m.name as AnchorName][i];
      audio.setMacro(macroName, val / 100);
    }
  }

  downloadM8Instrument() {
    if (this.dx7Patches.length > 0) {
      // ALWAYS export M8 params (4-op), never the full 6-op ones
      const patch = this.dx7Patches[this.dx7Sel];
      const keepIndices = this.dx7ManualOps.size === 4 ? Array.from(this.dx7ManualOps) : undefined;
      const { m8Params } = DX7ToM8Translator.translate(patch, keepIndices);
      audio.loadRawParams(m8Params); // Temporarily load the M8 version if we are in full mode
      audio.exportPatch('Patch.m8i');
      if (this.fullDx7Mode) {
        // Restore full mode
        this.selectDx7Patch(this.dx7Sel);
      }
    } else {
      audio.exportPatch('Patch.m8i');
    }
    console.log('Exported .m8i patch');
  }

  handleDown(e: PointerEvent, index: number, horiz: boolean) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    const p0 = horiz ? e.clientX : e.clientY;
    const v0 = this.getVal(this.sel, index);
    
    const move = (ev: PointerEvent) => {
      const d = horiz ? (ev.clientX - p0) * 0.42 : (p0 - ev.clientY) * 0.55;
      this.setVal(index, Math.max(0, Math.min(100, v0 + d)));
    };
    const up = () => { 
      window.removeEventListener('pointermove', move); 
      window.removeEventListener('pointerup', up); 
    };
    window.addEventListener('pointermove', move); 
    window.addEventListener('pointerup', up);
  }

  handleWheel(e: WheelEvent, index: number) {
    e.preventDefault();
    this.setVal(index, Math.max(0, Math.min(100, this.getVal(this.sel, index) - e.deltaY * 0.12)));
  }

  handleVolDown(e: PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    const p0 = e.clientX;
    const v0 = this.vol;
    
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - p0) * 0.005;
      this.vol = Math.max(0, Math.min(1, v0 + d));
      audio.setVolume(this.vol);
    };
    const up = () => { 
      window.removeEventListener('pointermove', move); 
      window.removeEventListener('pointerup', up); 
    };
    window.addEventListener('pointermove', move); 
    window.addEventListener('pointerup', up);
  }

  handleVolWheel(e: WheelEvent) {
    e.preventDefault();
    this.vol = Math.max(0, Math.min(1, this.vol - e.deltaY * 0.001));
    audio.setVolume(this.vol);
  }
  
  renderPaths(paths: any[]) {
    const shadow = paths.map(p => svg`<path d="${p.d}" stroke-width="${p.w}" stroke-linecap="${p.c}" stroke-linejoin="${p.c === 'round' ? 'round' : 'miter'}" stroke-dasharray="${p.s}" style="${p.style}" stroke="url(#checker)" transform="translate(1.5, 1.5)" opacity="0.7"></path>`);
    const main = paths.map(p => svg`<path d="${p.d}" stroke-width="${p.w}" stroke-linecap="${p.c}" stroke-linejoin="${p.c === 'round' ? 'round' : 'miter'}" stroke-dasharray="${p.s}" style="${p.style}" stroke="currentColor"></path>`);
    return [...shadow, ...main];
  }

  render() {
    const mi = this.sel;
    const mach = MACHINES[mi];
    const pi = this.preset % mach.presets.length;
    const vals = mach.mods.map((_, i) => this.getVal(mi, i));
    return html`
      <div id="app">
        <svg width="0" height="0" style="position:absolute;visibility:hidden">
          <defs>
            <pattern id="checker" width="2" height="2" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="1" height="1" fill="currentColor"/>
              <rect x="1" y="1" width="1" height="1" fill="currentColor"/>
            </pattern>
          </defs>
        </svg>
        <!-- Desktop Layout -->
        <div class="desktop-view" style="width:820px;flex:none;background:#e2e0dc;border:1px solid rgba(0,0,0,.12);border-radius:7px;overflow:hidden;flex-direction:column;max-height:100%">
          
          <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 18px;border-bottom:1px solid rgba(0,0,0,.12)">
            <div style="display:flex;align-items:center;gap:9px">
              <div style="width:8px;height:8px;border-radius:50%;background:#17170f"></div>
              <div style="font:500 10.5px 'JetBrains Mono',monospace;letter-spacing:.18em">FM LAYER</div>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <div @pointerdown=${this.handleVolDown} @wheel=${this.handleVolWheel} style="display:flex;align-items:center;gap:8px;padding:5px 9px;border:1px solid rgba(0,0,0,.15);border-radius:4px;cursor:ew-resize;user-select:none;touch-action:none">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#17170f" stroke-width="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
                <div style="width:40px;height:4px;background:rgba(23,23,15,.16);border-radius:2px;overflow:hidden">
                  <div style="height:100%;width:${this.vol * 100}%;background:#17170f"></div>
                </div>
                <div style="font:500 10px 'JetBrains Mono',monospace;color:#17170f;width:24px;text-align:right">${Math.round(this.vol * 100)}</div>
              </div>
              <!-- Hidden DX7 stuff -->
              <input type="file" id="syx-upload" accept=".syx" style="display:none" @change=${this.handleSyxUpload} />
              <button type="button" @click=${() => this.renderRoot.querySelector('#syx-upload')?.dispatchEvent(new MouseEvent('click'))} style="display:none; border:1px solid #101010;background:transparent;color:#101010;padding:8px 13px;border-radius:4px;cursor:pointer;font:500 10px 'JetBrains Mono',monospace;letter-spacing:.14em;white-space:nowrap">LOAD .SYX</button>
              <button type="button" @click=${this.downloadM8Instrument} style="border:1px solid #101010;background:#101010;color:#fff;padding:8px 13px;border-radius:4px;cursor:pointer;font:500 10px 'JetBrains Mono',monospace;letter-spacing:.14em;white-space:nowrap">COPY TO M8</button>
            </div>
          </div>
          
          ${false && this.dx7Patches.length > 0 ? html`
          <div style="padding:16px 18px;border-bottom:1px solid rgba(0,0,0,.12);background:#dcd9c6;display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <div style="font:700 14px 'Space Grotesk',sans-serif">DX7 Bank Loaded (${this.dx7Patches.length} patches)</div>
              <button type="button" @click=${() => { this.dx7Patches = []; this.selectMachine(0); }} style="background:none;border:none;cursor:pointer;font:500 10px 'JetBrains Mono',monospace;text-decoration:underline">CLOSE</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:6px">
              ${this.dx7Patches.map((p, i) => html`
                <button type="button" @click=${() => this.selectDx7Patch(i)} style="padding:6px;border:1px solid ${i === this.dx7Sel ? '#17170f' : 'rgba(0,0,0,.12)'};background:${i === this.dx7Sel ? '#17170f' : '#fff'};color:${i === this.dx7Sel ? '#fff' : '#17170f'};border-radius:4px;cursor:pointer;font:500 10px 'JetBrains Mono',monospace;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  ${String(i + 1).padStart(2, '0')}. ${p.name}
                </button>
              `)}
            </div>
            
            <div style="display:flex;align-items:center;gap:16px;margin-top:4px">
              <button type="button" @click=${() => this.dx7Adv = !this.dx7Adv} style="background:none;border:none;padding:0;cursor:pointer;font:500 10px 'JetBrains Mono',monospace;letter-spacing:.16em;color:rgba(0,0,0,.5);display:flex;align-items:center;gap:7px;width:fit-content">
                <span style="display:inline-block;width:0;height:0;border-left:5px solid currentColor;border-top:4px solid transparent;border-bottom:4px solid transparent;transform:rotate(${this.dx7Adv ? '90deg' : '0deg'})"></span>ADVANCED DX7 ROUTING
              </button>
              
              <div style="display:flex;align-items:center;gap:8px">
                <div style="font:500 10px 'JetBrains Mono',monospace;letter-spacing:.16em;color:rgba(0,0,0,.5)">PREVIEW MODE:</div>
                <button type="button" @click=${this.toggleFullDx7Mode} style="background:${this.fullDx7Mode ? 'transparent' : '#17170f'};border:1px solid ${this.fullDx7Mode ? 'rgba(0,0,0,.15)' : '#17170f'};color:${this.fullDx7Mode ? '#17170f' : '#fff'};padding:4px 8px;border-radius:3px;cursor:pointer;font:500 10px 'JetBrains Mono',monospace">M8</button>
                <button type="button" @click=${this.toggleFullDx7Mode} style="background:${this.fullDx7Mode ? '#17170f' : 'transparent'};border:1px solid ${this.fullDx7Mode ? '#17170f' : 'rgba(0,0,0,.15)'};color:${this.fullDx7Mode ? '#fff' : '#17170f'};padding:4px 8px;border-radius:3px;cursor:pointer;font:500 10px 'JetBrains Mono',monospace">FULL DX7</button>
              </div>
            </div>
            
            ${this.dx7Adv ? html`
              <div style="background:rgba(255,255,255,0.4);border-radius:4px;padding:12px;display:flex;flex-direction:column;gap:8px">
                <div style="font:400 10px 'JetBrains Mono',monospace;color:rgba(0,0,0,.6)">Select 4 operators to extract (heuristic is used if less than 4 selected).</div>
                <div style="display:flex;gap:6px">
                  ${[1, 2, 3, 4, 5, 6].map(num => {
                    const idx = num - 1; // 0=Op1
                    const isSel = this.dx7ManualOps.has(idx);
                    return html`
                      <button type="button" @click=${() => this.toggleDx7Op(idx)} style="flex:1;padding:8px 0;border:1px solid ${isSel ? '#17170f' : 'rgba(0,0,0,.15)'};background:${isSel ? '#17170f' : 'transparent'};color:${isSel ? '#fff' : '#17170f'};border-radius:3px;cursor:pointer;font:500 11px 'JetBrains Mono',monospace">OP${num}</button>
                    `;
                  })}
                </div>
              </div>
            ` : nothing}
          </div>
          ` : nothing}

          <div style="display:flex;flex:1;min-height:0;${this.dx7Patches.length > 0 ? 'opacity:0.3;pointer-events:none' : ''}">
            <div style="width:186px;flex:none;border-right:1px solid rgba(0,0,0,.12);padding:14px 12px;display:flex;flex-direction:column;gap:7px;overflow-y:auto">
              <div style="font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.16em;color:rgba(0,0,0,.4);margin-bottom:2px">MACHINE</div>
              ${MACHINES.map((m, idx) => {
                const isSel = idx === mi;
                const bg = isSel ? '#17170f' : 'transparent';
                const fg = isSel ? '#dcd9c6' : 'rgba(0,0,0,.55)';
                const border = isSel ? '#17170f' : 'rgba(0,0,0,.16)';
                const vars = isSel ? getVars(70) : getVars(0);
                return html`
                  <button type="button" @click=${() => this.selectMachine(idx)} style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid ${border};background:${bg};border-radius:4px;cursor:pointer;text-align:left">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style=${styleMap({ color: fg, ...vars as any })}>
                      ${this.renderPaths(m.icon)}
                    </svg>
                    <div style="flex:1;font:500 11.5px/1.2 'Space Grotesk',sans-serif;color:${fg}">${m.name}</div>
                  </button>
                `;
              })}
              

            </div>

            <div style="flex:1;padding:16px 18px 18px;overflow-y:auto">
              
              <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px">
                ${mach.presets.map((pr, idx) => {
                  const isSel = idx === pi;
                  const bg = isSel ? '#101010' : '#e2e0dc';
                  const fg = isSel ? '#fff' : 'rgba(0,0,0,.65)';
                  const border = isSel ? '#101010' : 'rgba(0,0,0,.18)';
                  return html`
                    <button type="button" @click=${() => this.selectPreset(idx)} style="border:1px solid ${border};background:${bg};color:${fg};padding:9px 16px;border-radius:20px;cursor:pointer;font:500 12px 'Space Grotesk',sans-serif;white-space:nowrap;transition:transform 150ms cubic-bezier(.23,1,.32,1),background-color 150ms ease,border-color 150ms ease">${pr[0]}</button>
                  `;
                })}
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                ${mach.mods.map((m, i) => {
                  const v = vals[i];
                  const pct = v.toFixed(1) + '%';
                  const vars = getVars(v);
                  
                  return html`
                    <div @pointerdown=${(e: PointerEvent) => this.handleDown(e, i, false)} @wheel=${(e: WheelEvent) => this.handleWheel(e, i)} style="display:flex;height:150px;border-radius:5px;overflow:hidden;border:1px solid rgba(0,0,0,.18);cursor:ns-resize;touch-action:none;user-select:none">
                      <div style="flex:1;background:#17170f;padding:13px;display:flex;flex-direction:column;justify-content:space-between">
                        <div>
                          <div style="font:500 11.5px/1.2 'JetBrains Mono',monospace;letter-spacing:.06em;color:#dcd9c6;white-space:pre-line">${m[0]}</div>
                          <div style="font:400 10px/1.45 'Space Grotesk',sans-serif;color:rgba(220,217,198,.42);margin-top:6px">${m[1]}</div>
                        </div>
                        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" style=${styleMap({ color: '#dcd9c6', ...vars as any })}>
                          ${this.renderPaths((m[2] as (v: number) => any[])(v / 100))}
                        </svg>
                      </div>
                      <div style="width:104px;background:#e6e3d4;padding:13px;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end">
                        <div style="font:700 30px/1 'JetBrains Mono',monospace;letter-spacing:-.02em;color:#17170f">${v.toFixed(1)}</div>
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;width:100%">
                          <div style="font:500 11px 'JetBrains Mono',monospace;color:rgba(23,23,15,.45)">${(1 + Math.round(v / 100 * 7)) + '.' + String(Math.round(v * 2) % 1000).padStart(3, '0')}</div>
                          <div style="width:100%;height:5px;background:rgba(23,23,15,.16)"><div style="height:5px;width:${pct};background:#17170f"></div></div>
                        </div>
                      </div>
                    </div>
                  `;
                })}
              </div>
              
              <button type="button" @click=${() => this.adv = !this.adv} style="margin-top:14px;background:none;border:none;padding:0;cursor:pointer;font:500 10px 'JetBrains Mono',monospace;letter-spacing:.16em;color:rgba(0,0,0,.5);display:flex;align-items:center;gap:7px">
                <span style="display:inline-block;width:0;height:0;border-left:5px solid currentColor;border-top:4px solid transparent;border-bottom:4px solid transparent;transform:rotate(${this.adv ? '90deg' : '0deg'})"></span>FM PARAMETERS
              </button>
              
              ${this.adv ? html`
                ${(() => {
                  const fm = audio.getFmParams();
                  const hx = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).toUpperCase().padStart(2, '0');
                  const ALGO_MAP: Record<string, string> = { ep:'A>B+C>D', sb:'A>B>C>D', ml:'A+B>C>D', pd:'(A+B)>(C+D)', dg:'A>B>C+D', vl:'A>B+C+D' };
                  const DEST_COL = ['B', 'C', 'D', 'D'];

                  const m8Ops = fm?.operators ? [fm.operators[0], fm.operators[1], fm.operators[2], fm.operators[3]] : [];
                  const getShapeStr = (shape?: string) => {
                    if (shape === 'square') return 'SQR';
                    if (shape === 'sawtooth') return 'SAW';
                    if (shape === 'triangle') return 'TRI';
                    return 'SIN';
                  };

                  const fmAlgo = ALGO_MAP[mach.id] || (fm?.algorithm === 1 ? 'A>B>C>D' : fm?.algorithm === 2 ? 'A>B+C>D' : 'A+B+C>D');
                  
                  const fmOps = ['A','B','C','D'].map((id, i) => {
                    const opObj = m8Ops[i];
                    const levVal = opObj?.level !== undefined ? opObj.level * 255 : 0;
                    const ratioVal = opObj?.ratio !== undefined ? opObj.ratio : 1.0;
                    const fbVal = i === 0 ? (fm?.feedback !== undefined ? fm.feedback * 63 : 0) : 0;
                    return {
                      id,
                      wave: getShapeStr(opObj?.shape),
                      ratio: ratioVal.toFixed(2),
                      lev: hx(levVal),
                      fb: hx(fbVal),
                      mod: (() => { const j = DEST_COL.indexOf(id); return j === -1 ? '----' : (j + 1) + '\u25b8LEV'; })()
                    };
                  });

                  const fmModRows = mach.mods.map((_, i) => {
                    const amtVal = i === 0 ? (fm?.env1?.amount ?? 1) * 255
                                 : i === 1 ? (fm?.env2?.amount ?? 0) * 255
                                 : i === 2 ? (fm?.lfo1?.amount ?? 0) * 255
                                 : (fm?.lfo2?.amount ?? 0) * 255;
                    return {
                      idx: i + 1,
                      pct: (amtVal / 2.55).toFixed(1) + '%',
                      label: hx(amtVal)
                    };
                  });

                  const fmFilterChips = [
                    { name: 'TYPE', val: mach.id === 'vl' ? 'LP' : 'OFF' },
                    { name: 'CUTOFF', val: mach.id === 'vl' ? hx(vals[2] * 2.55) : 'FF' },
                    { name: 'RES', val: '00' }
                  ];

                  const fmOutChips = [
                    { name: 'AMP', val: hx((vals[0] || 70) * 2.55) },
                    { name: 'LIM', val: '00' },
                    { name: 'PAN', val: hx((vals[1] || 50) * 2.55) },
                    { name: 'DRY', val: hx(255) },
                    { name: 'CHO', val: hx((vals[2] || 0) * 0.8) },
                    { name: 'DEL', val: hx(0) },
                    { name: 'REV', val: hx((vals[3] || 0) * 1.2) }
                  ];

                  return html`
                    <div style="margin-top:11px;padding:15px 16px;background:#e6e3d4;border:1px solid rgba(0,0,0,.12);border-radius:5px">
                      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:22px;flex-wrap:wrap">
                        <div style="display:flex;align-items:baseline;gap:10px">
                          <div style="font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.14em;color:rgba(23,23,15,.4)">ALGO</div>
                          <div style="font:700 15px 'JetBrains Mono',monospace;color:#17170f">${fmAlgo}</div>
                        </div>
                        <div style="display:flex;gap:24px;flex-wrap:wrap">
                          <div style="display:flex;flex-direction:column;gap:6px">
                            <div style="font:500 8px 'JetBrains Mono',monospace;letter-spacing:.14em;color:rgba(23,23,15,.32)">FILTER</div>
                            <div style="display:flex;gap:14px">
                              ${fmFilterChips.map(c => html`
                                <div style="display:flex;flex-direction:column;gap:2px">
                                  <div style="font:400 8.5px 'JetBrains Mono',monospace;letter-spacing:.12em;color:rgba(23,23,15,.4)">${c.name}</div>
                                  <div style="font:500 13px 'JetBrains Mono',monospace;color:#17170f">${c.val}</div>
                                </div>
                              `)}
                            </div>
                          </div>
                          <div style="display:flex;flex-direction:column;gap:6px">
                            <div style="font:500 8px 'JetBrains Mono',monospace;letter-spacing:.14em;color:rgba(23,23,15,.32)">OUTPUT</div>
                            <div style="display:flex;gap:14px;flex-wrap:wrap">
                              ${fmOutChips.map(c => html`
                                <div style="display:flex;flex-direction:column;gap:2px">
                                  <div style="font:400 8.5px 'JetBrains Mono',monospace;letter-spacing:.12em;color:rgba(23,23,15,.4)">${c.name}</div>
                                  <div style="font:500 13px 'JetBrains Mono',monospace;color:#17170f">${c.val}</div>
                                </div>
                              `)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style="display:flex;gap:1px;background:rgba(0,0,0,.1);margin-top:14px;border-radius:4px;overflow:hidden">
                        ${fmOps.map(o => html`
                          <div style="flex:1;background:#e6e3d4;padding:10px 12px">
                            <div style="font:700 12px 'JetBrains Mono',monospace;letter-spacing:.06em;color:#17170f;margin-bottom:8px">OP ${o.id}</div>
                            <div style="display:flex;flex-direction:column;gap:5px">
                              <div style="display:flex;justify-content:space-between"><span style="font:400 9.5px 'JetBrains Mono',monospace;color:rgba(23,23,15,.4)">WAVE</span><span style="font:500 11.5px 'JetBrains Mono',monospace;color:#17170f">${o.wave}</span></div>
                              <div style="display:flex;justify-content:space-between"><span style="font:400 9.5px 'JetBrains Mono',monospace;color:rgba(23,23,15,.4)">RATIO</span><span style="font:700 11.5px 'JetBrains Mono',monospace;color:#17170f">${o.ratio}</span></div>
                              <div style="display:flex;justify-content:space-between"><span style="font:400 9.5px 'JetBrains Mono',monospace;color:rgba(23,23,15,.4)">LEVEL</span><span style="font:700 11.5px 'JetBrains Mono',monospace;color:#17170f">${o.lev}</span></div>
                              <div style="display:flex;justify-content:space-between"><span style="font:400 9.5px 'JetBrains Mono',monospace;color:rgba(23,23,15,.4)">FB</span><span style="font:500 11.5px 'JetBrains Mono',monospace;color:#17170f">${o.fb}</span></div>
                              <div style="display:flex;justify-content:space-between"><span style="font:400 9.5px 'JetBrains Mono',monospace;color:rgba(23,23,15,.4)">MOD</span><span style="font:500 11.5px 'JetBrains Mono',monospace;color:#17170f">${o.mod}</span></div>
                            </div>
                          </div>
                        `)}
                      </div>

                      <div style="display:flex;flex-direction:column;margin-top:14px;border-top:1px solid rgba(0,0,0,.1)">
                        ${fmModRows.map(m => html`
                          <div style="display:flex;align-items:center;gap:12px;padding:9px 2px;border-bottom:1px solid rgba(0,0,0,.08)">
                            <div style="width:18px;height:18px;border-radius:50%;background:#17170f;color:#dcd9c6;font:600 9.5px 'JetBrains Mono',monospace;display:flex;align-items:center;justify-content:center;flex:none">${m.idx}</div>
                            <div style="width:70px;font:500 12px 'JetBrains Mono',monospace;color:rgba(23,23,15,.55)">MOD${m.idx}</div>
                            <div style="flex:1;height:5px;background:rgba(0,0,0,.1);border-radius:3px;overflow:hidden"><div style="height:5px;width:${m.pct};background:#17170f"></div></div>
                            <div style="width:44px;text-align:right;font:700 12.5px 'JetBrains Mono',monospace;color:#17170f">${m.label}</div>
                          </div>
                        `)}
                      </div>
                    </div>
                  `;
                })()}
              ` : nothing}

              <button type="button" @click=${() => this.advMod = !this.advMod} style="margin-top:11px;flex:none;background:none;border:none;padding:0;cursor:pointer;font:500 10px 'JetBrains Mono',monospace;letter-spacing:.16em;color:rgba(0,0,0,.5);display:flex;align-items:center;gap:7px">
                <span style="display:inline-block;width:0;height:0;border-left:5px solid currentColor;border-top:4px solid transparent;border-bottom:4px solid transparent;transform:rotate(${this.advMod ? '90deg' : '0deg'})"></span>MODULATORS
              </button>

              ${this.advMod ? html`
                ${(() => {
                  const fm = audio.getFmParams();
                  const hx = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).toUpperCase().padStart(2, '0');
                  
                  const getModDest = (i: number) => {
                    if (i === 0) return (fm?.env1?.dest && fm.env1.dest !== 'none') ? fm.env1.dest.toUpperCase() : 'VOLUME';
                    if (i === 1) return (fm?.env2?.dest && fm.env2.dest !== 'none') ? fm.env2.dest.toUpperCase() : (mach.id === 'sb' || mach.id === 'dg' ? 'PITCH' : mach.id === 'vl' ? 'MOD 2' : 'MOD 4');
                    if (i === 2) return (fm?.lfo1?.dest && fm.lfo1.dest !== 'none') ? fm.lfo1.dest.toUpperCase() : (mach.id === 'ep' ? 'VOLUME' : mach.id === 'pd' ? 'PITCH' : mach.id === 'dg' ? 'MOD 1' : 'OFF');
                    return (fm?.lfo2?.dest && fm.lfo2.dest !== 'none') ? fm.lfo2.dest.toUpperCase() : 'OFF';
                  };

                  const modSlots = [
                    {
                      idx: 1, type: 'AHD ENV', dest: getModDest(0),
                      amtVal: (fm?.env1?.amount ?? 1) * 255,
                      params: [
                        { k: 'ATK', v: hx((fm?.env1?.attack ?? 0.01) * 255) },
                        { k: 'HOLD', v: hx((fm?.env1?.hold ?? 0) * 255) },
                        { k: 'DEC', v: hx((fm?.env1?.decay ?? 2.0) * 127) }
                      ]
                    },
                    {
                      idx: 2, type: 'AHD ENV', dest: getModDest(1),
                      amtVal: (fm?.env2?.amount ?? 0) * 255,
                      params: [
                        { k: 'ATK', v: hx((fm?.env2?.attack ?? 0.01) * 255) },
                        { k: 'HOLD', v: hx((fm?.env2?.hold ?? 0) * 255) },
                        { k: 'DEC', v: hx((fm?.env2?.decay ?? 0.3) * 127) }
                      ]
                    },
                    {
                      idx: 3, type: 'LFO', dest: getModDest(2),
                      amtVal: (fm?.lfo1?.amount ?? 0) * 255,
                      params: [
                        { k: 'OSC', v: (fm?.lfo1?.shape ?? 'triangle').substring(0,3).toUpperCase() },
                        { k: 'TRIG', v: 'FREE' },
                        { k: 'FREQ', v: hx((fm?.lfo1?.freq ?? 0) * 16) }
                      ]
                    },
                    {
                      idx: 4, type: 'LFO', dest: getModDest(3),
                      amtVal: (fm?.lfo2?.amount ?? 0) * 255,
                      params: [
                        { k: 'OSC', v: (fm?.lfo2?.shape ?? 'triangle').substring(0,3).toUpperCase() },
                        { k: 'TRIG', v: 'FREE' },
                        { k: 'FREQ', v: hx((fm?.lfo2?.freq ?? 0) * 16) }
                      ]
                    }
                  ].map(s => ({
                    ...s,
                    amt: hx(s.amtVal),
                    pct: (s.amtVal / 2.55).toFixed(1) + '%'
                  }));

                  return html`
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(0,0,0,.1);margin-top:11px;border-radius:5px;overflow:hidden">
                      ${modSlots.map(s => html`
                        <div style="background:#e6e3d4;padding:12px 14px">
                          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px">
                            <div style="display:flex;align-items:center;gap:8px">
                              <div style="width:16px;height:16px;border-radius:50%;background:#17170f;color:#dcd9c6;font:600 8.5px 'JetBrains Mono',monospace;display:flex;align-items:center;justify-content:center;flex:none">${s.idx}</div>
                              <div style="font:600 10px 'JetBrains Mono',monospace;letter-spacing:.08em;color:#17170f">${s.type}</div>
                            </div>
                            <div style="font:500 9px 'JetBrains Mono',monospace;letter-spacing:.06em;color:rgba(23,23,15,.55);background:rgba(0,0,0,.06);padding:2px 6px;border-radius:3px">${s.dest}</div>
                          </div>
                          <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
                            <div style="flex:1;height:5px;background:rgba(0,0,0,.1);border-radius:3px;overflow:hidden"><div style="height:5px;width:${s.pct};background:#17170f"></div></div>
                            <div style="width:38px;text-align:right;font:700 12.5px 'JetBrains Mono',monospace;color:#17170f">${s.amt}</div>
                          </div>
                          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
                            ${s.params.map(p => html`
                              <div style="display:flex;flex-direction:column;gap:3px">
                                <div style="font:400 8.5px 'JetBrains Mono',monospace;letter-spacing:.1em;color:rgba(23,23,15,.4)">${p.k}</div>
                                <div style="font:500 14px 'JetBrains Mono',monospace;color:#17170f">${p.v}</div>
                              </div>
                            `)}
                          </div>
                        </div>
                      `)}
                    </div>
                  `;
                })()}
              ` : nothing}
            </div>
          </div>
        </div>

        <!-- Mobile Layout -->
        <div class="mobile-view" style="width:372px;flex:none;flex-direction:column;gap:10px">

          <div style="background:#e2e0dc;border:1px solid rgba(0,0,0,.12);border-radius:7px;overflow:hidden">
            <div style="display:flex;gap:1px;background:rgba(0,0,0,.12);border-bottom:1px solid rgba(0,0,0,.12)">
              ${MACHINES.map((m, idx) => {
                const isSel = idx === mi;
                const tabBg = isSel ? '#17170f' : '#e2e0dc';
                const tabFg = isSel ? '#dcd9c6' : 'rgba(0,0,0,.42)';
                const vars = isSel ? getVars(70) : getVars(0);
                return html`
                  <button type="button" @click=${() => this.selectMachine(idx)} style="flex:1;height:50px;border:none;background:${tabBg};display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0">
                    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" style=${styleMap({ color: tabFg, ...vars as any })}>
                      ${this.renderPaths(m.icon)}
                    </svg>
                  </button>
                `;
              })}
            </div>
            
            <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 14px 11px">
              <div style="font:700 17px/1 'Space Grotesk',sans-serif">${mach.name}</div>
              <div style="display:flex;gap:5px">
                ${mach.presets.map((pr, idx) => {
                  const isSel = idx === pi;
                  const bg = isSel ? '#101010' : 'transparent';
                  const fg = isSel ? '#fff' : 'rgba(0,0,0,.55)';
                  const border = isSel ? '#101010' : 'rgba(0,0,0,.16)';
                  return html`
                    <button type="button" @click=${() => this.selectPreset(idx)} style="border:1px solid ${border};background:${bg};padding:4px 8px 5px;border-radius:3px;cursor:pointer;font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.08em;color:${fg};white-space:nowrap">${pr[0]}</button>
                  `;
                })}
              </div>
            </div>
            
            <div style="padding:0 14px 14px;display:flex;flex-direction:column;gap:9px">
              ${mach.mods.map((m, i) => {
                const v = vals[i];
                const pct = v.toFixed(1) + '%';
                const vars = getVars(v);
                return html`
                  <div @pointerdown=${(e: PointerEvent) => this.handleDown(e, i, true)} style="display:flex;height:104px;border-radius:5px;overflow:hidden;border:1px solid rgba(0,0,0,.18);cursor:ew-resize;touch-action:pan-y;user-select:none">
                    <div style="flex:1;background:#17170f;padding:11px 12px;display:flex;flex-direction:column;justify-content:space-between">
                      <div style="font:500 10.5px/1.2 'JetBrains Mono',monospace;letter-spacing:.06em;color:#dcd9c6;white-space:pre-line">${m[0]}</div>
                      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" style=${styleMap({ color: '#dcd9c6', ...vars as any })}>
                        ${this.renderPaths((m[2] as (v: number) => any[])(v / 100))}
                      </svg>
                    </div>
                    <div style="width:104px;background:#e6e3d4;padding:11px 12px;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end">
                      <div style="font:700 26px/1 'JetBrains Mono',monospace;color:#17170f">${v.toFixed(1)}</div>
                      <div style="width:100%;height:7px;background:rgba(23,23,15,.16)"><div style="height:7px;width:${pct};background:#17170f"></div></div>
                    </div>
                  </div>
                `;
              })}
              <button type="button" @click=${this.downloadM8Instrument} style="margin-top:4px;border:1px solid #101010;background:#101010;color:#fff;padding:12px;border-radius:4px;cursor:pointer;font:500 10px 'JetBrains Mono',monospace;letter-spacing:.16em">COPY TO M8</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
