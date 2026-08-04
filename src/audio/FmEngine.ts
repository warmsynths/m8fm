import { applyDx7Algorithm } from './DX7Algorithms';

export type EnvDest = 'mod1' | 'mod2' | 'mod3' | 'mod4' | 'pitch' | 'volume' | 'none';

export interface EnvParams {
  attack: number;
  hold: number; // Duration to hold at peak before decaying
  decay: number; // Acts as both decay and release
  amount: number;
  dest: EnvDest;
}

export type LfoShape = 'triangle' | 'sine' | 'square' | 'sawtooth';

export interface LfoParams {
  shape: LfoShape;
  freq: number;
  amount: number;
  dest: EnvDest;
}

export interface OperatorParams {
  ratio: number;
  level: number;
  shape?: OscillatorType;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  pitchEnvDepth?: number;
  pitchEnvDecay?: number;
}

export interface FmParams {
  algorithm: number;
  feedback: number;
  operators: OperatorParams[]; // Can be 4 (M8 mode) or 6 (Full DX7 mode)
  env1?: EnvParams; // M8 Master Volume (AHD)
  env2?: EnvParams; // M8 Assignable (AHD)
  lfo1?: LfoParams;
  lfo2?: LfoParams;
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

  public currentFreq: number = 440;
  public isModulator: boolean = false;

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
    this.osc.frequency.setValueAtTime(this.currentFreq, this.ctx.currentTime);
    
    // Exponential level response curve (0..1) matching hardware VCA/PM depth
    const normalizedLevel = Math.pow(Math.max(0, Math.min(1, this.params.level)), 2.0);

    if (this.isModulator) {
      // Phase Modulation equivalent frequency deviation:
      // Delta f (Hz) = (Modulation Index in Radians) * (Modulator Frequency)
      // Index in Radians = normalizedLevel * 4.0 radians
      const modIndexRadians = normalizedLevel * 4.0;
      const modDevHz = modIndexRadians * this.currentFreq;
      this.modIndexGain.gain.setValueAtTime(modDevHz, this.ctx.currentTime);
    } else {
      // Output carrier gain
      this.modIndexGain.gain.setValueAtTime(normalizedLevel, this.ctx.currentTime);
    }
  }

  public triggerNoteOn(time: number, velocity: number = 1.0, ignoreLocalEnv: boolean = false) {
    const gainParam = this.envGain.gain;
    
    gainParam.cancelScheduledValues(time);
    
    if (ignoreLocalEnv) {
      // In strict M8 mode, the Operator does not use its own ADSR. It stays open at max.
      // The actual ADSR is applied globally to the master gain or via env2 routing.
      gainParam.setValueAtTime(velocity, time);
      
      this.osc.frequency.cancelScheduledValues(time);
      this.osc.frequency.setValueAtTime(this.currentFreq, time);
      return;
    }

    const { attack = 0.01, decay = 0.1, sustain = 0.8, pitchEnvDepth = 0, pitchEnvDecay = 0 } = this.params;
    
    gainParam.setValueAtTime(0, time);
    
    // Attack
    gainParam.linearRampToValueAtTime(velocity, time + attack);
    
    // Decay to sustain
    gainParam.linearRampToValueAtTime(velocity * sustain, time + attack + decay);

    // Pitch Envelope
    this.osc.frequency.cancelScheduledValues(time);
    if (pitchEnvDepth !== 0 && pitchEnvDecay > 0) {
      this.osc.frequency.setValueAtTime(this.currentFreq * (1.0 + pitchEnvDepth), time);
      this.osc.frequency.exponentialRampToValueAtTime(Math.max(0.001, this.currentFreq), time + pitchEnvDecay);
    } else {
      this.osc.frequency.setValueAtTime(this.currentFreq, time);
    }
  }

  public triggerNoteOff(time: number, ignoreLocalEnv: boolean = false) {
    const gainParam = this.envGain.gain;
    
    if (ignoreLocalEnv) {
      // In strict M8 mode, volume decay is handled globally.
      return;
    }

    const { release = 0.1 } = this.params;
    if ('cancelAndHoldAtTime' in gainParam && typeof (gainParam as any).cancelAndHoldAtTime === 'function') {
      (gainParam as any).cancelAndHoldAtTime(time);
    } else {
      gainParam.cancelScheduledValues(time);
    }
    
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
  private tremoloGain!: GainNode;
  private outputGain!: GainNode;
  
  private ops: Operator[] = [];
  
  private feedbackGain!: GainNode;
  private feedbackDelay!: DelayNode;
  private currentFeedbackAmount: number = 0;

  public currentAlgorithm: number = 1;
  private isStrictM8Mode: boolean = false;
  private activeEnv1?: EnvParams;
  private activeEnv2?: EnvParams;
  
  private lfo1Osc!: OscillatorNode;
  private lfo1Gain!: GainNode;
  private lfo2Osc!: OscillatorNode;
  private lfo2Gain!: GainNode;

  public init(audioCtx: AudioContext) {
    this.ctx = audioCtx;
    this.masterGain = this.ctx.createGain();
    this.tremoloGain = this.ctx.createGain();
    this.outputGain = this.ctx.createGain();
    
    this.masterGain.connect(this.tremoloGain);
    this.tremoloGain.connect(this.outputGain);
    this.outputGain.connect(this.ctx.destination);
    
    this.masterGain.gain.value = 0.5; // Master volume headroom
    this.tremoloGain.gain.value = 1.0; // Default flat tremolo
    this.outputGain.gain.value = 0.5; // Default user volume

    // Create 6 operators
    this.ops = Array.from({ length: 6 }, () => new Operator(this.ctx!, true));

    // LFO 1
    this.lfo1Osc = this.ctx.createOscillator();
    this.lfo1Gain = this.ctx.createGain();
    this.lfo1Gain.gain.value = 0;
    this.lfo1Osc.connect(this.lfo1Gain);
    this.lfo1Osc.start();

    // LFO 2
    this.lfo2Osc = this.ctx.createOscillator();
    this.lfo2Gain = this.ctx.createGain();
    this.lfo2Gain.gain.value = 0;
    this.lfo2Osc.connect(this.lfo2Gain);
    this.lfo2Osc.start();

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
    this.lfo1Gain.disconnect();
    this.lfo2Gain.disconnect();

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
        // M8 Algo 07: (Op A -> Op B) + (Op C -> Op D) -> Out
        // ops[0] = Op A (Modulator), ops[1] = Op B (Carrier)
        // ops[2] = Op C (Modulator), ops[3] = Op D (Carrier)
        this.ops[0].modIndexGain.connect(this.ops[1].osc.frequency);
        this.ops[1].modIndexGain.connect(this.masterGain);
        
        this.ops[2].modIndexGain.connect(this.ops[3].osc.frequency);
        this.ops[3].modIndexGain.connect(this.masterGain);

        this.ops[0].setIsModulator(true);  // Op A is Modulator
        this.ops[1].setIsModulator(false); // Op B is Carrier
        this.ops[2].setIsModulator(true);  // Op C is Modulator
        this.ops[3].setIsModulator(false); // Op D is Carrier
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

  public setOperatorParam(opIndex: number, param: keyof OperatorParams, value: any) {
    if (opIndex < 0 || opIndex >= this.ops.length) return;
    (this.ops[opIndex].params as any)[param] = value;
    if (param === 'shape' && value) {
      this.ops[opIndex].osc.type = value as OscillatorType;
    }
  }

  public setVolume(val: number) {
    if (this.outputGain) {
      this.outputGain.gain.setTargetAtTime(val, this.ctx?.currentTime || 0, 0.01);
    }
  }

  public setFeedback(amount: number) {
    this.currentFeedbackAmount = amount;
    if (this.ctx) {
      const baseFreq = this.ops[0]?.currentFreq || 440;
      const normalizedFb = Math.pow(Math.max(0, Math.min(1, amount)), 2.0);
      const fbDevHz = normalizedFb * 1.5 * baseFreq;
      this.feedbackGain.gain.setTargetAtTime(fbDevHz, this.ctx.currentTime, 0.01);
    }
  }

  private applyAhdToParam(param: AudioParam, time: number, env: EnvParams, baseValue: number) {
    param.cancelScheduledValues(time);
    param.setValueAtTime(0, time);
    param.linearRampToValueAtTime(baseValue * env.amount, time + env.attack);
    
    // If hold is extremely long, it acts like a sustain. Otherwise it decays.
    if (env.hold < 100) {
      param.linearRampToValueAtTime(baseValue * env.amount, time + env.attack + env.hold);
      param.linearRampToValueAtTime(0, time + env.attack + env.hold + env.decay);
    }
  }

  private releaseAhdParam(param: AudioParam, time: number, env: EnvParams) {
    if ('cancelAndHoldAtTime' in param && typeof (param as any).cancelAndHoldAtTime === 'function') {
      (param as any).cancelAndHoldAtTime(time);
    } else {
      param.cancelScheduledValues(time);
    }
    param.linearRampToValueAtTime(0, time + Math.min(env.decay, 0.2));
  }

  private routeLfo(lfoOsc: OscillatorNode, lfoGain: GainNode, params: LfoParams | undefined, time: number) {
    lfoGain.disconnect();
    if (!params || params.dest === 'none' || params.amount === 0) return;
    
    lfoOsc.type = params.shape;
    lfoOsc.frequency.cancelScheduledValues(time);
    lfoOsc.frequency.setValueAtTime(params.freq, time);
    lfoGain.gain.cancelScheduledValues(time);
    
    // LFO amount is scaled based on destination
    if (params.dest === 'pitch') {
      lfoGain.gain.setValueAtTime(params.amount * 50, time); // Pitch mod depth
      this.ops.forEach(op => lfoGain.connect(op.osc.frequency));
    } else if (params.dest === 'volume') {
      lfoGain.gain.setValueAtTime(params.amount * 0.4, time); // Pure volume tremolo
      lfoGain.connect(this.tremoloGain.gain);
    } else {
      lfoGain.gain.setValueAtTime(params.amount * 2.0, time); // Level mod depth
      if (params.dest === 'mod1') lfoGain.connect(this.ops[0].modIndexGain.gain);
      else if (params.dest === 'mod2') lfoGain.connect(this.ops[1].modIndexGain.gain);
      else if (params.dest === 'mod3') lfoGain.connect(this.ops[2].modIndexGain.gain);
      else if (params.dest === 'mod4') lfoGain.connect(this.ops[3].modIndexGain.gain);
    }
  }

  public triggerNoteOn(frequency: number, velocity: number = 1.0) {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    
    // Update frequencies and trigger envelopes
    this.ops.forEach(op => {
      op.setFrequency(frequency);
      op.triggerNoteOn(time, velocity, this.isStrictM8Mode);
    });

    // Update feedback scaling for the new note frequency
    this.setFeedback(this.currentFeedbackAmount);

    if (this.isStrictM8Mode) {
      if (this.activeEnv1) {
        // Env1 is always master volume
        this.applyAhdToParam(this.masterGain.gain, time, this.activeEnv1, 0.5 * velocity);
      }
      
      if (this.activeEnv2) {
        const dest = this.activeEnv2.dest;
        const getModBase = (opIndex: number) => {
          const op = this.ops[opIndex];
          return op.params.level * 2.0 * (op.isModulator ? op.currentFreq : 1.0);
        };

        if (dest === 'mod1') this.applyAhdToParam(this.ops[0].modIndexGain.gain, time, this.activeEnv2, getModBase(0));
        else if (dest === 'mod2') this.applyAhdToParam(this.ops[1].modIndexGain.gain, time, this.activeEnv2, getModBase(1));
        else if (dest === 'mod3') this.applyAhdToParam(this.ops[2].modIndexGain.gain, time, this.activeEnv2, getModBase(2));
        else if (dest === 'mod4') this.applyAhdToParam(this.ops[3].modIndexGain.gain, time, this.activeEnv2, getModBase(3));
        else if (dest === 'pitch') {
          this.ops.forEach(op => {
            const currentFreq = op.currentFreq;
            op.osc.frequency.cancelScheduledValues(time);
            op.osc.frequency.setValueAtTime(Math.max(0.001, currentFreq * (1.0 + this.activeEnv2!.amount)), time);
            
            if (this.activeEnv2!.hold < 100) {
              op.osc.frequency.setValueAtTime(Math.max(0.001, currentFreq * (1.0 + this.activeEnv2!.amount)), time + this.activeEnv2!.attack + this.activeEnv2!.hold);
              op.osc.frequency.exponentialRampToValueAtTime(Math.max(0.001, currentFreq), time + this.activeEnv2!.attack + this.activeEnv2!.hold + this.activeEnv2!.decay);
            }
          });
        }
      }
    }
  }

  public triggerNoteOff() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    
    this.ops.forEach(op => {
      op.triggerNoteOff(time, this.isStrictM8Mode);
    });

    if (this.isStrictM8Mode) {
      if (this.activeEnv1) {
        this.releaseAhdParam(this.masterGain.gain, time, this.activeEnv1);
      }
      if (this.activeEnv2) {
        const dest = this.activeEnv2.dest;
        if (dest === 'mod1') this.releaseAhdParam(this.ops[0].modIndexGain.gain, time, this.activeEnv2);
        else if (dest === 'mod2') this.releaseAhdParam(this.ops[1].modIndexGain.gain, time, this.activeEnv2);
        else if (dest === 'mod3') this.releaseAhdParam(this.ops[2].modIndexGain.gain, time, this.activeEnv2);
        else if (dest === 'mod4') this.releaseAhdParam(this.ops[3].modIndexGain.gain, time, this.activeEnv2);
        else if (dest === 'pitch') {
          this.ops.forEach(op => {
            if ('cancelAndHoldAtTime' in op.osc.frequency && typeof (op.osc.frequency as any).cancelAndHoldAtTime === 'function') {
              (op.osc.frequency as any).cancelAndHoldAtTime(time);
            } else {
              op.osc.frequency.cancelScheduledValues(time);
            }
            op.osc.frequency.exponentialRampToValueAtTime(Math.max(0.001, op.currentFreq), time + Math.min(this.activeEnv2!.decay, 0.2));
          });
        }
      }
    }
  }

  public applyParams(params: FmParams) {
    const isDx7Mode = params.operators.length === 6;
    this.isStrictM8Mode = !isDx7Mode && !!params.env1;
    this.activeEnv1 = params.env1;
    this.activeEnv2 = params.env2;

    this.setAlgorithm(params.algorithm, isDx7Mode);
    this.setFeedback(params.feedback);

    if (this.ctx) {
      this.routeLfo(this.lfo1Osc, this.lfo1Gain, params.lfo1, this.ctx.currentTime);
      this.routeLfo(this.lfo2Osc, this.lfo2Gain, params.lfo2, this.ctx.currentTime);
    }

    for (let i = 0; i < params.operators.length; i++) {
      const op = params.operators[i];
      this.setOperatorParam(i, 'ratio', op.ratio);
      this.setOperatorParam(i, 'level', op.level);
      if (op.shape) this.setOperatorParam(i, 'shape', op.shape);
      // Optional legacy params
      if (op.attack !== undefined) this.setOperatorParam(i, 'attack', op.attack);
      if (op.decay !== undefined) this.setOperatorParam(i, 'decay', op.decay);
      if (op.sustain !== undefined) this.setOperatorParam(i, 'sustain', op.sustain);
      if (op.release !== undefined) this.setOperatorParam(i, 'release', op.release);
      if (op.pitchEnvDepth !== undefined) this.setOperatorParam(i, 'pitchEnvDepth', op.pitchEnvDepth);
      if (op.pitchEnvDecay !== undefined) this.setOperatorParam(i, 'pitchEnvDecay', op.pitchEnvDecay);
    }

    // Silence unused operators if switching back to 4-op mode
    for (let i = params.operators.length; i < this.ops.length; i++) {
      this.setOperatorParam(i, 'level', 0);
    }
  }
}
