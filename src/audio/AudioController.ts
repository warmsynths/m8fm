import { FmEngine, buildRenderSpec, noteToFrequency } from './FmEngine';
import { MacroMapper, type AnchorName } from './MacroMapper';
import { M8Serializer } from './M8Serializer';
import type { M8Patch } from './M8Patch';
import { DemoPlayer } from './DemoPlayer';
import type { DemoPattern } from './DemoPatterns';
import { serializeDemoSong } from './DemoSong';

/**
 * Comprehensive musical typing map:
 * - Home row + upper row: Chromatic piano keyboard (C4 to F5)
 *   White keys: a=C4, s=D4, d=E4, f=F4, g=G4, h=A4, j=B4, k=C5, l=D5, ;=E5, '=F5
 *   Black keys: w=C#4, e=D#4, t=F#4, y=G#4, u=A#4, o=C#5, p=D#5
 * - Bottom row: Lower octave (C3 to B3)
 *   z=C3, x=D3, c=E3, v=F3, b=G3, n=A3, m=B3, ,=C4
 * - Number row (1-8): C4 to C5 major scale
 */
const keyMap: Record<string, number> = {
  // Piano style chromatic home row (C4 to F5)
  a: 60, // C4
  w: 61, // C#4
  s: 62, // D4
  e: 63, // D#4
  d: 64, // E4
  f: 65, // F4
  t: 66, // F#4
  g: 67, // G4
  y: 68, // G#4
  h: 69, // A4
  u: 70, // A#4
  j: 71, // B4
  k: 72, // C5
  o: 73, // C#5
  l: 74, // D5
  p: 75, // D#5
  ';': 76, // E5
  "'": 77, // F5

  // Bottom row: lower octave (C3 to B3)
  z: 48, // C3
  x: 50, // D3
  c: 52, // E3
  v: 53, // F3
  b: 55, // G3
  n: 57, // A3
  m: 59, // B3
  ',': 60, // C4
  '.': 62, // D4
  '/': 64, // E4

  // Top QWERTY tracker row keys
  q: 60, // C4
  r: 65, // F4
  i: 72, // C5

  // Number keys (1 to 8)
  '1': 60,
  '2': 62,
  '3': 64,
  '4': 65,
  '5': 67,
  '6': 69,
  '7': 71,
  '8': 72
};

/** Drum pad mode for Percussion machine: A=Kick, S=Snare, D=Closed Hat, F=Open Hat */
const drumKeyMap: Record<string, { preset: number; note: number; vel: number }> = {
  a: { preset: 0, note: 48, vel: 1.0 },
  z: { preset: 0, note: 48, vel: 1.0 },
  q: { preset: 0, note: 48, vel: 1.0 },
  '1': { preset: 0, note: 48, vel: 1.0 },
  s: { preset: 1, note: 55, vel: 1.0 },
  x: { preset: 1, note: 55, vel: 1.0 },
  w: { preset: 1, note: 55, vel: 1.0 },
  '2': { preset: 1, note: 55, vel: 1.0 },
  d: { preset: 2, note: 72, vel: 0.8 },
  c: { preset: 2, note: 72, vel: 0.8 },
  e: { preset: 2, note: 72, vel: 0.8 },
  '3': { preset: 2, note: 72, vel: 0.8 },
  f: { preset: 3, note: 74, vel: 0.9 },
  v: { preset: 3, note: 74, vel: 0.9 },
  r: { preset: 3, note: 74, vel: 0.9 },
  '4': { preset: 3, note: 74, vel: 0.9 },
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
  private heldKeys = new Map<string, number>();
  private currentAnchor: AnchorName = 'Electric Piano';
  public octaveShift = 0;
  public onNoteTrigger?: (note: number, vel: number) => void;

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

      // Octave Shift hotkeys
      if (key === '[' || key === '-') {
        this.octaveShift = Math.max(-2, this.octaveShift - 1);
        return;
      }
      if (key === ']' || key === '=' || key === '+') {
        this.octaveShift = Math.min(2, this.octaveShift + 1);
        return;
      }

      if (this.currentAnchor === 'Percussion') {
        const drum = drumKeyMap[key];
        if (!drum) return;
        this.init();
        const voiceId = 200 + drum.preset * 10 + (drum.note % 10);
        this.heldKeys.set(key, voiceId);
        const patch = this.mapper.getPatchForPreset(drum.preset);
        const spec = buildRenderSpec(patch);
        this.engine.noteOn(voiceId, noteToFrequency(drum.note), drum.vel, spec);
        if (this.onNoteTrigger) this.onNoteTrigger(drum.note, drum.vel);
      } else {
        if (keyMap[key] === undefined) return;
        this.init();
        const baseNote = keyMap[key];
        const effectiveNote = Math.max(12, Math.min(127, baseNote + this.octaveShift * 12));
        this.heldKeys.set(key, effectiveNote);
        this.engine.noteOn(effectiveNote, noteToFrequency(effectiveNote), 1.0);
        if (this.onNoteTrigger) this.onNoteTrigger(effectiveNote, 1.0);
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (!this.heldKeys.has(key)) return;
      const noteOrVoiceId = this.heldKeys.get(key)!;
      this.heldKeys.delete(key);

      this.engine.noteOff(noteOrVoiceId);
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

  public noteOn(note: number, vel = 1.0) {
    this.init();
    if (this.currentAnchor === 'Percussion') {
      const presetIdx = Math.min(3, Math.max(0, note % 4));
      const voiceId = 200 + presetIdx * 10;
      const patch = this.mapper.getPatchForPreset(presetIdx);
      const spec = buildRenderSpec(patch);
      this.engine.noteOn(voiceId, noteToFrequency(note), vel, spec);
      if (this.onNoteTrigger) this.onNoteTrigger(note, vel);
    } else {
      const effectiveNote = Math.max(12, Math.min(127, note + this.octaveShift * 12));
      this.engine.noteOn(effectiveNote, noteToFrequency(effectiveNote), vel);
      if (this.onNoteTrigger) this.onNoteTrigger(effectiveNote, vel);
    }
  }

  public noteOff(note: number) {
    if (this.currentAnchor === 'Percussion') {
      const presetIdx = Math.min(3, Math.max(0, note % 4));
      const voiceId = 200 + presetIdx * 10;
      this.engine.noteOff(voiceId);
    } else {
      const effectiveNote = Math.max(12, Math.min(127, note + this.octaveShift * 12));
      this.engine.noteOff(effectiveNote);
    }
  }

  public triggerNote(note: number, vel = 1.0, durationMs = 300) {
    this.noteOn(note, vel);
    setTimeout(() => {
      this.noteOff(note);
    }, durationMs);
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
