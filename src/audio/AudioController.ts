import { FmEngine, noteToFrequency } from './FmEngine';
import { MacroMapper, type AnchorName } from './MacroMapper';
import { M8Serializer } from './M8Serializer';
import type { M8Patch } from './M8Patch';

/** Home row plays a C major scale from middle C. */
const keyMap: Record<string, number> = {
  a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72
};

export class AudioController {
  private engine = new FmEngine();
  private mapper = new MacroMapper();
  private serializer = new M8Serializer();
  private rawPatch: M8Patch | null = null;
  private ctx: AudioContext | null = null;
  private heldKeys = new Set<string>();

  constructor() {
    this.attachGestureListeners();
    this.attachKeyboardListeners();
  }

  public init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.engine
        .init(this.ctx)
        .then(() => this.applyPatch())
        .catch(() => {
          /* already logged by the engine */
        });
    }
    this.resume();
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch((err) => {
        console.warn('Failed to resume AudioContext:', err);
      });
    }
  }

  private attachGestureListeners() {
    const handleGesture = () => this.init();
    window.addEventListener('pointerdown', handleGesture, { passive: true });
    window.addEventListener('keydown', handleGesture, { passive: true });
    window.addEventListener('touchstart', handleGesture, { passive: true });
  }

  private attachKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (keyMap[key] === undefined || e.repeat || e.metaKey || e.ctrlKey) return;
      this.init();
      this.heldKeys.add(key);
      this.engine.noteOn(keyMap[key], noteToFrequency(keyMap[key]), 1.0);
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (keyMap[key] === undefined) return;
      this.heldKeys.delete(key);
      this.engine.noteOff(keyMap[key]);
    });

    // Losing focus mid-note means no keyup ever arrives, so release everything.
    window.addEventListener('blur', () => this.allNotesOff());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.allNotesOff();
    });
  }

  public allNotesOff() {
    this.heldKeys.clear();
    this.engine.allNotesOff();
  }

  public loadAnchor(anchor: AnchorName) {
    this.init();
    this.rawPatch = null;
    this.mapper.loadAnchor(anchor);
    this.applyPatch();
  }

  public setMacro(macroName: string, value: number) {
    this.init();
    if (this.rawPatch) return;
    this.mapper.setMacro(macroName, value);
    this.applyPatch();
  }

  public setVolume(value: number) {
    this.init();
    this.engine.setVolume(value);
  }

  public loadRawPatch(patch: M8Patch) {
    this.init();
    this.rawPatch = patch;
    this.applyPatch();
  }

  private applyPatch() {
    this.engine.applyPatch(this.getPatch());
  }

  public getPatch(): M8Patch {
    return this.rawPatch || this.mapper.getPatch();
  }

  public exportPatch(filename: string) {
    this.serializer.downloadM8Instrument(filename, this.getPatch());
  }
}
