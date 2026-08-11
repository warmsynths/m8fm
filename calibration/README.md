# Calibration instruments

These exist to measure a real M8 against this app. Everything in
`src/audio/M8Patch.ts` that turns a raw `00`-`FF` parameter into seconds,
hertz or modulation depth is currently a guess, because Dirtywave does not
publish those curves. Each instrument here isolates exactly one of them.

## Why not just record the piano?

A musical patch is affected by every one of those curves at once, so a
recording of it cannot settle any of them: a wrong level curve and a wrong
filter curve can cancel out and still look right. These patches are
deliberately dumb -- mostly a single sine operator -- so that one recording
determines one curve, exactly.

## How to record

1. Copy the `.m8i` files to `/Instruments` on the M8 SD card.
2. Load one, and record the line/headphone out into your DAW.
   **Not** a microphone -- room tone and speaker response would swamp the
   measurements.
3. Play **the same note every time** (C-3 is ideal) and hold it for about
   two seconds, unless the sweep says otherwise.
4. Step the one parameter named below through its listed values, playing a
   note after each. Leave roughly a second of silence between notes -- the
   analysis splits the file on the gaps.
5. One WAV per instrument, named after it (e.g. `CAL1-ENV.wav`). 44.1 or
   48 kHz, 24-bit, mono is fine.

Turn the M8 mixer's CHO/DEL/REV sends off and keep the level clear of
clipping. The patches already have their instrument-level sends at `00`.

Then run:

```
node tools/analyze-recording.mjs calibration/CAL1-ENV.wav
```

## If you only do a few

CAL1, CAL2 and CAL3 in that order get most of the way. CAL1 fixes how long
notes take to die and the shape of the decay, CAL2 fixes brightness, CAL3
fixes the filter. The rest are refinements.

## The instruments

### CAL1-ENV

**Measures:** ENV DECAY value -> seconds, and the shape of the decay

**Sweep:** `ENV1 DEC` through 10, 20, 40, 60, 80, A0, C0, E0, FF

envDecaySeconds() and the AHD curve in fm-processor.js. A pure sine carrier means the recorded waveform IS the envelope, so both the timing and the curve fall straight out of it.
### CAL2-INDEX

**Measures:** operator LEVEL -> modulation depth, and LEVEL -> output gain

**Sweep:** `OP A LEV (then a second pass on OP B LEV with OP A back at 00)` through 00, 20, 40, 60, 80, A0, C0, E0, FF

MAX_PM_CYCLES and levelToPmCycles(). A 1:1 operator pair has a spectrum whose harmonic amplitudes are Bessel functions of the modulation index, so the index can be solved exactly from the recording. The second pass gives levelToAmplitude(). This is the biggest single influence on FM timbre.
### CAL3-FILT

**Measures:** CUTOFF value -> hertz, the filter slope, and what RES does

**Sweep:** `FILTER CUT (then a second pass on RES with CUT at 80)` through 00, 20, 40, 60, 80, A0, C0, E0, FF

cutoffHz() and the SvFilter in fm-processor.js. A saw has a known harmonic series, so the corner frequency and the roll-off slope read straight off the spectrum.
### CAL4-MOD

**Measures:** whether a MOD bus adds to an operator parameter or scales it

**Sweep:** `MOD1` through 00, 40, 80, C0, FF

the bus model in fm-processor.js. OP A sits at LEV 40 with MOD A set to 1>LEV. If the output tracks LEV 40/80/C0/FF/FF it is additive, which is what this app assumes; anything else means the two-level modulation matrix is modelled wrongly, which would affect every patch that uses a MOD slot.
### CAL5-FBK

**Measures:** FBK value -> feedback depth, and where the sine becomes saw then noise

**Sweep:** `OP A FB` through 00, 20, 40, 60, 80, A0, C0, E0, FF

MAX_FEEDBACK_CYCLES. The harmonic series of a self-fed sine gives the feedback depth directly, and the point where it breaks up locates the top of the range.
### CAL6-SHAPE

**Measures:** the actual waveform behind each SHAPE name

**Sweep:** `OP A shape (SIN, SW2..SW6, TRI, SAW, SQR, PUL, IMP, NOI, ...)` through 00, 01, 02, 03, 04, 05, 06, 07, 08, 09, 0A, 0B, 0C, 0D, 0E, 0F

oscillator() in fm-processor.js. SW2..SW6 are currently invented -- sine-to-saw blends -- because there is no published description of them. One steady note per shape gives the harmonic series of each, which is enough to reproduce them properly.
### CAL7-LFO

**Measures:** LFO FREQ value -> hertz

**Sweep:** `LFO1 FRQ` through 00, 20, 40, 60, 80, A0, C0, E0, FF

lfoFreqHz(). The tremolo rate is directly countable from the recorded amplitude envelope.
