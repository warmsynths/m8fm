# Calibration

These exist to measure a real M8 against this app. Everything in
`src/audio/M8Patch.ts` that turns a raw `00`-`FF` parameter into seconds,
hertz or modulation depth is currently a guess, because Dirtywave does not
publish those curves. Each test here isolates exactly one of them.

## Why not just record the piano?

A musical patch is affected by every one of those curves at once, so a
recording of it cannot settle any of them: a wrong level curve and a wrong
filter curve can cancel out and still look right. These patches are
deliberately dumb -- mostly a single sine operator -- so that one recording
determines one curve, exactly.

## Recording it

`M8FM-CALIBRATION.m8s` plays the entire sweep by itself. Every measurement point is
its own instrument, so nothing needs adjusting while it runs.

1. Copy the song to the M8 SD card and load it.
2. Record the line or headphone out into your DAW. **Not** a microphone --
   room tone and speaker response would swamp the measurements.
3. Press play, and let it run to the end.
   It takes about 8 minutes and plays 84 notes.
4. Export the take as a WAV. 44.1 or 48 kHz, mono is fine. Start the file
   anywhere -- the analysis finds the first note itself.

Keep the level clear of clipping, and leave the M8 mixer's CHO/DEL/REV
sends off. The instruments already have their own sends at `00`.

Then:

```
node tools/analyze-recording.mjs your-take.wav
```

It picks up `manifest.json` automatically and labels every note with the
parameter and value it belongs to.

## If the song will not load

`instruments/` holds one `.m8i` per test as a fallback. Load one, and step
the parameter named below yourself, playing a note after each. Leave a gap
between notes and pass `--expect=N` so a miscount is obvious.

## If you only do a few

CAL1, CAL2 and CAL4 in that order get most of the way: how long notes take
to die and the shape of the decay, then brightness, then the filter.

## The tests

### CAL1-ENV

**Measures:** ENV DECAY value -> seconds, and the shape of the decay

**Steps `ENV1 DEC` through:** 10, 20, 40, 60, 80, A0, C0, E0, FF

envDecaySeconds() and the AHD curve in fm-processor.js. A pure sine carrier means the recorded waveform IS the envelope, so the timing and the curve shape both fall straight out of it.
### CAL2-INDEX

**Measures:** operator LEVEL -> modulation depth

**Steps `OP A LEV` through:** 00, 20, 40, 60, 80, A0, C0, E0, FF

MAX_PM_CYCLES and levelToPmCycles(). A 1:1 operator pair has a spectrum whose harmonic amplitudes are Bessel functions of the modulation index, so the index is solvable exactly from the recording. This is the single biggest influence on FM timbre.
### CAL3-GAIN

**Measures:** carrier LEVEL -> output gain

**Steps `OP A LEV` through:** 00, 20, 40, 60, 80, A0, C0, E0, FF

levelToAmplitude(). Currently assumed linear. The same operator with nothing modulating it, so only its own level affects the result.
### CAL4-CUT

**Measures:** CUTOFF value -> hertz, and the filter slope

**Steps `FILTER CUT` through:** 00, 20, 40, 60, 80, A0, C0, E0, FF

cutoffHz() and the SvFilter in fm-processor.js. A saw has a known harmonic series, so the corner frequency and the roll-off read straight off the spectrum.
### CAL5-RES

**Measures:** what RES does, and whether it is self-oscillating at the top

**Steps `FILTER RES` through:** 00, 20, 40, 60, 80, A0, C0, E0, FF

the resonance term in SvFilter. Cutoff is parked at 80 so only RES changes.
### CAL6-MOD

**Measures:** whether a MOD bus adds to an operator parameter or scales it

**Steps `MOD1` through:** 00, 40, 80, C0, FF

the bus model in fm-processor.js. OP A sits at LEV 40 with MOD A set to 1>LEV. If the output tracks LEV 40/80/C0/FF/FF it is additive, which is what this app assumes; anything else means the two-level modulation matrix is modelled wrongly, which affects every patch using a MOD slot.
### CAL7-FBK

**Measures:** FBK value -> feedback depth, and where sine becomes saw then noise

**Steps `OP A FB` through:** 00, 20, 40, 60, 80, A0, C0, E0, FF

MAX_FEEDBACK_CYCLES. The harmonic series of a self-fed sine gives the feedback depth, and the point where it breaks up locates the top of the range.
### CAL8-SHAPE

**Measures:** the actual waveform behind each SHAPE name

**Steps `OP A shape` through:** 00, 01, 02, 03, 04, 05, 06, 07, 08, 09, 0A, 0B, 0C, 0D, 0E, 0F

oscillator() in fm-processor.js. SW2..SW6 are currently invented -- sine-to-saw blends -- because there is no published description of them. One steady note per shape gives the harmonic series of each, which is enough to reproduce them properly.
### CAL9-LFO

**Measures:** LFO FREQ value -> hertz

**Steps `LFO1 FRQ` through:** 40, 60, 80, 98, B0, C8, E0, F0, FF

lfoFreqHz(). The tremolo rate is directly countable from the recorded amplitude envelope.
