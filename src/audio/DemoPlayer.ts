import type { FmEngine } from './FmEngine';
import { noteToFrequency } from './FmEngine';
import type { DemoPattern } from './DemoPatterns';

export class DemoPlayer {
  private isRunning = false;
  private intervalId: any = null;
  private timeouts = new Set<any>();
  private currentPattern: DemoPattern | null = null;
  private stepIndex = 0;
  private nextStepTime = 0;
  private engine: FmEngine | null = null;
  private ctx: AudioContext | null = null;
  private stepCallback: ((step: number) => void) | null = null;
  private specsByTrack: Record<number, any> | null = null;

  public play(
    pattern: DemoPattern,
    engine: FmEngine,
    ctx: AudioContext,
    onStep?: (step: number) => void,
    specsByTrack?: Record<number, any>
  ) {
    this.stop();

    this.currentPattern = pattern;
    this.engine = engine;
    this.ctx = ctx;
    this.stepCallback = onStep || null;
    this.specsByTrack = specsByTrack || null;
    this.isRunning = true;
    this.stepIndex = 0;
    this.nextStepTime = ctx.currentTime + 0.02; // Small initial padding

    // 20ms lookahead tick loop
    this.intervalId = setInterval(() => this.tick(), 20);
  }

  public stop() {
    this.isRunning = false;
    this.specsByTrack = null;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    for (const t of this.timeouts) {
      clearTimeout(t);
    }
    this.timeouts.clear();

    if (this.engine) {
      this.engine.allNotesOff();
    }
    if (this.stepCallback) {
      this.stepCallback(-1);
    }
    this.stepIndex = 0;
  }

  public isPlaying(): boolean {
    return this.isRunning;
  }

  public getCurrentStep(): number {
    return this.isRunning ? this.stepIndex : -1;
  }

  private tick() {
    if (!this.isRunning || !this.ctx || !this.engine || !this.currentPattern) return;

    const pattern = this.currentPattern;
    // 16th note duration = (60 / tempo) / 4 seconds
    const stepDuration = 60 / (pattern.tempo * 4);
    const lookahead = 0.08; // 80ms lookahead window

    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      const stepToSchedule = this.stepIndex;
      const scheduledTime = this.nextStepTime;
      const delayMs = Math.max(0, (scheduledTime - this.ctx.currentTime) * 1000);

      // Schedule notes starting on this step
      const stepNotes = pattern.notes.filter((n) => n.step === stepToSchedule);

      const timeoutId = setTimeout(() => {
        this.timeouts.delete(timeoutId);
        if (!this.isRunning || !this.engine) return;

        // Visual step notification
        if (this.stepCallback) {
          this.stepCallback(stepToSchedule);
        }

        // Trigger notes
        for (const note of stepNotes) {
          const voiceId = note.track * 128 + note.note;
          const freq = noteToFrequency(note.note);
          const vel = note.velocity ?? 1.0;
          const spec = this.specsByTrack ? this.specsByTrack[note.track] : undefined;
          this.engine.noteOn(voiceId, freq, vel, spec);

          // Schedule note-off
          const lengthSteps = note.length ?? 1;
          const noteDurationMs = lengthSteps * stepDuration * 1000 - 10; // tiny gap between notes

          const offTimeoutId = setTimeout(() => {
            this.timeouts.delete(offTimeoutId);
            if (this.isRunning && this.engine) {
              this.engine.noteOff(voiceId);
            }
          }, Math.max(10, noteDurationMs));

          this.timeouts.add(offTimeoutId);
        }
      }, delayMs);

      this.timeouts.add(timeoutId);

      this.stepIndex = (this.stepIndex + 1) % pattern.totalSteps;
      this.nextStepTime += stepDuration;
    }
  }
}
