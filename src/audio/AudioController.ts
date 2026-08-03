import type { FmParams } from './FmEngine';
import { FmEngine } from './FmEngine';
import { MacroMapper, type AnchorName } from './MacroMapper';
import { M8Serializer } from './M8Serializer';

// Audio key mapping
const keyMap: Record<string, number> = {
  'a': 261.63, 's': 293.66, 'd': 329.63, 'f': 349.23,
  'g': 392.00, 'h': 440.00, 'j': 493.88, 'k': 523.25,
};

export class AudioController {
  private engine = new FmEngine();
  private mapper = new MacroMapper();
  private serializer = new M8Serializer();
  private isInitialized = false;
  private rawParams: FmParams | null = null;
  private ctx: AudioContext | null = null;

  constructor() {
    this.attachGestureListeners();
    this.attachKeyboardListeners();
  }

  public init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.engine.init(this.ctx);
      this.isInitialized = true;
      console.log('Audio initialized!');
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
    const handleGesture = () => {
      this.init();
    };
    window.addEventListener('pointerdown', handleGesture, { passive: true });
    window.addEventListener('keydown', handleGesture, { passive: true });
    window.addEventListener('touchstart', handleGesture, { passive: true });
    window.addEventListener('click', handleGesture, { passive: true });
  }

  private attachKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      this.init();
      const key = e.key.toLowerCase();
      if (keyMap[key] && !e.repeat) {
        this.engine.triggerNoteOn(keyMap[key], 1.0);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (keyMap[e.key.toLowerCase()]) {
        this.engine.triggerNoteOff();
      }
    });
  }

  public loadAnchor(anchor: AnchorName) {
    this.init();
    this.rawParams = null; // Clear raw params when using macro mapper
    this.mapper.loadAnchor(anchor);
    this.applyParams();
  }

  public setMacro(macroName: string, value: number) {
    this.init();
    if (this.rawParams) return; // Don't apply macros if we're in raw mode
    this.mapper.setMacro(macroName, value);
    this.applyParams();
  }

  public setVolume(value: number) {
    this.init();
    this.engine.setVolume(value);
  }

  public loadRawParams(params: FmParams) {
    this.init();
    this.rawParams = params;
    this.engine.applyParams(params);
  }

  private applyParams() {
    if (!this.isInitialized) return;
    const params = this.rawParams || this.mapper.getComputedFmParams();
    this.engine.applyParams(params);
  }

  public getFmParams(): FmParams {
    return this.rawParams || this.mapper.getComputedFmParams();
  }

  public exportPatch(filename: string) {
    const params = this.rawParams || this.mapper.getComputedFmParams();
    this.serializer.downloadM8Instrument(filename, params);
  }
}
