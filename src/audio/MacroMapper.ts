import type { FmParams, OperatorParams } from './FmEngine';

export type AnchorName = 'Electric Piano' | 'Sub Bass' | 'Mallet' | 'Pad' | 'Digital Glitch' | 'Vintage Lead';

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
  private macroState: Record<string, number> = {};
  private currentAnchor: AnchorName;

  constructor(initialAnchor: AnchorName = 'Electric Piano') {
    this.currentAnchor = initialAnchor;
    this.baseParams = this.getAnchorParams(this.currentAnchor);
    this.currentParams = JSON.parse(JSON.stringify(this.baseParams));
  }

  public loadAnchor(anchorName: AnchorName) {
    this.currentAnchor = anchorName;
    this.baseParams = this.getAnchorParams(anchorName);
    // Reset macros on machine switch
    this.macroState = {};
    this.updateParams();
  }

  public setMacro(macroName: string, normalizedValue: number) {
    this.macroState[macroName] = Math.max(0, Math.min(1, normalizedValue));
    this.updateParams();
  }

  public getComputedFmParams(): FmParams {
    return this.currentParams;
  }

  private updateParams() {
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

  // --- DSP Math Transformations (Restricted to Musical Ranges) --- //

  private getMacroVal(name: string): number {
    return this.macroState[name] || 0.0;
  }

  private applyElectricPianoMath(params: FmParams) {
    const tine = this.getMacroVal('Tine Material');
    // Musical integer/simple fractional ratios
    const ratios = [2.0, 3.0, 4.0, 5.0, 7.0, 14.0];
    const tineIndex = Math.min(ratios.length - 1, Math.floor(tine * ratios.length));
    params.operators[3].ratio = ratios[tineIndex];

    const strike = this.getMacroVal('Strike Force');
    // Gentle brightness increase. Mod levels kept very low (<0.3) to avoid harsh jaggy saw waves.
    params.operators[1].level += strike * 0.15; 
    params.operators[3].level += strike * 0.15;
    // Faster attack on hard strikes
    params.operators[1].attack = Math.max(0.005, 0.015 - strike * 0.01);
    params.operators[3].attack = Math.max(0.005, 0.015 - strike * 0.01);

    const bark = this.getMacroVal('Bark');
    // Very gentle feedback for warmth, not distortion
    params.feedback += bark * 0.15;
    params.operators[1].level += bark * 0.1;
  }

  private applySubBassMath(params: FmParams) {
    const weight = this.getMacroVal('Sub Weight');
    // Gently thickens the tone without turning into a noisy buzz
    params.operators[1].level += weight * 0.15;
    params.operators[1].ratio = weight > 0.5 ? 0.5 : 1.0; 

    const pitchSnap = this.getMacroVal('Pitch Snap');
    if (pitchSnap > 0) {
      params.operators[0].pitchEnvDepth = pitchSnap * 0.8; // Musical pitch drop
      params.operators[0].pitchEnvDecay = 0.02 + (1.0 - pitchSnap) * 0.1;
    }

    const growl = this.getMacroVal('Top-End Growl');
    if (growl > 0) {
      // Warm, harmonic saturation using integer ratios
      params.operators[3].ratio = 2.0 + Math.floor(growl * 2.0); // 2, 3, or 4
      params.operators[3].level += growl * 0.15; // Max 0.15 mod level is sweet
      params.feedback += growl * 0.05; // Extremely gentle feedback
    }

    const boom = this.getMacroVal('Boom');
    if (boom > 0) {
      // Adds a thumpy envelope to Op3 for classic 808 transient
      params.operators[2].level += boom * 0.3; // Gentle thump
      params.operators[2].ratio = 1.0;
      params.operators[2].attack = 0.005;
      params.operators[2].decay = 0.02 + boom * 0.08;
    }
  }

  private applyMalletMath(params: FmParams) {
    const focus = this.getMacroVal('Harmonic Focus');
    // Stick strictly to musical integer and half-integer ratios
    if (focus < 0.33) {
      params.operators[1].ratio = 2.0;
      params.operators[2].ratio = 3.0;
    } else if (focus < 0.66) {
      params.operators[1].ratio = 2.0;
      params.operators[2].ratio = 4.0;
    } else {
      params.operators[1].ratio = 3.0;
      params.operators[2].ratio = 5.0;
    }

    const dampening = this.getMacroVal('Dampening');
    // Smooth decay scaling
    for (let i = 0; i < 4; i++) {
      params.operators[i].decay *= (0.2 + dampening * 2.0);
      params.operators[i].release *= (0.2 + dampening * 2.0);
    }

    const impact = this.getMacroVal('Impact Noise');
    if (impact > 0) {
      params.operators[3].attack = 0.005;
      params.operators[3].decay = 0.02; // Very short
      params.operators[3].sustain = 0.0;
      params.operators[3].level += impact * 0.15; // Kept very low to stay musical
      params.operators[3].ratio = 15.0; 
    }
  }

  private applyPadMath(params: FmParams) {
    const wash = this.getMacroVal('Wash');
    const attackTime = 0.1 + (wash * 2.9); // 0.1s to 3.0s
    for (let i = 0; i < 4; i++) {
      params.operators[i].attack = attackTime * (1.0 + i * 0.1); 
    }

    const shimmer = this.getMacroVal('Shimmer');
    if (shimmer > 0) {
      // High harmonic but extremely soft level
      params.operators[3].ratio = shimmer > 0.5 ? 8.0 : 4.0;
      params.operators[3].level += shimmer * 0.15; // Kept very low to avoid harshness
      params.operators[3].attack += shimmer * 1.5;
    }

    const chorus = this.getMacroVal('Chorus');
    if (chorus > 0) {
      // Musical detune spread
      params.operators[2].ratio += 0.005 * chorus; 
      params.operators[3].ratio += 0.01 * chorus; 
    }

    const hollow = this.getMacroVal('Hollow');
    if (hollow > 0) {
      // Smoothly crossfade pair 1 to a 2.0 ratio (square-ish)
      params.operators[1].ratio = 1.0 + hollow * 1.0; 
      params.operators[1].level += hollow * 0.1; 
      params.operators[0].level = 0.8 - hollow * 0.2;
    }
  }

  private applyDigitalGlitchMath(params: FmParams) {
    const dirt = this.getMacroVal('Digital Dirt');
    params.feedback = dirt * 0.4; // Max 0.4 to prevent absolute noise death

    const zap = this.getMacroVal('Laser Zap');
    if (zap > 0) {
      for (let i = 0; i < 4; i++) {
        params.operators[i].pitchEnvDepth = zap * 4.0;
        params.operators[i].pitchEnvDecay = 0.05 + ((1.0 - zap) * 0.2);
      }
    }

    const pw = this.getMacroVal('Pulse Width');
    const pwRatios = [1.0, 2.0, 3.0, 4.0]; // Musical integers
    const pwIndex = Math.min(pwRatios.length - 1, Math.floor(pw * pwRatios.length));
    params.operators[1].ratio = pwRatios[pwIndex];
  }

  private applyVintageLeadMath(params: FmParams) {
    const timbre = this.getMacroVal('Timbre');
    params.feedback = timbre * 0.2; // Warmth, not noise

    const cutoff = this.getMacroVal('Filter Cutoff');
    params.operators[1].level = cutoff * 0.3; // Max 0.3 mod level

    const filterEnv = this.getMacroVal('Filter Envelope');
    params.operators[1].decay = 0.01 + (filterEnv * 1.99);

    const slop = this.getMacroVal('Analog Slop');
    if (slop > 0) {
      params.operators[0].ratio += slop * 0.01;
      params.operators[1].ratio -= slop * 0.02;
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
        p.algorithm = 2; // (Op4 -> Op3) + (Op2 -> Op1) -> Out
        p.feedback = 0.0;
        // Body (Pair 1)
        p.operators[0] = { ...defaultOp(), level: 1.0, attack: 0.01, decay: 2.0, sustain: 0.4, release: 0.8 };
        p.operators[1] = { ...defaultOp(), ratio: 1.0, level: 0.05, attack: 0.01, decay: 1.5, sustain: 0.1, release: 0.8 };
        // Tine (Pair 2)
        p.operators[2] = { ...defaultOp(), level: 0.5, attack: 0.01, decay: 2.0, sustain: 0.2, release: 0.8 };
        p.operators[3] = { ...defaultOp(), ratio: 14.0, level: 0.05, attack: 0.01, decay: 0.3, sustain: 0.0, release: 0.8 };
        break;

      case 'Sub Bass':
        p.algorithm = 3; // (Op4+Op3+Op2) -> Op1
        p.feedback = 0.0;
        // Carrier (Fundamental)
        p.operators[0] = { ...defaultOp(), level: 1.0, attack: 0.01, decay: 1.0, sustain: 1.0, release: 0.4 };
        // Mod 1 (Sub/Thickener)
        p.operators[1] = { ...defaultOp(), ratio: 1.0, level: 0.0, attack: 0.01, decay: 1.0, sustain: 0.8, release: 0.4 };
        // Mod 2 (Boom/Punch)
        p.operators[2] = { ...defaultOp(), ratio: 1.0, level: 0.0, attack: 0.005, decay: 0.1, sustain: 0.0, release: 0.1 };
        // Mod 3 (Growl/Top-end)
        p.operators[3] = { ...defaultOp(), ratio: 2.0, level: 0.0, attack: 0.05, decay: 0.5, sustain: 0.2, release: 0.2 };
        break;

      case 'Mallet':
        p.algorithm = 3; // (Op4+Op3+Op2) -> Op1
        p.feedback = 0.0;
        p.operators[0] = { ...defaultOp(), level: 1.0, attack: 0.005, decay: 1.0, sustain: 0.0, release: 0.5 };
        p.operators[1] = { ...defaultOp(), ratio: 2.0, level: 0.1, attack: 0.005, decay: 0.5, sustain: 0.0, release: 0.4 };
        p.operators[2] = { ...defaultOp(), ratio: 3.0, level: 0.05, attack: 0.005, decay: 0.3, sustain: 0.0, release: 0.2 };
        p.operators[3] = { ...defaultOp(), ratio: 5.0, level: 0.05, attack: 0.005, decay: 0.1, sustain: 0.0, release: 0.1 };
        break;

      case 'Pad':
        p.algorithm = 2; // (Op4->Op3) + (Op2->Op1) -> Out
        p.feedback = 0.0;
        // Pair 1 (Warm body)
        p.operators[0] = { ...defaultOp(), level: 0.8, attack: 0.8, decay: 3.0, sustain: 0.8, release: 2.5 };
        p.operators[1] = { ...defaultOp(), ratio: 1.0, level: 0.05, attack: 1.0, decay: 3.0, sustain: 0.7, release: 2.5 };
        // Pair 2 (Shimmer layer)
        p.operators[2] = { ...defaultOp(), ratio: 1.0, level: 0.6, attack: 1.2, decay: 3.0, sustain: 0.6, release: 2.5 };
        p.operators[3] = { ...defaultOp(), ratio: 2.0, level: 0.02, attack: 1.5, decay: 3.0, sustain: 0.5, release: 2.5 };
        break;

      case 'Digital Glitch':
        p.algorithm = 2;
        p.feedback = 0.1;
        p.operators[0] = { ...defaultOp(), level: 1.0, attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.1 };
        p.operators[1] = { ...defaultOp(), ratio: 7.0, level: 0.3, attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.1 };
        p.operators[2] = { ...defaultOp(), ratio: 0.25, level: 0.8, attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.1 };
        p.operators[3] = { ...defaultOp(), ratio: 11.0, level: 0.4, attack: 0.01, decay: 0.4, sustain: 0.0, release: 0.1 };
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
