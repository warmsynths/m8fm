/**
 * M8 FMSYNTH voice renderer.
 *
 * This runs inside an AudioWorklet because the M8's FM engine cannot be built
 * out of Web Audio nodes: it needs true phase modulation and per-sample
 * operator self-feedback. Wiring an OscillatorNode's `frequency` param is
 * *linear frequency* modulation, which detunes as the modulation index rises
 * and turns into the buzzing, out-of-tune mess this engine used to produce.
 * A DelayNode feedback loop has the same problem plus a 128-sample minimum
 * delay, which is why feedback used to sound like noise at any setting.
 *
 * The renderer is deliberately dumb: everything it needs arrives from the main
 * thread as a plain "render spec" already converted out of M8 units by
 * M8Patch.ts, so there is exactly one place that decides what a raw M8 value
 * means. M8FmRenderer holds all the DSP and has no dependency on the worklet
 * globals, which is what lets the test suite render patches offline.
 */

const MOD_TARGET_LEV = 0;
const MOD_TARGET_RAT = 1;
const MOD_TARGET_PIT = 2;
const MOD_TARGET_FBK = 3;

const DEST_VOLUME = 0x01;
const DEST_PITCH = 0x02;
const DEST_MOD1 = 0x03;
const DEST_CUTOFF = 0x07;
const DEST_RES = 0x08;
const DEST_AMP = 0x09;
const DEST_PAN = 0x0a;

const MAX_VOICES = 8;
/** Fast fade applied on note-off so releasing a key never clicks or hangs. */
const RELEASE_SECONDS = 0.006;
/** A voice is reclaimed once it has been below this level for SILENCE_SECONDS. */
const SILENCE_THRESHOLD = 1e-4;
const SILENCE_SECONDS = 0.05;

const TWO_PI = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Wraps a phase (in cycles) into [0, 1). */
function wrap(p) {
  return p - Math.floor(p);
}

class NoiseState {
  constructor() {
    this.lp = 0;
    this.hp = 0;
    this.last = 0;
  }

  next() {
    this.last = Math.random() * 2 - 1;
    return this.last;
  }

  lowpass() {
    this.lp += 0.15 * (this.next() - this.lp);
    return this.lp * 3;
  }

  highpass() {
    const n = this.next();
    this.hp += 0.5 * (n - this.hp);
    return n - this.hp;
  }

  bandpass() {
    const n = this.next();
    this.lp += 0.3 * (n - this.lp);
    this.hp += 0.05 * (this.lp - this.hp);
    return (this.lp - this.hp) * 2;
  }
}

/**
 * Operator waveforms, indexed by the M8 SHAPE value. `p` is a phase in cycles.
 * SW2..SW6 are the M8's sine variants, approximated as a progressive blend from
 * sine towards saw; the NLP/NHP/NBP shapes as filtered noise.
 */
function oscillator(shape, p, noiseState) {
  const x = wrap(p);
  switch (shape) {
    case 0: // SIN
      return Math.sin(TWO_PI * x);
    case 1: // SW2
    case 2: // SW3
    case 3: // SW4
    case 4: // SW5
    case 5: { // SW6
      const blend = shape / 6;
      return (1 - blend) * Math.sin(TWO_PI * x) + blend * (2 * x - 1);
    }
    case 6: // TRI
      return 4 * Math.abs(x - 0.5) - 1;
    case 7: // SAW
      return 2 * x - 1;
    case 8: // SQR
      return x < 0.5 ? 1 : -1;
    case 9: // PUL
      return x < 0.25 ? 1 : -1;
    case 10: // IMP
      return x < 0.05 ? 1 : 0;
    case 11: // NOI
      return noiseState.next();
    case 12: // NLP
      return noiseState.lowpass();
    case 13: // NHP
      return noiseState.highpass();
    case 14: // NBP
      return noiseState.bandpass();
    case 15: // CLK
      return x < 0.01 ? 1 : 0;
    default:
      return Math.sin(TWO_PI * x);
  }
}

/** AHD envelope. Attacks to 1, holds, then decays back to 0 and stays there. */
function ahdValue(t, attack, hold, decay) {
  if (t <= 0) return 0;
  if (t < attack) return t / attack;
  const afterAttack = t - attack;
  if (afterAttack < hold) return 1;
  const afterHold = afterAttack - hold;
  if (decay <= 0) return 0;
  if (afterHold >= decay) return 0;
  const x = 1 - afterHold / decay;
  return x * x;
}

/** Total time an AHD envelope takes to return to zero. */
function ahdDuration(env) {
  return env.attack + env.hold + env.decay;
}

/** LFO shapes, indexed by the M8 LFO SHAPE value. Returns a bipolar value. */
function lfoValue(shape, p, randState) {
  const x = wrap(p);
  switch (shape % 10) {
    case 0: // TRI
      return 4 * Math.abs(x - 0.5) - 1;
    case 1: // SIN
      return Math.sin(TWO_PI * x);
    case 2: // RAMP DN
      return 1 - 2 * x;
    case 3: // RAMP UP
      return 2 * x - 1;
    case 4: // EXP DN
      return 2 * Math.pow(1 - x, 3) - 1;
    case 5: // EXP UP
      return 2 * Math.pow(x, 3) - 1;
    case 6: // SQU DN
      return x < 0.5 ? 1 : -1;
    case 7: // SQU UP
      return x < 0.5 ? -1 : 1;
    case 8: // RANDOM
    case 9: // DRUNK
      return randState.value;
    default:
      return 0;
  }
}

/** Topology-preserving-transform state variable filter, one per voice. */
class SvFilter {
  constructor() {
    this.ic1 = 0;
    this.ic2 = 0;
  }

  reset() {
    this.ic1 = 0;
    this.ic2 = 0;
  }

  process(input, cutoffHz, res, type, sampleRate) {
    if (type === 0) return input;
    const g = Math.tan((Math.PI * clamp(cutoffHz, 20, sampleRate * 0.45)) / sampleRate);
    const k = 2 - 1.94 * clamp(res, 0, 1);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;

    const v3 = input - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;

    switch (type) {
      case 1: return v2;                   // LOWPASS
      case 2: return input - k * v1 - v2;  // HIGHPASS
      case 3: return v1;                   // BANDPASS
      case 4: return input - k * v1;       // BANDSTOP
      case 5: return v2;                   // LP>HP, rendered as lowpass
      default: return input;
    }
  }
}

class Voice {
  constructor() {
    this.active = false;
    this.gate = false;
    this.noteId = -1;
    this.baseFreq = 440;
    this.velocity = 1;
    this.time = 0;
    this.releaseGain = 1;
    this.silentSamples = 0;
    this.phases = new Float64Array(4);
    this.feedback = new Float64Array(4);
    this.opOut = new Float64Array(4);
    this.noise = [new NoiseState(), new NoiseState(), new NoiseState(), new NoiseState()];
    this.filter = new SvFilter();
    this.lfoPhases = new Float64Array(2);
    this.randState = [{ value: 0, lastStep: -1 }, { value: 0, lastStep: -1 }];
  }

  noteOn(noteId, freq, velocity) {
    this.active = true;
    this.gate = true;
    this.noteId = noteId;
    this.baseFreq = freq;
    this.velocity = velocity;
    this.time = 0;
    this.releaseGain = 1;
    this.silentSamples = 0;
    this.phases.fill(0);
    this.feedback.fill(0);
    this.opOut.fill(0);
    this.lfoPhases.fill(0);
    this.filter.reset();
  }

  noteOff() {
    this.gate = false;
  }

  kill() {
    this.active = false;
    this.gate = false;
    this.noteId = -1;
  }
}

class M8FmRenderer {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.spec = null;
    this.voices = Array.from({ length: MAX_VOICES }, () => new Voice());
    this.freeLfoPhases = new Float64Array(2);
    this.freeRandState = [{ value: 0, lastStep: -1 }, { value: 0, lastStep: -1 }];
    this.masterGain = 0.5;
    this.buses = new Float64Array(4);

    this.chorusSize = Math.ceil(0.05 * sampleRate);
    this.chorusL = new Float32Array(this.chorusSize);
    this.chorusR = new Float32Array(this.chorusSize);
    this.chorusWrite = 0;
    this.chorusPhase = 0;
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'spec':
        this.spec = msg.spec;
        break;
      case 'noteOn':
        this.noteOn(msg.noteId, msg.frequency, msg.velocity);
        break;
      case 'noteOff':
        this.noteOff(msg.noteId);
        break;
      case 'allNotesOff':
        for (const voice of this.voices) {
          if (voice.active) voice.noteOff();
        }
        break;
      case 'volume':
        this.masterGain = clamp(msg.value, 0, 1);
        break;
      default:
        break;
    }
  }

  noteOn(noteId, frequency, velocity) {
    // Re-use the voice already playing this note, then any idle voice, then the
    // oldest one. The pool is fixed, so voices cannot leak.
    let target = this.voices.find((v) => v.active && v.noteId === noteId);
    if (!target) target = this.voices.find((v) => !v.active);
    if (!target) {
      target = this.voices.reduce((oldest, v) => (v.time > oldest.time ? v : oldest), this.voices[0]);
    }
    target.noteOn(noteId, frequency, velocity);
  }

  noteOff(noteId) {
    for (const voice of this.voices) {
      if (voice.active && voice.noteId === noteId) voice.noteOff();
    }
  }

  get activeVoiceCount() {
    return this.voices.reduce((n, v) => n + (v.active ? 1 : 0), 0);
  }

  /**
   * Evaluates the four MOD buses for a voice at its current time. `mods[n]` is
   * the base amount; envelopes and LFOs whose destination is MOD n add their
   * scaled output on top, which is the M8's two-level modulation matrix:
   * modulator -> MOD bus -> operator MOD slot.
   */
  computeBuses(spec, voice, out) {
    out[0] = spec.mods[0];
    out[1] = spec.mods[1];
    out[2] = spec.mods[2];
    out[3] = spec.mods[3];

    for (let i = 0; i < spec.envs.length; i++) {
      const env = spec.envs[i];
      const bus = env.dest - DEST_MOD1;
      if (bus < 0 || bus > 3 || env.amount === 0) continue;
      out[bus] += env.amount * ahdValue(voice.time, env.attack, env.hold, env.decay);
    }

    for (let i = 0; i < spec.lfos.length; i++) {
      const lfo = spec.lfos[i];
      const bus = lfo.dest - DEST_MOD1;
      if (bus < 0 || bus > 3 || lfo.amount === 0) continue;
      out[bus] += lfo.amount * this.lfoOutput(spec, voice, i);
    }
  }

  /** Reads LFO `i` for a voice, honouring its trigger mode. */
  lfoOutput(spec, voice, i) {
    const lfo = spec.lfos[i];
    const free = lfo.trigger === 0;
    const phase = free ? this.freeLfoPhases[i] : voice.lfoPhases[i];
    const rand = free ? this.freeRandState[i] : voice.randState[i];
    if (lfo.shape >= 8) {
      const step = Math.floor(phase);
      if (step !== rand.lastStep) {
        rand.lastStep = step;
        rand.value = lfo.shape % 10 === 9
          ? clamp(rand.value + (Math.random() * 2 - 1) * 0.4, -1, 1) // DRUNK
          : Math.random() * 2 - 1;                                   // RANDOM
      }
    }
    return lfoValue(lfo.shape, phase, rand);
  }

  /** Sums the envelope and LFO contributions aimed at a non-MOD destination. */
  destAmount(spec, voice, dest) {
    let total = 0;
    for (let i = 0; i < spec.envs.length; i++) {
      const env = spec.envs[i];
      if (env.dest !== dest || env.amount === 0) continue;
      total += env.amount * ahdValue(voice.time, env.attack, env.hold, env.decay);
    }
    for (let i = 0; i < spec.lfos.length; i++) {
      const lfo = spec.lfos[i];
      if (lfo.dest !== dest || lfo.amount === 0) continue;
      total += lfo.amount * this.lfoOutput(spec, voice, i);
    }
    return total;
  }

  /** True once every envelope aimed at VOLUME has run to completion. */
  volumeEnvelopeFinished(spec, voice) {
    let sawVolumeEnv = false;
    for (let i = 0; i < spec.envs.length; i++) {
      const env = spec.envs[i];
      if (env.dest !== DEST_VOLUME || env.amount === 0) continue;
      sawVolumeEnv = true;
      if (voice.time < ahdDuration(env)) return false;
    }
    return sawVolumeEnv;
  }

  renderVoice(spec, voice) {
    const sampleRate = this.sampleRate;
    const dt = 1 / sampleRate;
    const buses = this.buses;

    this.computeBuses(spec, voice, buses);

    // Instrument-wide pitch modulation, in semitones.
    const pitchSemis = this.destAmount(spec, voice, DEST_PITCH) * 24;
    const pitchScale = pitchSemis === 0 ? 1 : Math.pow(2, pitchSemis / 12);

    // Operators are evaluated A..D. Every M8 algorithm routes from lower to
    // higher letters, so by the time an operator runs its modulators already
    // hold this sample's value -- no one-sample lag anywhere in the chain.
    for (let k = 0; k < 4; k++) {
      const op = spec.ops[k];

      let levelAdd = 0;
      let ratioMod = 0;
      let pitchMod = 0;
      let feedbackAdd = 0;
      for (let s = 0; s < op.slots.length; s++) {
        const slot = op.slots[s];
        const busValue = buses[slot.bus - 1];
        switch (slot.target) {
          case MOD_TARGET_LEV: levelAdd += busValue; break;
          case MOD_TARGET_RAT: ratioMod += busValue; break;
          case MOD_TARGET_PIT: pitchMod += busValue; break;
          case MOD_TARGET_FBK: feedbackAdd += busValue; break;
          default: break;
        }
      }

      const level = clamp(op.level + levelAdd, 0, 1);
      const ratio = Math.max(0, op.ratio * (1 + ratioMod * 4));
      const semis = pitchMod * 24;
      const freq = voice.baseFreq * pitchScale * ratio * (semis === 0 ? 1 : Math.pow(2, semis / 12));

      voice.phases[k] = wrap(voice.phases[k] + freq * dt);

      let phase = voice.phases[k];
      const sources = spec.sources[k];
      for (let s = 0; s < sources.length; s++) {
        phase += voice.opOut[sources[s]];
      }

      const fb = clamp(op.feedback + feedbackAdd, 0, 1);
      if (fb > 0) {
        phase += fb * spec.maxFeedbackCycles * voice.feedback[k];
      }

      const raw = oscillator(op.shape, phase, voice.noise[k]);
      // Averaging the last two outputs is the standard way to keep an FM
      // operator's self-feedback from oscillating at Nyquist.
      voice.feedback[k] = (voice.feedback[k] + raw) * 0.5;

      // A modulator's output is a phase deviation in cycles; a carrier's is an
      // amplitude. That is the only place LEVEL means two different things.
      voice.opOut[k] = op.isCarrier
        ? raw * level
        : raw * level * level * spec.maxPmCycles;
    }

    let sample = 0;
    for (let c = 0; c < spec.carriers.length; c++) {
      sample += voice.opOut[spec.carriers[c]];
    }
    if (spec.carriers.length > 1) sample /= Math.sqrt(spec.carriers.length);

    if (spec.filter.type !== 0) {
      const cutoffNorm = clamp(spec.filter.cutoff + this.destAmount(spec, voice, DEST_CUTOFF), 0, 1);
      const cutoff = spec.cutoffMinHz * Math.pow(spec.cutoffMaxHz / spec.cutoffMinHz, cutoffNorm);
      const res = clamp(spec.filter.res + this.destAmount(spec, voice, DEST_RES), 0, 1);
      sample = voice.filter.process(sample, cutoff, res, spec.filter.type, sampleRate);
    }

    // VOLUME: envelopes add (the M8 default patch has VOLUME 00 with ENV1 at FF
    // driving it, so notes start from silence), LFOs multiply so an LFO aimed at
    // VOLUME reads as tremolo instead of a DC offset.
    let volume = spec.volume;
    for (let i = 0; i < spec.envs.length; i++) {
      const env = spec.envs[i];
      if (env.dest !== DEST_VOLUME || env.amount === 0) continue;
      volume += env.amount * ahdValue(voice.time, env.attack, env.hold, env.decay);
    }
    volume = clamp(volume, 0, 1);
    for (let i = 0; i < spec.lfos.length; i++) {
      const lfo = spec.lfos[i];
      if (lfo.dest !== DEST_VOLUME || lfo.amount === 0) continue;
      volume *= clamp(1 + lfo.amount * this.lfoOutput(spec, voice, i), 0, 2);
    }

    const amp = clamp(spec.amp + this.destAmount(spec, voice, DEST_AMP), 0, 1);
    sample *= volume * voice.velocity * (1 + amp * 3);

    if (!voice.gate) {
      voice.releaseGain -= dt / RELEASE_SECONDS;
      if (voice.releaseGain <= 0) {
        voice.kill();
        return 0;
      }
      sample *= voice.releaseGain;
    }

    voice.time += dt;
    return sample;
  }

  /** Renders `frames` samples into the two output channels. */
  render(left, right, frames) {
    left.fill(0);
    if (right !== left) right.fill(0);

    const spec = this.spec;
    if (!spec) return;

    const sampleRate = this.sampleRate;
    const dt = 1 / sampleRate;
    const silenceLimit = sampleRate * SILENCE_SECONDS;

    for (let i = 0; i < frames; i++) {
      let dry = 0;
      let panAccum = 0;
      let voiceCount = 0;

      for (let v = 0; v < this.voices.length; v++) {
        const voice = this.voices[v];
        if (!voice.active) continue;

        const sample = this.renderVoice(spec, voice);
        dry += sample;
        panAccum += spec.pan + this.destAmount(spec, voice, DEST_PAN);
        voiceCount += 1;

        if (Math.abs(sample) < SILENCE_THRESHOLD) {
          voice.silentSamples += 1;
        } else {
          voice.silentSamples = 0;
        }

        // Reclaim the voice as soon as it can no longer make sound. Without
        // this, a patch whose volume envelope has run out would keep rendering
        // forever -- the "one preview and it never stops" bug.
        if (voice.silentSamples > silenceLimit && (!voice.gate || this.volumeEnvelopeFinished(spec, voice))) {
          voice.kill();
        }

        for (let l = 0; l < spec.lfos.length; l++) {
          if (spec.lfos[l].trigger !== 0) {
            voice.lfoPhases[l] = wrap(voice.lfoPhases[l] + spec.lfos[l].freq * dt);
          }
        }
      }

      for (let l = 0; l < spec.lfos.length; l++) {
        if (spec.lfos[l].trigger === 0) {
          this.freeLfoPhases[l] = wrap(this.freeLfoPhases[l] + spec.lfos[l].freq * dt);
        }
      }

      const pan = voiceCount > 0 ? clamp(panAccum / voiceCount, -1, 1) : 0;
      const panL = Math.cos(((pan + 1) * Math.PI) / 4);
      const panR = Math.sin(((pan + 1) * Math.PI) / 4);

      let outL = dry * panL;
      let outR = dry * panR;

      if (spec.chorus > 0) {
        this.chorusPhase = wrap(this.chorusPhase + 0.6 * dt);
        const depthSamples = (0.002 + 0.004 * spec.chorus) * sampleRate;
        const baseSamples = 0.008 * sampleRate;
        const modL = baseSamples + depthSamples * Math.sin(TWO_PI * this.chorusPhase);
        const modR = baseSamples + depthSamples * Math.sin(TWO_PI * this.chorusPhase + Math.PI / 2);
        outL += spec.chorus * 0.6 * this.readChorus(this.chorusL, modL);
        outR += spec.chorus * 0.6 * this.readChorus(this.chorusR, modR);
        this.chorusL[this.chorusWrite] = dry * panL;
        this.chorusR[this.chorusWrite] = dry * panR;
        this.chorusWrite = (this.chorusWrite + 1) % this.chorusSize;
      }

      const gain = this.masterGain * spec.dry;
      // Soft clip, so an aggressive patch saturates instead of tearing.
      left[i] = Math.tanh(outL * gain);
      right[i] = Math.tanh(outR * gain);
    }
  }

  readChorus(buffer, delaySamples) {
    const read = this.chorusWrite - delaySamples + this.chorusSize;
    const i0 = Math.floor(read) % this.chorusSize;
    const i1 = (i0 + 1) % this.chorusSize;
    const frac = read - Math.floor(read);
    return buffer[i0] * (1 - frac) + buffer[i1] * frac;
  }
}

// Defined conditionally so this module can also be imported on the main thread
// (and by the test suite), where the worklet globals do not exist.
const ProcessorBase = typeof AudioWorkletProcessor === 'undefined'
  ? class {}
  : AudioWorkletProcessor;

class M8FmProcessor extends ProcessorBase {
  constructor() {
    super();
    this.renderer = new M8FmRenderer(sampleRate);
    this.port.onmessage = (event) => this.renderer.handleMessage(event.data);
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output.length > 1 ? output[1] : output[0];
    this.renderer.render(left, right, left.length);
    return true;
  }
}

if (typeof registerProcessor === 'function') {
  registerProcessor('m8-fm-voice', M8FmProcessor);
}

export { M8FmRenderer, M8FmProcessor, Voice, SvFilter, ahdValue, ahdDuration, oscillator, lfoValue, MAX_VOICES };
