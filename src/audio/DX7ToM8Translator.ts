import type { Dx7Patch, Dx7Op } from './SysExParser';
import type { FmParams, OperatorParams } from './FmEngine';

export class DX7ToM8Translator {
  
  // Maps a DX7 value (0-99) to a time value in seconds (roughly)
  // DX7 envelopes are rates, so 99 is fast (0s), 0 is slow (long)
  private static mapRateToSeconds(rate: number): number {
    if (rate === 0) return 10.0;
    // rough exponential curve
    return 10.0 * Math.pow(0.5, rate / 10.0);
  }

  private static mapLevel(dx7Level: number): number {
    if (dx7Level === 0) return 0;
    // DX7 levels are roughly 0.75 dB per step, with 99 being 0dB
    const db = (dx7Level - 99) * 0.75;
    return Math.pow(10, db / 20.0);
  }

  private static mapRatio(op: Dx7Op): number {
    if (op.mode === 1) { // Fixed frequency
      return 1.0; // M8 only supports ratios easily
    }
    const coarse = op.coarse === 0 ? 0.5 : op.coarse;
    return coarse + (op.fine / 100.0);
  }

  public static translate(patch: Dx7Patch, keepIndices?: number[]): { m8Params: FmParams, fullParams: FmParams } {
    const fullParams: FmParams = {
      algorithm: patch.algorithm,
      feedback: (patch.feedback / 7.0) * 0.3,
      operators: []
    };

    // Build the full 6-operator patch parameters
    for (let i = 0; i < 6; i++) {
      const op = patch.ops[i];
      fullParams.operators.push({
        ratio: this.mapRatio(op),
        level: this.mapLevel(op.level),
        attack: this.mapRateToSeconds(op.egRate[0]),
        decay: this.mapRateToSeconds(op.egRate[1]),
        sustain: op.egLevel[2] / 99.0,
        release: this.mapRateToSeconds(op.egRate[3]),
        pitchEnvDepth: 0,
        pitchEnvDecay: 0,
      });
    }

    const m8Params: FmParams = {
      algorithm: 1,
      feedback: (patch.feedback / 7.0) * 0.3, // Scale down feedback to prevent M8 noise blowout
      operators: []
    };

    // Heuristic: Drop the 2 operators with the lowest output levels.
    // If it's a carrier, it will have a high level.
    // If it's a modulator, its level determines modulation index.
    // We'll score operators by their level. 
    // DX7 Ops are stored 0=Op1 ... 5=Op6.
    
    let keptIndices = keepIndices;
    if (!keptIndices || keptIndices.length !== 4) {
      // Create an array of operator indices and sort by level (descending)
      const opScores = patch.ops.map((op, index) => ({ index, level: op.level }));
      opScores.sort((a, b) => b.level - a.level);
      
      // Take the top 4
      keptIndices = opScores.slice(0, 4).map(s => s.index).sort();
    }
    
    const keptOps = keptIndices.map(idx => patch.ops[idx]);

    // Map the 4 kept operators to M8 OperatorParams
    for (let i = 0; i < 4; i++) {
      const dx7Op = keptOps[i];
      const opParams: OperatorParams = {
        ratio: this.mapRatio(dx7Op),
        level: this.mapLevel(dx7Op.level),
        attack: this.mapRateToSeconds(dx7Op.egRate[0]),
        decay: this.mapRateToSeconds(dx7Op.egRate[1]), // Simple mapping
        sustain: this.mapLevel(dx7Op.egLevel[2]), 
        release: this.mapRateToSeconds(dx7Op.egRate[3]),
        pitchEnvDepth: 0,
        pitchEnvDecay: 0
      };
      m8Params.operators.push(opParams);
    }

    // Heuristic for picking the M8 algorithm (1, 2, or 3)
    // DX7 algorithms 1-18 mostly have 1 carrier. Algorithms 19-32 have multiple carriers.
    // We'll use a very basic heuristic:
    if (patch.algorithm >= 18) {
      m8Params.algorithm = 2; // (Op4->Op3) + (Op2->Op1)
    } else if (patch.algorithm >= 7 && patch.algorithm <= 11) {
      m8Params.algorithm = 3; // (Op4+Op3+Op2)->Op1
    } else {
      m8Params.algorithm = 1; // Op4->Op3->Op2->Op1
    }

    return { m8Params, fullParams };
  }
}
