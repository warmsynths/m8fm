# M8 Tracker FM Synthesis Reference Guide

Comprehensive technical reference on the Dirtywave M8 Tracker 4-Operator FM Synth engine, architecture, modulation matrix, and patch design based on user guide findings.

---

## 1. Core Architecture: Phase Modulation (PM)

- **Phase Modulation vs. Frequency Modulation**:
  Although named `FMSYNTH`, the Dirtywave M8 engine implements **Phase Modulation (PM)** ($\Delta \phi$), identical to classic digital FM synths (Yamaha DX7, DX11, Reface DX, Elektron Digitone).
- **Why PM matters**:
  - In linear Frequency Modulation ($\Delta f$), higher pitch octaves over-deviate carrier frequency, causing harsh sideband distortion.
  - In Phase Modulation ($\Delta \phi$), phase deviation stays constant across the keyboard, preserving consistent harmonic timbre across all pitch octaves.

---

## 2. 4-Operator System & 12 Algorithms

The engine features 4 Operators (`A`, `B`, `C`, `D`), each functioning as either a **Carrier** (audio output) or **Modulator** (phase modulator).

### Key Algorithms:
- **Algorithm 00 (`A > B > C > D`)**: 4-Op cascade stack. D is carrier out; C, B, A are nested modulators.
- **Algorithm 01 (`A > B > C + D`)**: Dual carrier output (C and D out); B modulates C and D; A modulates B.
- **Algorithm 02 / Algo 07 (`[A > B] + [C > D]`)**: Dual 2-operator pairs. B and D are output carriers; A modulates B, C modulates D.
- **Algorithm 03 (`[A + B + C] > D`)**: 3 parallel modulators (A, B, C) modulating single carrier D.
- **Algorithm 06 (`A + B + C + D`)**: 4 parallel carriers (Additive mode).
- **Algorithm 11 (`A + B + C + D` Wavetables)**: Additive/subtractive polyphonic mode using built-in waveforms/wavetables.

---

## 3. Waveforms, Ratios & Feedback (`FB`)

### Waveforms & Ratios:
- Each operator supports 12 waveforms (`SIN`, `TRI`, `SQR`, `SAW`, `IMP`, `RAMP`, etc.).
- **Ratio**: Pitch multiplier expressed in decimal (`00.01` to `99.99`).
  - Integer ratios (`1.00`, `2.00`, `3.00`) create harmonic sine overtones (musical, consonant).
  - Fractional/Inharmonic ratios (`3.50`, `9.20`, `7.13`) create metallic, bell, or wooden timbres.

### Feedback (`FB`) Waveform Morphing:
- **`FB = 00`**: Pure fundamental sine wave.
- **`FB = 10` to `40`**: Self-feedback morphs the sine wave into a rich **sawtooth wave**.
- **`FB = 80` to `FF`**: High self-feedback introduces signal instability and transforms the operator into a **noise generator**.

---

## 4. Modulation Architecture: 2-Level Indirection

The M8 uses a 2-level modulation matrix:

```
[Instrument Modulators] (Env 1, Env 2, LFO 1, LFO 2)
       │
       ▼
[Op-Mods Base Amounts] (MOD 1, MOD 2, MOD 3, MOD 4)
       │
       ▼
[Operator MOD Slots] (1▸LEV, 2▸LEV, 3▸LEV, 4▸LEV, 1▸FB, 1▸RAT, 1▸PIT, or -----)
```

### Operator MOD Slots:
- Each of the 4 operators has **2 MOD slots** (`MOD 1` and `MOD 2` rows).
- Available destinations: `LEV` (Level), `FB` (Feedback), `RAT` (Ratio), `PIT` (Pitch in semitones).
- **Unassigned (`-----`)**: If an operator MOD slot is set to `-----`, no modulator touches that operator.

---

## 5. Sound Design Recipes

### A. Electric Piano (Rhodes / Wurli):

Two independent 2-op pairs: one makes the struck tine, the other the sustained
body, and `07` mixes them. Keeping them separate is what makes this sound like a
piano — stacking extra carriers on one modulator gives an organ instead (see the
warning below).

- **Algorithm**: `07 [A>B] + [C>D]`
- **Op A (Tine Modulator)**: `SIN`, `RATIO 07.00`–`14.00`, `LEV 18`, `FB 00`, `MOD 2▸LEV`
- **Op B (Tine Carrier)**: `SIN`, `RATIO 01.00`, `LEV 20`, `FB 00`, `MOD 2▸LEV`
- **Op C (Body Modulator)**: `SIN`, `RATIO 01.00`, `LEV 40`, `FB 00`, `MOD -----`
- **Op D (Body Carrier)**: `SIN`, `RATIO 01.00`, `LEV C0`, `FB 00`, `MOD -----`
- **MOD 2**: `00` (the strike envelope supplies the whole bus)
- **Env 1**: `DEST: VOLUME`, `AMT: FF`, `ATTACK: 00`, `HOLD: 00`, `DECAY: 9A` (note decay)
- **Env 2**: `DEST: MOD 2`, `AMT: 70`, `ATTACK: 00`, `HOLD: 00`, `DECAY: 48` (the strike)
- **LFO 1**: `DEST: VOLUME`, `TYPE: TRI`, `FREQ: C8`, `AMT: 30` (Master Tremolo)
- **Filter**: `LOWPASS`, `CUT D4`, `RES 10`. **Mixer**: `CHO A0`

Both tine operators sit on `MOD 2`, so the strike loses brightness *and* level
together and settles into a thin sine that reinforces the fundamental. Put only
the modulator on the bus and the tine carrier rings on at fixed volume forever.

**Tuning notes**:
- Raising `RATIO A` moves the strike up the harmonic series: `07.00` is woody,
  `14.00` is glassy. Keep it a whole number — a fractional tine ratio beats
  against the body pair, which is the difference between a bell and a clang.
- `LEV C` is the body's modulation index, and it is the Rhodes "bark" when you
  dig in. Push it for a Wurli, back it off for a silky MK1.
- Reach for `LEV C`, not `LEV A`, when the patch needs more character. More tine
  just makes it brighter.

> **Carrier ratios are pitches, not overtones.** Carriers at `00.50`, `01.00` and
> `01.50` are not a piano with overtones — relative to the sub-octave they are a
> 1:2:3 series, i.e. the 16′ + 8′ + 5⅓′ registration of a Hammond organ, and they
> will sound like one. Give carriers whole-number ratios unless you specifically
> want a stacked interval.

### B. FM Punch Kick Drum:
- **Algorithm**: `07 [A>B] + [C>D]`
- **Op B (Carrier)**: `SIN`, `RATIO 01.00`, `LEV FF`, `MOD 1▸RAT` (Pitch envelope)
- **Env 1**: `DEST: MOD 1`, `ATTACK: 00`, `DECAY: 08` (Fast pitch drop transient)
- **Env 2**: `DEST: VOLUME`, `ATTACK: 00`, `DECAY: 30` (Short thumpy volume decay)

### C. FM Snare Drum (Feedback Noise):
- **Algorithm**: `07 [A>B] + [C>D]`
- **Op A (Modulator)**: `SIN`, `RATIO 01.00`, `LEV FF`, `FB FF` (Max feedback noise generator)
- **Op B (Carrier)**: `SIN`, `RATIO 01.00`, `LEV FF`, `MOD 2▸LEV`

---

## 6. The FMSYNTH Has No Implicit Amplitude Envelope

This is the single most common reason a patch that looks correct on paper comes
out as a continuous harsh buzz on the device.

Unlike a subtractive synth, an M8 `FMSYNTH` instrument has **no built-in amp
envelope**. Nothing shapes the note's loudness unless you explicitly point a
modulator at it. With every `ENV`/`LFO` aimed at `MOD 1`-`MOD 4` and none at
`VOLUME`, the operators run flat out for as long as the note is held: no attack,
no decay, no tail. A perfectly reasonable set of ratios and levels then reads as
a static, buzzing drone, and no amount of tweaking `RATIO`, `LEVEL` or `FB` will
fix it, because the problem is not the timbre.

There are two valid ways to give a patch an amplitude envelope:

1. **`ENV 1` → `DEST: VOLUME`** (`AMOUNT FF`). This is the M8's own default for a
   new instrument, which ships with `VOLUME 00` so the envelope sweeps the note
   up from silence. Unambiguous, and the right default.
2. **`ENV 1` → `DEST: MOD 1`**, with each carrier's `MOD` slot set to `1▸LEV`.
   The envelope drives the MOD 1 bus, which in turn opens the carriers' levels.
   More flexible (it can shape individual carriers), but every carrier that
   should be enveloped has to subscribe to the bus — a carrier left on `-----`
   keeps sounding at its fixed `LEVEL` forever.

Recipe 5A above uses the second form. If you copy it, do not skip the `1▸LEV` on
the carriers.

---

## 7. Web Audio vs Hardware Implementation Gotchas

1. **Linear FM vs Phase Modulation**: Standard Web Audio `Oscillator.frequency`
   modulation is linear Hz Frequency Modulation, and it is not a workable
   substitute. For a single sine modulator the two coincide when the deviation
   is set to $\Delta f = \text{Index}_{\text{cycles}} \cdot f_{\text{modulator}}$,
   but the equivalence breaks down as soon as operators are cascaded, and the
   deviation has to be clamped to keep the instantaneous frequency positive —
   which changes the timbre as you play up the keyboard. Real phase modulation
   needs a per-sample renderer (an `AudioWorklet`), which is what this app uses.
2. **Feedback needs a one-sample loop**: a `DelayNode` cannot do it. Web Audio
   enforces a minimum delay of one render quantum (128 samples) in any cycle, so
   a feedback loop built from nodes is roughly 3 ms late and turns into noise at
   any setting. Operator self-feedback has to live inside the worklet.
3. **Op C & Op D Silencing**: In Algorithm 07 (`[A>B] + [C>D]`), if `LEV C` or
   `LEV D` are left at `80` (50%), Op C modulates Op D into a loud buzzy synth
   tone. Setting `LEV C = 00` and `LEV D = 00` isolates the pure 2-op sine piano
   pair.
4. **Parameter units are not linear**: the M8's `00`-`FF` envelope times, LFO
   frequencies and filter cutoffs are all curves, and Dirtywave does not publish
   them. If an app both previews a patch and exports it, the preview must derive
   its audio values from the same raw parameters it displays, or the two will
   drift apart and the exported instrument will not sound like the preview.
