import type { FmParams, OperatorParams, EnvParams, LfoParams } from './FmEngine';

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

  private getMacroVal(name: string): number {
    return this.macroState[name] || 0.0;
  }

  private applyElectricPianoMath(params: FmParams) {
    const tine = this.getMacroVal('Tine Material');
    const ratios = [2.0, 3.0, 4.0, 5.0, 7.0, 14.0];
    const tineIndex = Math.min(ratios.length - 1, Math.floor(tine * ratios.length));
    params.operators[3].ratio = ratios[tineIndex];

    const strike = this.getMacroVal('Strike Force');
    if (params.env2) {
      params.env2.amount = 0.05 + strike * 0.2;
      params.env2.decay = 0.3 - strike * 0.1;
    }

    const bark = this.getMacroVal('Bark');
    params.feedback += bark * 0.15;
    params.operators[1].level += bark * 0.1;

    const tremolo = this.getMacroVal('Tremolo Depth');
    if (params.lfo1) {
      params.lfo1.dest = 'volume';
      params.lfo1.amount = tremolo * 0.8;
      params.lfo1.freq = 4.0 + tremolo * 4.0;
    }
  }

  private applySubBassMath(params: FmParams) {
    const weight = this.getMacroVal('Sub Weight');
    params.operators[1].level += weight * 0.15;

    const growl = this.getMacroVal('Top-End Growl');
    if (growl > 0) {
      params.operators[3].ratio = 2.0 + Math.floor(growl * 2.0);
      params.operators[3].level += growl * 0.15;
      params.feedback += growl * 0.05;
    }

    const pitchSnap = this.getMacroVal('Pitch Snap');
    const boom = this.getMacroVal('Boom');
    
    if (params.env2) {
      if (pitchSnap > 0) {
        params.env2.dest = 'pitch';
        params.env2.amount = pitchSnap * 0.8;
        params.env2.decay = 0.02 + (1.0 - pitchSnap) * 0.1;
      } else if (boom > 0) {
        params.env2.dest = 'mod3';
        params.env2.amount = boom * 0.3;
        params.env2.decay = 0.02 + boom * 0.08;
      } else {
        params.env2.amount = 0;
      }
    }
  }

  private applyMalletMath(params: FmParams) {
    const focus = this.getMacroVal('Harmonic Focus');
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
    if (params.env1) {
      params.env1.decay *= (0.2 + (1.0 - dampening) * 0.8);
    }
    if (params.env2) {
      params.env2.decay *= (0.2 + (1.0 - dampening) * 0.8);
    }

    const impact = this.getMacroVal('Impact Noise');
    if (params.env2) {
      params.env2.amount = impact * 0.15;
    }
  }

  private applyPadMath(params: FmParams) {
    const wash = this.getMacroVal('Wash');
    const attackTime = 0.1 + (wash * 2.9);
    if (params.env1) params.env1.attack = attackTime;
    if (params.env2) params.env2.attack = attackTime * 1.5;

    const shimmer = this.getMacroVal('Shimmer');
    params.operators[3].ratio = shimmer > 0.5 ? 8.0 : 4.0;
    if (params.env2) {
      params.env2.amount = shimmer * 0.15;
    }

    const chorus = this.getMacroVal('Chorus');
    if (params.lfo1 && chorus > 0) {
      params.lfo1.dest = 'pitch';
      params.lfo1.amount = chorus * 0.01;
      params.lfo1.freq = 0.5 + chorus * 2.0;
    }

    const hollow = this.getMacroVal('Hollow');
    if (hollow > 0) {
      params.operators[1].ratio = 1.0 + hollow * 1.0; 
      params.operators[1].level += hollow * 0.1; 
      params.operators[0].level = 0.8 - hollow * 0.2;
    }
  }

  private applyDigitalGlitchMath(params: FmParams) {
    const dirt = this.getMacroVal('Digital Dirt');
    params.feedback = dirt * 0.4;

    const zap = this.getMacroVal('Laser Zap');
    if (params.env2) {
      params.env2.amount = zap * 4.0;
      params.env2.decay = 0.05 + ((1.0 - zap) * 0.2);
    }

    const pw = this.getMacroVal('Pulse Width');
    if (params.lfo1 && pw > 0) {
      params.lfo1.dest = 'mod1';
      params.lfo1.amount = pw * 0.5;
      params.lfo1.freq = 1.0 + pw * 10.0;
    }
  }

  private applyVintageLeadMath(params: FmParams) {
    const timbre = this.getMacroVal('Timbre');
    
    if (timbre < 0.5) {
      params.operators[1].ratio = 1.0;
      params.feedback = (timbre * 2) * 0.15;
    } else {
      const squareBlend = (timbre - 0.5) * 2;
      params.operators[1].ratio = 1.0 + squareBlend * 1.0;
      params.feedback = 0.15 - (squareBlend * 0.15);
    }

    const cutoff = this.getMacroVal('Filter Cutoff');
    const filterEnv = this.getMacroVal('Filter Envelope');

    params.operators[1].level = cutoff * 0.25;
    
    if (params.env2) {
      params.env2.amount = filterEnv * 0.2;
      params.env2.decay = 0.01 + filterEnv * 0.8;
      params.env2.hold = 0; 
    }

    const slop = this.getMacroVal('Analog Slop');
    if (params.lfo1 && slop > 0) {
      params.lfo1.dest = 'pitch';
      params.lfo1.amount = slop * 0.02;
      params.lfo1.freq = 0.1 + slop * 1.5;
      params.lfo1.shape = 'sine';
    }
  }

  private getAnchorParams(anchor: AnchorName): FmParams {
    const defaultOp = (): OperatorParams => ({ ratio: 1, level: 0.0 });
    const defaultEnv = (): EnvParams => ({ attack: 0.01, hold: 999, decay: 0.1, amount: 1.0, dest: 'none' });
    const defaultLfo = (): LfoParams => ({ shape: 'sine', freq: 1.0, amount: 0.0, dest: 'none' });

    const p: FmParams = {
      algorithm: 1,
      feedback: 0.0,
      operators: [defaultOp(), defaultOp(), defaultOp(), defaultOp()],
      env1: defaultEnv(),
      env2: defaultEnv(),
      lfo1: defaultLfo(),
      lfo2: defaultLfo()
    };

    switch (anchor) {
      case 'Electric Piano':
        p.algorithm = 2;
        p.operators[0] = { ...defaultOp(), level: 1.0 };
        p.operators[1] = { ...defaultOp(), ratio: 1.0, level: 0.05 };
        p.operators[2] = { ...defaultOp(), level: 0.5 };
        p.operators[3] = { ...defaultOp(), ratio: 14.0, level: 0.0 };
        
        p.env1 = { attack: 0.01, hold: 0, decay: 2.0, amount: 1.0, dest: 'none' };
        p.env2 = { attack: 0.01, hold: 0, decay: 0.3, amount: 0.05, dest: 'mod4' };
        break;

      case 'Sub Bass':
        p.algorithm = 3;
        p.operators[0] = { ...defaultOp(), ratio: 0.25, level: 1.0 }; // 2 octaves down
        p.operators[1] = { ...defaultOp(), ratio: 1.0, level: 0.0 };
        p.operators[2] = { ...defaultOp(), ratio: 1.0, level: 0.0 };
        p.operators[3] = { ...defaultOp(), ratio: 2.0, level: 0.0 };
        
        p.env1 = { attack: 0.01, hold: 999, decay: 0.4, amount: 1.0, dest: 'none' };
        p.env2 = { attack: 0.01, hold: 0, decay: 0.1, amount: 0.0, dest: 'pitch' };
        break;

      case 'Mallet':
        p.algorithm = 3;
        p.operators[0] = { ...defaultOp(), level: 1.0 };
        p.operators[1] = { ...defaultOp(), ratio: 2.0, level: 0.1 };
        p.operators[2] = { ...defaultOp(), ratio: 3.0, level: 0.05 };
        p.operators[3] = { ...defaultOp(), ratio: 15.0, level: 0.0 };
        
        p.env1 = { attack: 0.005, hold: 0, decay: 1.0, amount: 1.0, dest: 'none' };
        p.env2 = { attack: 0.005, hold: 0, decay: 0.05, amount: 0.0, dest: 'mod4' };
        break;

      case 'Pad':
        p.algorithm = 2;
        p.operators[0] = { ...defaultOp(), level: 1.0 }; // Max carrier level
        p.operators[1] = { ...defaultOp(), ratio: 1.0, level: 0.05 };
        p.operators[2] = { ...defaultOp(), ratio: 1.0, level: 1.0 }; // Max carrier level
        p.operators[3] = { ...defaultOp(), ratio: 2.0, level: 0.0 };
        
        p.env1 = { attack: 0.8, hold: 999, decay: 2.5, amount: 1.0, dest: 'none' };
        p.env2 = { attack: 1.5, hold: 999, decay: 2.5, amount: 0.02, dest: 'mod4' };
        break;

      case 'Digital Glitch':
        p.algorithm = 2;
        p.feedback = 0.1;
        p.operators[0] = { ...defaultOp(), level: 1.0 };
        p.operators[1] = { ...defaultOp(), ratio: 7.0, level: 0.3 };
        p.operators[2] = { ...defaultOp(), ratio: 0.25, level: 0.8 };
        p.operators[3] = { ...defaultOp(), ratio: 11.0, level: 0.4 };
        
        p.env1 = { attack: 0.01, hold: 999, decay: 0.1, amount: 1.0, dest: 'none' };
        p.env2 = { attack: 0.01, hold: 0, decay: 0.1, amount: 0.0, dest: 'pitch' };
        break;

      case 'Vintage Lead':
        p.algorithm = 1;
        p.operators[0] = { ...defaultOp(), level: 1.0 };
        p.operators[1] = { ...defaultOp(), ratio: 1.0, level: 0.0 };
        
        p.env1 = { attack: 0.05, hold: 999, decay: 0.2, amount: 1.0, dest: 'none' };
        p.env2 = { attack: 0.005, hold: 0, decay: 0.5, amount: 0.0, dest: 'mod2' };
        break;
    }

    return p;
  }
}
