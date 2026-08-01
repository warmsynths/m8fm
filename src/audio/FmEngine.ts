import { applyDx7Algorithm } from './DX7Algorithms';

export interface OperatorParams {
  ratio: number;
  level: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  pitchEnvDepth: number;
  pitchEnvDecay: number;
}

export interface FmParams {
  algorithm: number;
  feedback: number;
  operators: OperatorParams[]; // Can be 4 (M8 mode) or 6 (Full DX7 mode)
}

class Operator {
  public osc: OscillatorNode;
  public envGain: GainNode;
  public modIndexGain: GainNode;
  private ctx: AudioContext;

  public params: OperatorParams = {
    ratio: 1.0,
    level: 1.0,
    attack: 0.01,
    decay: 0.1,
    sustain: 0.8,
    release: 0.5,
    pitchEnvDepth: 0.0,
    pitchEnvDecay: 0.0,
  };

  private currentFreq: number = 440;
  private isModulator: boolean = false;

  constructor(ctx: AudioContext, isModulator: boolean = false) {
    this.ctx = ctx;
    this.isModulator = isModulator;

    this.osc = this.ctx.createOscillator();
    this.osc.type = 'sine';

    this.envGain = this.ctx.createGain();
    this.envGain.gain.value = 0.0;

    this.modIndexGain = this.ctx.createGain();
    this.modIndexGain.gain.value = 0.0;

    this.osc.connect(this.envGain);
    this.envGain.connect(this.modIndexGain);
    
    this.osc.start();
  }

  public setFrequency(baseFreq: number) {
    this.currentFreq = baseFreq * this.params.ratio;
    // We'll set the initial frequency here, but triggerNoteOn may override it for pitch envelopes
    this.osc.frequency.setValueAtTime(this.currentFreq, this.ctx.currentTime);
    
    // Modulation index scales with frequency to keep timbre consistent across keyboard
    if (this.isModulator) {
      this.modIndexGain.gain.setValueAtTime(this.currentFreq * this.params.level * 2.0, this.ctx.currentTime);
    } else {
      this.modIndexGain.gain.setValueAtTime(this.params.level, this.ctx.currentTime);
    }
  }

  public triggerNoteOn(time: number, velocity: number = 1.0) {
    const { attack, decay, sustain, pitchEnvDepth, pitchEnvDecay } = this.params;
    const gainParam = this.envGain.gain;
    
    gainParam.cancelScheduledValues(time);
    gainParam.setValueAtTime(0, time);
    
    // Attack
    gainParam.linearRampToValueAtTime(velocity, time + attack);
    
    // Decay to sustain
    gainParam.linearRampToValueAtTime(velocity * sustain, time + attack + decay);

    // Pitch Envelope
    this.osc.frequency.cancelScheduledValues(time);
    if (pitchEnvDepth !== 0 && pitchEnvDecay > 0) {
      this.osc.frequency.setValueAtTime(this.currentFreq * (1.0 + pitchEnvDepth), time);
      // exponentialRampToValueAtTime needs a non-zero end value and same sign.
      // We assume currentFreq is always positive.
      this.osc.frequency.exponentialRampToValueAtTime(Math.max(0.001, this.currentFreq), time + pitchEnvDecay);
    } else {
      this.osc.frequency.setValueAtTime(this.currentFreq, time);
    }
  }

  public triggerNoteOff(time: number) {
    const { release } = this.params;
    const gainParam = this.envGain.gain;
    
    gainParam.cancelScheduledValues(time);
    gainParam.setValueAtTime(gainParam.value, time);
    
    // Release
    gainParam.linearRampToValueAtTime(0, time + release);
  }

  public setIsModulator(isModulator: boolean) {
    this.isModulator = isModulator;
  }

  public disconnectAll() {
    this.modIndexGain.disconnect();
  }
}

export class FmEngine {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  
  private ops: Operator[] = [];
  
  private feedbackGain!: GainNode;
  private feedbackDelay!: DelayNode;

  public currentAlgorithm: number = 1;

  public init(audioCtx: AudioContext) {
    this.ctx = audioCtx;
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = 0.5; // Master volume headroom

    // Create 6 operators
    this.ops = Array.from({ length: 6 }, () => new Operator(this.ctx!, true));

    // Feedback loop for Op1
    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0; // Default no feedback
    
    this.feedbackDelay = this.ctx.createDelay();
    // 1 sample delay approximately (at 44.1kHz)
    this.feedbackDelay.delayTime.value = 1 / this.ctx.sampleRate;

    // Op1 -> delay -> gain -> Op1.frequency
    this.ops[0].envGain.connect(this.feedbackDelay);
    this.feedbackDelay.connect(this.feedbackGain);
    this.feedbackGain.connect(this.ops[0].osc.frequency);

    this.setAlgorithm(1);
  }

  public setAlgorithm(algoId: number, isDx7Mode: boolean = false) {
    if (!this.ctx) return;
    this.currentAlgorithm = algoId;

    if (isDx7Mode) {
      applyDx7Algorithm(this.ops, this.masterGain, this.feedbackGain, algoId);
      return;
    }

    // Disconnect all
    this.ops.forEach(op => op.disconnectAll());

    // Reconnect based on algorithm
    // Note: modIndexGain is what we connect from.
    switch (algoId) {
      case 1:
        // Op4 -> Op3 -> Op2 -> Op1 -> Out
        this.ops[3].modIndexGain.connect(this.ops[2].osc.frequency);
        this.ops[2].modIndexGain.connect(this.ops[1].osc.frequency);
        this.ops[1].modIndexGain.connect(this.ops[0].osc.frequency);
        this.ops[0].modIndexGain.connect(this.masterGain);
        
        // Update isModulator flags and update levels
        this.ops[0].setIsModulator(false);
        this.ops[1].setIsModulator(true);
        this.ops[2].setIsModulator(true);
        this.ops[3].setIsModulator(true);
        break;

      case 2:
        // (Op4 -> Op3) + (Op2 -> Op1) -> Out
        this.ops[3].modIndexGain.connect(this.ops[2].osc.frequency);
        this.ops[2].modIndexGain.connect(this.masterGain);
        
        this.ops[1].modIndexGain.connect(this.ops[0].osc.frequency);
        this.ops[0].modIndexGain.connect(this.masterGain);

        this.ops[0].setIsModulator(false);
        this.ops[1].setIsModulator(true);
        this.ops[2].setIsModulator(false); // Op3 acts as carrier here
        this.ops[3].setIsModulator(true);
        break;

      case 3:
        // (Op4 + Op3 + Op2) -> Op1 -> Out
        this.ops[3].modIndexGain.connect(this.ops[0].osc.frequency);
        this.ops[2].modIndexGain.connect(this.ops[0].osc.frequency);
        this.ops[1].modIndexGain.connect(this.ops[0].osc.frequency);
        this.ops[0].modIndexGain.connect(this.masterGain);

        this.ops[0].setIsModulator(false);
        this.ops[1].setIsModulator(true);
        this.ops[2].setIsModulator(true);
        this.ops[3].setIsModulator(true);
        break;
        
      default:
        console.warn(`Algorithm ${algoId} not implemented, defaulting to 1`);
        this.setAlgorithm(1);
        break;
    }
  }

  public setOperatorParam(opIndex: number, param: keyof OperatorParams, value: number) {
    if (opIndex < 0 || opIndex >= this.ops.length) return;
    this.ops[opIndex].params[param] = value;
  }

  public setFeedback(amount: number) {
    // Arbitrary scaling for feedback amount (e.g. 0 to 1000)
    if (this.ctx) {
      this.feedbackGain.gain.setTargetAtTime(amount * 1000, this.ctx.currentTime, 0.01);
    }
  }

  public triggerNoteOn(frequency: number, velocity: number = 1.0) {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    
    // Update frequencies and trigger envelopes
    this.ops.forEach(op => {
      op.setFrequency(frequency);
      op.triggerNoteOn(time, velocity);
    });
  }

  public triggerNoteOff() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    
    this.ops.forEach(op => {
      op.triggerNoteOff(time);
    });
  }

  public applyParams(params: FmParams) {
    const isDx7Mode = params.operators.length === 6;
    this.setAlgorithm(params.algorithm, isDx7Mode);
    this.setFeedback(params.feedback);
    for (let i = 0; i < params.operators.length; i++) {
      const op = params.operators[i];
      this.setOperatorParam(i, 'ratio', op.ratio);
      this.setOperatorParam(i, 'level', op.level);
      this.setOperatorParam(i, 'attack', op.attack);
      this.setOperatorParam(i, 'decay', op.decay);
      this.setOperatorParam(i, 'sustain', op.sustain);
      this.setOperatorParam(i, 'release', op.release);
      this.setOperatorParam(i, 'pitchEnvDepth', op.pitchEnvDepth);
      this.setOperatorParam(i, 'pitchEnvDecay', op.pitchEnvDecay);
    }
    // Silence unused operators if switching back to 4-op mode
    for (let i = params.operators.length; i < this.ops.length; i++) {
      this.setOperatorParam(i, 'level', 0);
    }
  }
}
