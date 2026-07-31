import type { FmParams } from './MacroMapper';
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
    // M8 has 2 envelopes. We'll average out carrier env to Env1 and modulator env to Env2
    const carrierEnv = params.operators[0];
    const modEnv = params.operators[1];

    instr.envelopes[0].attack = Math.floor(carrierEnv.attack * 255);
    instr.envelopes[0].decay = Math.floor(carrierEnv.decay * 255);
    
    // Check if any operator has a pitch envelope
    const pitchOp = params.operators.find(op => op.pitchEnvDepth > 0 && op.pitchEnvDecay > 0);
    if (pitchOp) {
      // Map pitch envelope to env 2
      instr.envelopes[1].attack = 0;
      instr.envelopes[1].decay = Math.floor(pitchOp.pitchEnvDecay * 255);
      instr.envelopes[1].amount = Math.floor(Math.min(1.0, pitchOp.pitchEnvDepth) * 255);
      instr.envelopes[1].dest = 1; // Assuming 1 is Pitch destination in M8
    } else {
      // Fallback: use for modulator volume envelope
      instr.envelopes[1].attack = Math.floor(modEnv.attack * 255);
      instr.envelopes[1].decay = Math.floor(modEnv.decay * 255);
    }

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
