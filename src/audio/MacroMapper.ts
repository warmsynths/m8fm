import type { OperatorParams } from './FmEngine';

export interface FmParams {
  algorithm: number;
  feedback: number;
  operators: [OperatorParams, OperatorParams, OperatorParams, OperatorParams];
}

export type AnchorName = 'Electric Piano' | 'Sub Bass' | 'Mallet' | 'Pad' | 'Digital Glitch' | 'Vintage Lead';

// We map Anchors to their specific macros
export const AnchorMacroConfig: Record<AnchorName, string[]> = {
  'Electric Piano': ['Tine Material', 'Strike Force', 'Bark', 'Tremolo Depth'],
  'Sub Bass': ['Sub Weight', 'Pitch Snap', 'Top-End Growl', 'Boom'],
  'Mallet': ['Harmonic Focus', 'Dampening', 'Impact Noise'],
  'Pad': ['Wash', 'Shimmer', 'Chorus', 'Hollow'],
  'Digital Glitch': ['Digital Dirt', 'Laser Zap', 'Pulse Width'],
  'Vintage Lead': ['Timbre', 'Filter Cutoff', 'Filter Envelope', 'Analog Slop']
};

export class MacroMapper {
  private baseParams: FmParams;
  private currentParams: FmParams;
  public currentAnchor: AnchorName = 'Electric Piano';

  // State of all possible macros, clamped 0.0 - 1.0
  private macroState: Record<string, number> = {};

  constructor() {
    this.baseParams = this.getAnchorParams(this.currentAnchor);
    this.currentParams = JSON.parse(JSON.stringify(this.baseParams));
  }

  public loadAnchor(anchorName: AnchorName) {
    this.currentAnchor = anchorName;
    this.baseParams = this.getAnchorParams(anchorName);
    
    // Initialize macro states for the new anchor
    const macros = AnchorMacroConfig[anchorName];
    for (const macro of macros) {
      if (this.macroState[macro] === undefined) {
        this.macroState[macro] = 0.0;
      }
    }
    
    this.applyMacros();
  }

  public setMacro(macroName: string, normalizedValue: number) {
    const clamped = Math.max(0.0, Math.min(1.0, normalizedValue));
    this.macroState[macroName] = clamped;
    this.applyMacros();
  }

  public getComputedFmParams(): FmParams {
    return this.currentParams;
  }

  private applyMacros() {
    const params: FmParams = JSON.parse(JSON.stringify(this.baseParams));

    switch (this.currentAnchor) {
      case 'Electric Piano':
        this.applyElectricPianoMath(params);
        break;
      case 'Sub Bass':
        this.applySubBassMath(params);
        break;
      case 'Mallet':
        this.applyMalletMath(params);
        break;
      case 'Pad':
        this.applyPadMath(params);
        break;
      case 'Digital Glitch':
        this.applyDigitalGlitchMath(params);
        break;
      case 'Vintage Lead':
        this.applyVintageLeadMath(params);
        break;
    }

    this.currentParams = params;
  }

  // --- DSP Math Transformations --- //

  private getMacroVal(name: string): number {
    return this.macroState[name] || 0.0;
  }

  private applyElectricPianoMath(params: FmParams) {
    // Tine Material: Selects from stepped ratios for Op4 without interpolation
    const tine = this.getMacroVal('Tine Material');
    const ratios = [1.0, 3.14, 5.0, 7.8, 11.2, 14.0];
    const tineIndex = Math.min(ratios.length - 1, Math.floor(tine * ratios.length));
    params.operators[3].ratio = ratios[tineIndex];

    // Strike Force: Exponential decay scaling on Modulators; peaks initial gain
    const strike = this.getMacroVal('Strike Force');
    for (let i = 1; i <= 3; i++) {
      params.operators[i].attack *= Math.exp(-strike * 3);
      params.operators[i].decay *= Math.exp(-strike * 3);
      params.operators[i].level += strike * 0.8;
    }

    // Bark: Linear scaling on Op1 feedback and Op2 -> Op1 level
    const bark = this.getMacroVal('Bark');
    params.feedback += bark * 0.5;
    params.operators[1].level += bark * 0.5;
  }

  private applySubBassMath(params: FmParams) {
    // Sub Weight: Force Op1 level and sustain high
    const weight = this.getMacroVal('Sub Weight');
    params.operators[0].level = Math.max(params.operators[0].level, 0.8 + weight * 0.2);
    params.operators[0].sustain = Math.max(params.operators[0].sustain, 0.8 + weight * 0.2);

    // Pitch Snap: Map to rapid, descending pitch envelope on Carrier (Op1)
    const pitchSnap = this.getMacroVal('Pitch Snap');
    if (pitchSnap > 0) {
      params.operators[0].pitchEnvDepth = pitchSnap * 4.0; // up to +400% frequency
      params.operators[0].pitchEnvDecay = Math.max(0.01, 0.5 * (1.0 - pitchSnap)); // faster decay at higher values
    }

    // Top-End Growl: Modulate Op4 level and snap ratio to inharmonics
    const growl = this.getMacroVal('Top-End Growl');
    if (growl > 0) {
      params.operators[3].level += growl * 0.8;
      params.operators[3].ratio = 2.14 + growl * 5.0; // Inharmonic
    }
  }

  private applyMalletMath(params: FmParams) {
    // Harmonic Focus: 0.0=integers, 0.5=offsets, 1.0=complex fractions
    const focus = this.getMacroVal('Harmonic Focus');
    if (focus < 0.33) {
      params.operators[1].ratio = 2.0;
      params.operators[2].ratio = 4.0;
    } else if (focus < 0.66) {
      params.operators[1].ratio = 2.1;
      params.operators[2].ratio = 4.2;
    } else {
      params.operators[1].ratio = 2.45;
      params.operators[2].ratio = 5.81;
    }

    // Dampening: decay/release globally
    const dampening = this.getMacroVal('Dampening');
    for (let i = 0; i < 4; i++) {
      params.operators[i].decay *= (0.1 + dampening * 4.0);
      params.operators[i].release *= (0.1 + dampening * 4.0);
    }

    // Impact Noise: short envelope burst of high-feedback to top modulator (Op4)
    const impact = this.getMacroVal('Impact Noise');
    if (impact > 0) {
      params.operators[3].attack = 0.005;
      params.operators[3].decay = 0.015; // 15ms
      params.operators[3].sustain = 0.0;
      params.operators[3].level += impact * 1.0;
      params.operators[3].ratio = 15.0; // noisy high ratio
    }
  }

  private applyPadMath(params: FmParams) {
    // Wash: Scale attack times from 10ms (0.0) to 4000ms (1.0)
    const wash = this.getMacroVal('Wash');
    const attackTime = 0.01 + (wash * 3.99); // 0.01 to 4.0 seconds
    for (let i = 0; i < 4; i++) {
      params.operators[i].attack = attackTime;
    }

    // Shimmer: Op4 ratio to 16.0 or 32.0, heavily delayed attack
    const shimmer = this.getMacroVal('Shimmer');
    if (shimmer > 0) {
      params.operators[3].ratio = shimmer > 0.5 ? 32.0 : 16.0;
      params.operators[3].attack += shimmer * 2.0; // Delayed/slow attack
      params.operators[3].level += shimmer * 0.5;
    }

    // Chorus: micro-fractional detuning across modulators
    const chorus = this.getMacroVal('Chorus');
    if (chorus > 0) {
      params.operators[1].ratio += 0.02 * chorus;
      params.operators[2].ratio += 0.05 * chorus;
      params.operators[3].ratio += 0.03 * chorus;
    }
  }

  private applyDigitalGlitchMath(params: FmParams) {
    // Digital Dirt: Extreme linear scaling of feedback
    const dirt = this.getMacroVal('Digital Dirt');
    params.feedback = dirt; // 0.0 to 1.0 feedback

    // Laser Zap: Heavy pitchEnvDepth and very short pitchEnvDecay to all operators
    const zap = this.getMacroVal('Laser Zap');
    if (zap > 0) {
      for (let i = 0; i < 4; i++) {
        params.operators[i].pitchEnvDepth = zap * 12.0; // Extreme pitch swoop
        params.operators[i].pitchEnvDecay = 0.05 + ((1.0 - zap) * 0.2); // 50ms - 250ms
      }
    }

    // Pulse Width: Step through specific FM ratios that emulate analog PWM
    const pw = this.getMacroVal('Pulse Width');
    const pwRatios = [1.0, 1.5, 2.0, 2.5];
    const pwIndex = Math.min(pwRatios.length - 1, Math.floor(pw * pwRatios.length));
    params.operators[1].ratio = pwRatios[pwIndex];
  }

  private applyVintageLeadMath(params: FmParams) {
    // Timbre: Linearly scale Op1 feedback from 0.0 to 1.0
    const timbre = this.getMacroVal('Timbre');
    params.feedback = timbre;

    // Filter Cutoff: Scale Modulator Gain (Op2 -> Op1).
    const cutoff = this.getMacroVal('Filter Cutoff');
    params.operators[1].level = cutoff;

    // Filter Envelope: Map to Modulator (Op2) Decay time. 0.0 = 10ms, 1.0 = 2000ms.
    const filterEnv = this.getMacroVal('Filter Envelope');
    params.operators[1].decay = 0.01 + (filterEnv * 1.99);

    // Analog Slop: Map to fractional ratio offsets on operators, max 0.05.
    const slop = this.getMacroVal('Analog Slop');
    if (slop > 0) {
      params.operators[0].ratio += slop * 0.02; // phase beating
      params.operators[1].ratio -= slop * 0.03;
      params.operators[2].ratio += slop * 0.04;
      params.operators[3].ratio -= slop * 0.05;
    }
  }

  private getAnchorParams(anchor: AnchorName): FmParams {
    const defaultOp = (): OperatorParams => ({
      ratio: 1, level: 0.0, attack: 0.01, decay: 0.1, sustain: 0.0, release: 0.1, pitchEnvDepth: 0, pitchEnvDecay: 0
    });

    const p: FmParams = {
      algorithm: 1,
      feedback: 0.0,
      operators: [defaultOp(), defaultOp(), defaultOp(), defaultOp()]
    };

    switch (anchor) {
      case 'Electric Piano':
        p.algorithm = 2;
        p.feedback = 0.1;
        p.operators[0] = { ...defaultOp(), level: 0.9, attack: 0.01, decay: 1.5, sustain: 0.5, release: 0.4 };
        p.operators[1] = { ...defaultOp(), level: 0.6, attack: 0.01, decay: 1.2, sustain: 0.0, release: 0.4 };
        p.operators[2] = { ...defaultOp(), level: 0.8, attack: 0.01, decay: 1.5, sustain: 0.5, release: 0.4 };
        p.operators[3] = { ...defaultOp(), ratio: 14, level: 0.3, attack: 0.01, decay: 0.2, sustain: 0.0, release: 0.1 };
        break;
      
      case 'Sub Bass':
        p.algorithm = 1;
        p.feedback = 0.0;
        p.operators[0] = { ...defaultOp(), level: 1.0, attack: 0.05, decay: 0.5, sustain: 1.0, release: 0.3 };
        p.operators[1] = { ...defaultOp(), ratio: 0.5, level: 0.4, attack: 0.05, decay: 0.5, sustain: 0.8, release: 0.3 };
        break;
        
      case 'Mallet':
        p.algorithm = 3;
        p.feedback = 0.0;
        p.operators[0] = { ...defaultOp(), level: 1.0, attack: 0.005, decay: 1.0, sustain: 0.0, release: 0.5 };
        p.operators[1] = { ...defaultOp(), ratio: 3.5, level: 0.8, attack: 0.005, decay: 0.3, sustain: 0.0, release: 0.1 };
        p.operators[2] = { ...defaultOp(), ratio: 5.2, level: 0.6, attack: 0.005, decay: 0.1, sustain: 0.0, release: 0.1 };
        p.operators[3] = { ...defaultOp(), ratio: 9.8, level: 0.4, attack: 0.005, decay: 0.05, sustain: 0.0, release: 0.1 };
        break;
        
      case 'Pad':
        p.algorithm = 1;
        p.feedback = 0.2;
        p.operators[0] = { ...defaultOp(), level: 0.8, attack: 1.0, decay: 2.0, sustain: 0.8, release: 2.0 };
        p.operators[1] = { ...defaultOp(), ratio: 2, level: 0.4, attack: 1.5, decay: 2.0, sustain: 0.6, release: 2.0 };
        p.operators[2] = { ...defaultOp(), ratio: 1.01, level: 0.3, attack: 0.5, decay: 1.0, sustain: 0.5, release: 2.0 };
        p.operators[3] = { ...defaultOp(), ratio: 4, level: 0.1, attack: 2.0, decay: 1.0, sustain: 0.2, release: 2.0 };
        break;
        
      case 'Digital Glitch':
        p.algorithm = 2;
        p.feedback = 0.8;
        p.operators[0] = { ...defaultOp(), level: 1.0, attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.1 };
        p.operators[1] = { ...defaultOp(), ratio: 7, level: 0.9, attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.1 };
        p.operators[2] = { ...defaultOp(), ratio: 0.25, level: 0.8, attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.1 };
        p.operators[3] = { ...defaultOp(), ratio: 11, level: 1.5, attack: 0.01, decay: 0.4, sustain: 0.0, release: 0.1 };
        break;
        
      case 'Vintage Lead':
        p.algorithm = 1;
        p.feedback = 0.0;
        p.operators[0] = { ...defaultOp(), level: 1.0, attack: 0.05, decay: 0.5, sustain: 0.8, release: 0.2 };
        p.operators[1] = { ...defaultOp(), ratio: 1.0, level: 0.0, attack: 0.01, decay: 0.1, sustain: 0.0, release: 0.2 };
        break;
    }

    return p;
  }
}
