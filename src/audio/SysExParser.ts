export interface Dx7Op {
  egRate: number[];    // 1-4
  egLevel: number[];   // 1-4
  level: number;
  mode: number;        // 0=Ratio, 1=Fixed
  coarse: number;
  fine: number;
  detune: number;      // 0-14 (7 is center)
}

export interface Dx7Patch {
  name: string;
  algorithm: number;
  feedback: number;
  ops: Dx7Op[]; // 0 is Op1, 5 is Op6
}

export class SysExParser {
  // Parse a 128-byte packed voice
  private static parsePackedVoice(data: Uint8Array, offset: number): Dx7Patch {
    const patch: Dx7Patch = {
      name: '',
      algorithm: 0,
      feedback: 0,
      ops: []
    };

    // Operators are stored Op6 (index 0) down to Op1 (index 5)
    // 17 bytes per operator
    for (let opIdx = 0; opIdx < 6; opIdx++) {
      const opBase = offset + opIdx * 17;
      const detunePacked = data[opBase + 12];
      const detune = (detunePacked >> 3) & 0x0F;
      const oscPacked = data[opBase + 15];
      const mode = oscPacked & 0x01;
      const coarse = (oscPacked >> 1) & 0x1F;

      const op: Dx7Op = {
        egRate: [data[opBase + 0], data[opBase + 1], data[opBase + 2], data[opBase + 3]],
        egLevel: [data[opBase + 4], data[opBase + 5], data[opBase + 6], data[opBase + 7]],
        level: data[opBase + 14],
        mode,
        coarse,
        fine: data[opBase + 16],
        detune
      };
      // Prepend so index 0 = Op1, index 5 = Op6
      patch.ops.unshift(op);
    }

    const globalBase = offset + 102;
    patch.algorithm = data[globalBase + 8];
    const fbkSync = data[globalBase + 9];
    patch.feedback = fbkSync & 0x07;

    let name = '';
    for (let i = 0; i < 10; i++) {
      const charCode = data[globalBase + 16 + i];
      if (charCode >= 32 && charCode <= 126) {
        name += String.fromCharCode(charCode);
      } else {
        name += ' ';
      }
    }
    patch.name = name.trim() || 'INIT VOICE';

    return patch;
  }

  // Parse a 155-byte unpacked voice (VCED)
  private static parseUnpackedVoice(data: Uint8Array, offset: number): Dx7Patch {
    const patch: Dx7Patch = {
      name: '',
      algorithm: 0,
      feedback: 0,
      ops: []
    };

    // 21 bytes per operator, Op6 down to Op1
    for (let opIdx = 0; opIdx < 6; opIdx++) {
      const opBase = offset + opIdx * 21;
      const op: Dx7Op = {
        egRate: [data[opBase + 0], data[opBase + 1], data[opBase + 2], data[opBase + 3]],
        egLevel: [data[opBase + 4], data[opBase + 5], data[opBase + 6], data[opBase + 7]],
        level: data[opBase + 16],
        mode: data[opBase + 17],
        coarse: data[opBase + 18],
        fine: data[opBase + 19],
        detune: data[opBase + 20]
      };
      patch.ops.unshift(op);
    }

    const globalBase = offset + 126;
    patch.algorithm = data[globalBase + 8];
    patch.feedback = data[globalBase + 9];

    let name = '';
    for (let i = 0; i < 10; i++) {
      const charCode = data[globalBase + 19 + i];
      if (charCode >= 32 && charCode <= 126) {
        name += String.fromCharCode(charCode);
      } else {
        name += ' ';
      }
    }
    patch.name = name.trim() || 'INIT VOICE';

    return patch;
  }

  public static parseFile(buffer: ArrayBuffer): Dx7Patch[] {
    const data = new Uint8Array(buffer);
    const patches: Dx7Patch[] = [];

    if (data[0] !== 0xF0) {
      throw new Error("Invalid file: not a SysEx message (missing 0xF0)");
    }

    if (data.length === 4104) {
      // 32-voice bulk dump
      for (let i = 0; i < 32; i++) {
        patches.push(this.parsePackedVoice(data, 6 + i * 128));
      }
    } else if (data.length === 163) {
      // Single voice VCED
      patches.push(this.parseUnpackedVoice(data, 6));
    } else {
      throw new Error(`Unsupported SysEx file size: ${data.length} bytes.`);
    }

    return patches;
  }
}
