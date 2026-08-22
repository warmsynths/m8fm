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
- **Op A (Tine Modulator)**: `SIN`, `RATIO 07.00`–`14.00`, `LEV B8`, `FB 00`, `MOD 2▸LEV`
- **Op B (Tine Carrier)**: `SIN`, `RATIO 01.00`, `LEV 90`, `FB 00`, `MOD 2▸LEV`
- **Op C (Body Modulator)**: `SIN`, `RATIO 01.00`, `LEV 60`, `FB 00`, `MOD -----`
- **Op D (Body Carrier)**: `SIN`, `RATIO 01.00`, `LEV C0`, `FB 00`, `MOD -----`
- **MOD 1-4**: all `00` — the strike envelope supplies the whole of MOD 2
- **Env 1**: `DEST: VOLUME`, `AMT: FF`, `ATTACK: 00`, `HOLD: 00`, `DECAY: 90` (~3.0 s note)
- **Env 2**: `DEST: MOD 2`, `AMT: FF`, `ATTACK: 00`, `HOLD: 00`, `DECAY: 22` (~0.7 s strike)
- **LFO 1**: `DEST: VOLUME`, `TYPE: TRI`, `FREQ: C3`, `AMT: 22` (Master Tremolo)
- **Filter**: `LOWPASS`, `CUT D8`, `RES 10`. **Mixer**: `CHO A0`

Both tine operators sit on `MOD 2`, and that bus rests at `00`. Because a MOD bus
*scales* what it is wired to (section 7), the whole tine pair is silent between
notes and swells in with the strike — the `LEV` values above are its brightness
and level at the peak of the strike, not standing amounts. `ENV 2`'s `AMT` is
`FF` so the bus sweeps its whole range.

Put only the modulator on the bus and the tine carrier rings on at fixed volume
forever; leave the bus resting above zero and the tine never goes away.

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

Recipe 5A uses the first form for the note itself, and a second envelope on a
MOD bus for the strike on top of it.

---

## 7. Measured Hardware Behaviour

These were measured off a real M8 playing `calibration/M8FM-CALIBRATION.m8s`.
`tools/fit-hardware-curves.mjs` reproduces the fits from a recording.

### Envelope decay is exponential, and linear in the parameter

The AHD decay is a pure exponential whose rate is inversely proportional to the
`DEC` value:

    rate = 2888 / DEC   decibels per second

That product held constant to 0.1% from `DEC 10` to `DEC FF`. Rearranged, the
time to fall 60 dB is simply proportional:

    T60 = DEC x 20.8 ms

So `DEC 30` is about a second, `DEC 60` about two, and `DEC FF` about 5.3.
Doubling `DEC` doubles the time. No polynomial fits this -- trying to fit
`(1 - t/T)^p` just pushes `p` to whatever ceiling the search allows, which is the
signature of approximating an exponential with a power curve.

### A MOD bus SCALES its destination, it does not add to it

With operator A at `LEV 40` and `MOD A` set to `1▸LEV`, sweeping `MOD1` through
`00/40/80/C0/FF` produced 0, 1/4, 2/4, 3/4 and 4/4 of the level that `LEV 40`
gives on its own.

**An operator whose MOD bus rests at zero is silent, however high its own LEVEL
is set.** An operator's `LEVEL` is therefore its value *at full bus*, not a
standing amount the bus adds to.

This is the single most important thing to get right when a patch uses MOD
slots. Under the additive reading, a patch whose bus rests at zero sounds
perfectly normal; on the device it is silent. To use a bus as a swell, leave the
`MOD n` amount at `00` and let an envelope drive it; to use an LFO on a bus, park
the `MOD n` amount mid-range so the LFO has somewhere to swing in both
directions.

### Carrier level is linear

Peak output was proportional to `LEV` from `00` to `80`, with a crest factor of
1.414 throughout, confirming a clean sine. Above that the recording's own chain
limited, so the top of that range has not been measured cleanly.

### Operator output clips above about LEV C0

A plain sine holds a crest factor of 1.41 from `LEV 20` up to `C0`, then
flattens to 1.13 at `E0` and 1.06 at `FF`. The peak stops rising at that point
while the RMS keeps climbing, which is what a signal running into a ceiling looks
like.

This happens inside the instrument, ahead of the filter — a resonant filter peak
in the same recording reached more than twice that level cleanly — so turning the
recording level down does not avoid it. Keep operators that are not themselves
being measured at `LEV A0` or below.

### Still unmeasured

Modulation index, feedback depth, LFO rate and the `SW2`-`SW6` waveforms were all
measured from a recording whose operators sat at `LEV FF`, so their spectra were
taken from clipped waveforms and cannot be trusted. The calibration instruments
now sit at `LEV A0`, so re-recording the song will settle them.

---

## 8. Web Audio vs Hardware Implementation Gotchas

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
