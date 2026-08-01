import { LitElement, html, svg, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import './style.css';
import { AudioController } from './audio/AudioController';
import { type AnchorName } from './audio/MacroMapper';
import { MACHINES, FM_NAMES } from './ui/MachineData';

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
  @state() accessor adv = false;
  @state() accessor v: Record<string, number> = {};
  @state() accessor dirty = false;

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
    const macroName = m.mods[i][0].replace('\n', ' ');
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
      const macroName = m.mods[i][0].replace('\n', ' ');
      audio.setMacro(macroName, val / 100);
    }
  }

  selectPreset(idx: number) {
    this.preset = idx;
    this.v = {};
    this.dirty = false;
    
    const m = MACHINES[this.sel];
    for (let i = 0; i < m.mods.length; i++) {
      const val = this.getVal(this.sel, i);
      const macroName = m.mods[i][0].replace('\n', ' ');
      audio.setMacro(macroName, val / 100);
    }
  }

  downloadM8Instrument() {
    audio.exportPatch('Patch.m8i');
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
  
  renderPaths(paths: any[]) {
    return paths.map(p => svg`<path d="${p.d}" stroke-width="${p.w}" stroke-linecap="${p.c}" stroke-dasharray="${p.s}" style="${p.style}"></path>`);
  }

  render() {
    const mi = this.sel;
    const mach = MACHINES[mi];
    const pi = this.preset % mach.presets.length;
    const vals = mach.mods.map((_, i) => this.getVal(mi, i));
    
    const dirtyMark = (this.dirty ? '*' : '') + mach.presets[pi][0] + ' · SLOT 0' + (pi + 1);

    return html`
      <div id="app">
        <!-- Desktop Layout -->
        <div class="desktop-view" style="width:820px;flex:none;background:#e2e0dc;border:1px solid rgba(0,0,0,.12);border-radius:7px;overflow:hidden;flex-direction:column">
          
          <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 18px;border-bottom:1px solid rgba(0,0,0,.12)">
            <div style="display:flex;align-items:center;gap:9px">
              <div style="width:8px;height:8px;border-radius:50%;background:#17170f"></div>
              <div style="font:500 10.5px 'JetBrains Mono',monospace;letter-spacing:.18em">FM LAYER</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="font:400 10px 'JetBrains Mono',monospace;letter-spacing:.1em;color:rgba(0,0,0,.4)">${dirtyMark}</div>
              <button type="button" @click=${this.downloadM8Instrument} style="border:1px solid #101010;background:#101010;color:#fff;padding:8px 13px;border-radius:4px;cursor:pointer;font:500 10px 'JetBrains Mono',monospace;letter-spacing:.14em;white-space:nowrap">COPY TO M8</button>
            </div>
          </div>

          <div style="display:flex">
            <div style="width:186px;flex:none;border-right:1px solid rgba(0,0,0,.12);padding:14px 12px;display:flex;flex-direction:column;gap:7px">
              <div style="font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.16em;color:rgba(0,0,0,.4);margin-bottom:2px">MACHINE</div>
              ${MACHINES.map((m, idx) => {
                const isSel = idx === mi;
                const bg = isSel ? '#17170f' : 'transparent';
                const fg = isSel ? '#dcd9c6' : 'rgba(0,0,0,.55)';
                const border = isSel ? '#17170f' : 'rgba(0,0,0,.16)';
                const vars = isSel ? getVars(70) : getVars(0);
                return html`
                  <button type="button" @click=${() => this.selectMachine(idx)} style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid ${border};background:${bg};border-radius:4px;cursor:pointer;text-align:left">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${fg}" stroke-linejoin="round" style=${styleMap(vars as any)}>
                      ${this.renderPaths(m.icon)}
                    </svg>
                    <div style="flex:1;font:500 11.5px/1.2 'Space Grotesk',sans-serif;color:${fg}">${m.name}</div>
                  </button>
                `;
              })}
              
              <div style="font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.16em;color:rgba(0,0,0,.4);margin:14px 0 2px">PRESET</div>
              ${mach.presets.map((pr, idx) => {
                const isSel = idx === pi;
                const bg = isSel ? '#101010' : 'transparent';
                const fg = isSel ? '#fff' : 'rgba(0,0,0,.55)';
                const dim = isSel ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.3)';
                const border = isSel ? '#101010' : 'rgba(0,0,0,.16)';
                return html`
                  <button type="button" @click=${() => this.selectPreset(idx)} style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border:1px solid ${border};background:${bg};border-radius:4px;cursor:pointer">
                    <div style="font:500 10.5px 'JetBrains Mono',monospace;letter-spacing:.1em;color:${fg}">${pr[0]}</div>
                    <div style="font:400 9.5px 'JetBrains Mono',monospace;color:${dim}">0${idx + 1}</div>
                  </button>
                `;
              })}
            </div>

            <div style="flex:1;padding:16px 18px 18px">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                ${mach.mods.map((m, i) => {
                  const v = vals[i];
                  const pct = v.toFixed(1) + '%';
                  const vars = getVars(v);
                  const fmLabel = (1 + Math.round(v / 100 * 7)) + '.' + String(Math.round(v * 2) % 1000).padStart(3, '0');
                  
                  return html`
                    <div @pointerdown=${(e: PointerEvent) => this.handleDown(e, i, false)} @wheel=${(e: WheelEvent) => this.handleWheel(e, i)} style="display:flex;height:150px;border-radius:5px;overflow:hidden;border:1px solid rgba(0,0,0,.18);cursor:ns-resize;touch-action:none;user-select:none">
                      <div style="flex:1;background:#17170f;padding:13px;display:flex;flex-direction:column;justify-content:space-between">
                        <div>
                          <div style="font:500 11.5px/1.2 'JetBrains Mono',monospace;letter-spacing:.06em;color:#dcd9c6;white-space:pre-line">${m[0]}</div>
                          <div style="font:400 10px/1.45 'Space Grotesk',sans-serif;color:rgba(220,217,198,.42);margin-top:6px">${m[1]}</div>
                        </div>
                        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#dcd9c6" stroke-linejoin="round" style=${styleMap(vars as any)}>
                          ${this.renderPaths(m[2] as any[])}
                        </svg>
                      </div>
                      <div style="width:104px;background:#e6e3d4;padding:13px;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end">
                        <div style="font:700 30px/1 'JetBrains Mono',monospace;letter-spacing:-.02em;color:#17170f">${v.toFixed(1)}</div>
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;width:100%">
                          <div style="font:500 11px 'JetBrains Mono',monospace;color:rgba(23,23,15,.45)">${fmLabel}</div>
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
                <div style="margin-top:11px;padding:13px 15px;background:#17170f;border-radius:5px;display:flex;gap:24px">
                  ${FM_NAMES.map((n, i) => {
                    const val = i === 0 ? 'FM' + (1 + (mi % 4)) : ((vals[i % vals.length] * (0.7 + i * 0.12)) % 100).toFixed(1);
                    return html`
                      <div><div style="font:400 9px 'JetBrains Mono',monospace;letter-spacing:.14em;color:rgba(220,217,198,.45)">${n}</div><div style="font:500 16px 'JetBrains Mono',monospace;color:#dcd9c6;margin-top:4px">${val}</div></div>
                    `;
                  })}
                </div>
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
                    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="${tabFg}" stroke-linejoin="round" style=${styleMap(vars as any)}>
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
                      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#dcd9c6" stroke-linejoin="round" style=${styleMap(vars as any)}>
                        ${this.renderPaths(m[2] as any[])}
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
