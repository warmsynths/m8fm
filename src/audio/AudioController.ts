import { FmEngine, buildRenderSpec, noteToFrequency } from './FmEngine';
import { MacroMapper, type AnchorName } from './MacroMapper';
import { M8Serializer } from './M8Serializer';
import type { M8Patch } from './M8Patch';
import { DemoPlayer } from './DemoPlayer';
import type { DemoPattern } from './DemoPatterns';
import { serializeDemoSong } from './DemoSong';

/** Home row plays a C major scale from middle C. */
const keyMap: Record<string, number> = {
  a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72
};

/** Drum pad mode for Percussion machine: A=Kick, S=Snare, D=Closed Hat, F=Open Hat */
const drumKeyMap: Record<string, { preset: number; note: number; vel: number }> = {
  a: { preset: 0, note: 48, vel: 1.0 },
  s: { preset: 1, note: 55, vel: 1.0 },
  d: { preset: 2, note: 72, vel: 0.8 },
  f: { preset: 3, note: 74, vel: 0.9 },
  g: { preset: 0, note: 50, vel: 1.0 },
  h: { preset: 1, note: 55, vel: 0.6 },
  j: { preset: 2, note: 72, vel: 0.5 },
  k: { preset: 3, note: 76, vel: 1.0 }
};

export class AudioController {
  private engine = new FmEngine();
  private mapper = new MacroMapper();
  private serializer = new M8Serializer();
  private demoPlayer = new DemoPlayer();
  private rawPatch: M8Patch | null = null;
  private ctx: AudioContext | null = null;
  private heldKeys = new Set<string>();
  private currentAnchor: AnchorName = 'Electric Piano';

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
      if (e.repeat || e.metaKey || e.ctrlKey) return;

      if (this.currentAnchor === 'Percussion') {
        const drum = drumKeyMap[key];
        if (!drum) return;
        this.init();
        this.heldKeys.add(key);
        const voiceId = 200 + drum.preset * 10 + (drum.note % 10);
        const patch = this.mapper.getPatchForPreset(drum.preset);
        const spec = buildRenderSpec(patch);
        this.engine.noteOn(voiceId, noteToFrequency(drum.note), drum.vel, spec);
      } else {
        if (keyMap[key] === undefined) return;
        this.init();
        this.heldKeys.add(key);
        this.engine.noteOn(keyMap[key], noteToFrequency(keyMap[key]), 1.0);
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (!this.heldKeys.has(key)) return;
      this.heldKeys.delete(key);

      if (this.currentAnchor === 'Percussion') {
        const drum = drumKeyMap[key];
        if (!drum) return;
        const voiceId = 200 + drum.preset * 10 + (drum.note % 10);
        this.engine.noteOff(voiceId);
      } else {
        if (keyMap[key] === undefined) return;
        this.engine.noteOff(keyMap[key]);
      }
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
    this.currentAnchor = anchor;
    this.init();
    this.rawPatch = null;
    this.mapper.loadAnchor(anchor);
    this.applyPatch();
  }

  public selectPreset(presetIndex: number) {
    this.mapper.selectPreset(presetIndex);
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

  public exportSong(filename: string, pattern: DemoPattern, songName?: string) {
    let multiPatches: M8Patch[] | undefined;
    if (this.currentAnchor === 'Percussion') {
      multiPatches = [
        this.mapper.getPatchForPreset(0),
        this.mapper.getPatchForPreset(1),
        this.mapper.getPatchForPreset(2),
        this.mapper.getPatchForPreset(3)
      ];
    }
    const bytes = serializeDemoSong(this.getPatch(), pattern, songName, multiPatches);
    this.serializer.downloadM8Song(filename, bytes);
  }

  public playDemo(pattern: DemoPattern, onStep?: (step: number) => void) {
    this.init();
    if (this.ctx) {
      let specsByTrack: Record<number, any> | undefined;
      if (this.currentAnchor === 'Percussion') {
        specsByTrack = {
          0: buildRenderSpec(this.mapper.getPatchForPreset(0)),
          1: buildRenderSpec(this.mapper.getPatchForPreset(1)),
          2: buildRenderSpec(this.mapper.getPatchForPreset(2)),
          3: buildRenderSpec(this.mapper.getPatchForPreset(3))
        };
      }
      this.demoPlayer.play(pattern, this.engine, this.ctx, onStep, specsByTrack);
    }
  }

  public stopDemo() {
    this.demoPlayer.stop();
  }

  public isDemoPlaying(): boolean {
    return this.demoPlayer.isPlaying();
  }
}
