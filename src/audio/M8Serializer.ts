import type { FmParams } from './FmEngine';
// @ts-ignore
import { dumpM8File } from 'm8-js';
// @ts-ignore
import FMSYNTH from 'm8-js/lib/types/instruments/FMSYNTH';

export class M8Serializer {
  public serializeFmInstrument(params: FmParams): Uint8Array {
    const instr = new FMSYNTH();
    instr.name = 'M8FM_PATCH';

    // Set Algorithm
    // Our 1 is M8's algo 0?
    // Let's just map 1->0, 2->1, 3->2
    instr.instrParams.algo = Math.max(0, params.algorithm - 1);

    // Map operators
    for (let i = 0; i < 4; i++) {
      const opParams = params.operators[i];
      const m8Op = instr.instrParams.operators[i];
      
      // M8 ratio: integer 0-15
      m8Op.ratio = Math.floor(opParams.ratio);
      // M8 ratioFine: fractional 0-255
      m8Op.ratioFine = Math.floor((opParams.ratio % 1) * 255);
      
      // Level 0-128
      m8Op.level = Math.floor(opParams.level * 127);
      m8Op.shape = 0; // Sine
    }

    // Set feedback for Op1 (if algo allows, typically M8 has feedback on Op1 or 4 depending on algo)
    // We'll set feedback on operator 0 (which is Op1 in our engine)
    instr.instrParams.operators[0].feedback = Math.floor(params.feedback * 127);

    // Envelopes
    if (params.env1) {
      // Env1 is always Volume on M8
      instr.envelopes[0].attack = Math.min(255, Math.floor(params.env1.attack * 255));
      instr.envelopes[0].hold = params.env1.hold >= 999 ? 255 : Math.min(254, Math.floor(params.env1.hold * 255));
      instr.envelopes[0].decay = Math.min(255, Math.floor(params.env1.decay * 255));
    }

    if (params.env2) {
      instr.envelopes[1].attack = Math.min(255, Math.floor(params.env2.attack * 255));
      instr.envelopes[1].hold = params.env2.hold >= 999 ? 255 : Math.min(254, Math.floor(params.env2.hold * 255));
      instr.envelopes[1].decay = Math.min(255, Math.floor(params.env2.decay * 255));
      instr.envelopes[1].amount = Math.min(255, Math.floor(params.env2.amount * 255));
      
      const destMap: Record<string, number> = {
        'none': 0,
        'volume': 1,
        'pitch': 2,
        'mod1': 3,
        'mod2': 4,
        'mod3': 5,
        'mod4': 6
      };
      instr.envelopes[1].dest = destMap[params.env2.dest] || 0;
    }

    // LFOs
    const mapLfo = (lfoData: any, lfoObj: any) => {
      if (!lfoData || lfoData.dest === 'none') {
        lfoObj.amount = 0;
        return;
      }
      lfoObj.amount = Math.min(255, Math.floor(lfoData.amount * 255));
      lfoObj.freq = Math.min(255, Math.floor(lfoData.freq * 10)); // Arbitrary scaling for M8 freq 0-255

      const destMap: Record<string, number> = {
        'none': 0,
        'volume': 1,
        'pitch': 2,
        'mod1': 3,
        'mod2': 4,
        'mod3': 5,
        'mod4': 6
      };
      lfoObj.dest = destMap[lfoData.dest] || 0;

      const shapeMap: Record<string, number> = {
        'triangle': 0,
        'sine': 1,
        'sawtooth': 2,
        'square': 6
      };
      lfoObj.shape = shapeMap[lfoData.shape] || 1;
    };

    mapLfo(params.lfo1, instr.lfos[0]);
    mapLfo(params.lfo2, instr.lfos[1]);

    // Dump to binary
    return dumpM8File(instr);
  }

  public downloadM8Instrument(filename: string, params: FmParams) {
    const bytes = this.serializeFmInstrument(params);
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.m8i') ? filename : `${filename}.m8i`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
