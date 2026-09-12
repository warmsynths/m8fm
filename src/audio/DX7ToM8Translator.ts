import type { Dx7Op, Dx7Patch } from './SysExParser';
import {
  DEST_VOLUME,
  FILTER_OFF,
  OSC_SIN,
  clampByte,
  createDefaultPatch,
  multiplierToRatio,
  secondsToEnvAttack,
  secondsToEnvDecay
} from './M8Patch';
import type { M8Patch } from './M8Patch';

/**
 * Folds a 6-operator DX7 voice down to the M8's 4 operators.
 *
 * The M8 has no 6-op mode, so this is lossy by construction: two operators are
 * dropped and the DX7's 32 algorithms are collapsed onto the M8's 12. The result
 * is a starting point to tweak on the device, not a faithful port.
 */
export class DX7ToM8Translator {
  /** DX7 EG rates run backwards: 99 is instant, 0 is very slow. */
  private static rateToSeconds(rate: number): number {
    if (rate <= 0) return 10.0;
    return 10.0 * Math.pow(0.5, rate / 10.0);
  }

  /** DX7 output levels are roughly 0.75 dB per step with 99 at unity. */
  private static levelToByte(dx7Level: number): number {
    if (dx7Level <= 0) return 0;
    const db = (dx7Level - 99) * 0.75;
    return clampByte(Math.pow(10, db / 20.0) * 255);
  }

  private static ratioMultiplier(op: Dx7Op): number {
    // Fixed-frequency operators have no M8 equivalent, so they fall back to 1:1.
    if (op.mode === 1) return 1.0;
    const coarse = op.coarse === 0 ? 0.5 : op.coarse;
    return coarse + op.fine / 100.0;
  }

  /**
   * DX7 algorithms 1-6 are deep stacks, 7-17 mix a stack with parallel
   * modulators, 18-31 have several carriers, and 32 is fully additive.
   */
  private static m8Algo(dx7Algorithm: number): number {
    if (dx7Algorithm >= 32) return 0x0b; // A+B+C+D
    if (dx7Algorithm >= 22) return 0x08; // [A>B]+[A>C]+[A>D]
    if (dx7Algorithm >= 18) return 0x07; // [A>B]+[C>D]
    if (dx7Algorithm >= 7) return 0x04;  // [A+B+C]>D
    return 0x00;                         // A>B>C>D
  }

  /**
   * @param patch - the parsed DX7 voice
   * @param keepIndices - which four DX7 operators to keep; when omitted the four
   *   with the highest output level are used.
   */
  public static translate(patch: Dx7Patch, keepIndices?: number[]): M8Patch {
    let kept = keepIndices;
    if (!kept || kept.length !== 4) {
      kept = patch.ops
        .map((op, index) => ({ index, level: op.level }))
        .sort((a, b) => b.level - a.level)
        .slice(0, 4)
        .map((s) => s.index)
        .sort((a, b) => a - b);
    }

    const out = createDefaultPatch();
    out.name = patch.name.slice(0, 12) || 'DX7';
    out.algo = this.m8Algo(patch.algorithm);
    out.filter = { type: FILTER_OFF, cutoff: 0xff, res: 0x00 };

    for (let i = 0; i < 4; i++) {
      const op = patch.ops[kept[i]];
      const { ratio, ratioFine } = multiplierToRatio(this.ratioMultiplier(op));
      out.operators[i] = {
        shape: OSC_SIN,
        ratio,
        ratioFine,
        level: this.levelToByte(op.level),
        // DX7 feedback is per-algorithm rather than per-operator; scale it down
        // so an imported voice does not arrive as a noise generator.
        feedback: clampByte((patch.feedback / 7) * 0x50),
        modA: 0x00,
        modB: 0x00
      };
    }

    // The M8 has no per-operator envelopes, so the loudest kept operator's EG
    // becomes the instrument's amplitude envelope. Without this the imported
    // voice would have no VOLUME modulator at all and would drone.
    const loudest = patch.ops[kept.reduce((best, i) => (patch.ops[i].level > patch.ops[best].level ? i : best), kept[0])];
    out.envelopes[0] = {
      amount: 0xff,
      attack: secondsToEnvAttack(this.rateToSeconds(loudest.egRate[0])),
      hold: 0x00,
      decay: secondsToEnvDecay(this.rateToSeconds(loudest.egRate[1])),
      dest: DEST_VOLUME,
      retrigger: 0x00
    };

    return out;
  }
}
