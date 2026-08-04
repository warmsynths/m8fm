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

### A. Pure 2-Op Silky Electric Piano (Rhodes / Wurli):
- **Algorithm**: `07 [A>B] + [C>D]`
- **Op A (Modulator)**: `SIN`, `RATIO 01.00`, `LEV 0C`–`14`, `FB 00`, `MOD -----`
- **Op B (Carrier 1)**: `SIN`, `RATIO 01.00`, `LEV FF`, `FB 00`, `MOD 1▸LEV` (Volume Envelope)
- **Op C (Modulator 2)**: `SIN`, `RATIO 01.00`, `LEV 00`, `FB 00`, `MOD -----` *(Silenced)*
- **Op D (Carrier 2)**: `SIN`, `RATIO 01.00`, `LEV 00`, `FB 00`, `MOD -----` *(Silenced)*
- **Env 1**: `DEST: MOD 1`, `ATTACK: 00`, `HOLD: 00`, `DECAY: 60`
- **LFO 1**: `DEST: VOLUME`, `TYPE: TRI`, `FREQ: 35`, `AMT: 40` (Master Tremolo)

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

## 6. Web Audio vs Hardware Implementation Gotchas

1. **Linear FM vs Phase Modulation**: Standard Web Audio `Oscillator.frequency` modulation is linear Hz Frequency Modulation. Phase Modulation ($\Delta \phi$) requires scaling frequency deviation as $\Delta f = (\text{Index}_{\text{rad}}) \cdot f_{\text{modulator}}$.
2. **Op C & Op D Silencing**: In Algorithm 07 (`[A>B] + [C>D]`), if `LEV C` or `LEV D` are left at `80` (50%), Op C modulates Op D into a loud buzzy synth tone. Setting `LEV C = 00` and `LEV D = 00` isolates the pure 2-op sine piano pair.
