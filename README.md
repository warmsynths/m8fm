# m8fm

m8fm is an interface for the 4-operator FM engine in the Dirtywave M8 Tracker.

Inspired by the workflow of the Elektron Model:Cycles, it wraps the M8's FM synthesizer into six dedicated sound machines with focused macro controls. You dial in sounds with six parameter cells, preview them through an in-browser audio engine, and export hardware-ready `.m8i` instrument files or full `.m8s` demo songs.

## Sound Machines

Each machine configures the M8's four operators into a dedicated synthesis topology with curated presets:

- **Electric Piano** (`A>B+C>D`): Tine chime, hammer strike, Wurli bark, and stereo tremolo.
- **Sub Bass** (`A>B>C>D`): 4-operator cascade stack for deep fundamentals, pitch snap, Reese growl, and 808 kicks.
- **Mallet** (`A+B>C>D`): Tuned bar resonance, harmonic focus, strike dampening, and acoustic tail.
- **Pad** (`(A+B)>(C+D)`): Dual-modulator layers for slow washes, upper-register shimmer, detuned chorus, and hollow formants.
- **Percussion** (`A>B+C>D`): Dedicated drum engine spanning heavy kicks, metallic snares, and closed/open hats.
- **Vintage Lead** (`A>B+C+D`): Triple-modulator lead synth with waveshaping, filter cutoff sweeps, and analog drift.

## Synthesis Controls

The deck exposes six universal parameters that map directly to the underlying M8 engine:

- **RATIO**: Frequency multiplier with detents at octave and harmonic intervals (0.5x to 8x).
- **CONTOUR**: 2D pad balancing decay time and curve bend.
- **FEEDBACK**: Operator self-modulation, from warm harmonic saturation to harsh digital noise.
- **NOISE**: Attack transient grain and high-frequency grit.
- **ENVELOPE**: Attack duration and release level.
- **MOD INDEX**: Sideband depth and modulation intensity.

The deck also includes a live vector visualizer for onset and decay slices, built-in groove demo playback for each machine, ten color themes, and single-click export for `.m8i` instruments and `.m8s` songs.

## How it fits together

The app keeps one representation of a patch, `M8Patch`, holding the raw byte values (`00`–`FF`) exactly as the hardware stores them. The macro controls nudge those values through `MacroMapper`, `M8Serializer` packs them into `.m8i` instrument or `.m8s` song files, and the audio engine converts them into audio units through the curves in `src/audio/M8Patch.ts`. What you dial in on screen is what the export writes and what the preview plays.

Synthesis runs in an `AudioWorklet` (`src/audio/fm-processor.js`) that does true 4-operator phase modulation with per-sample operator feedback. Web Audio nodes cannot do either (see `m8_fm_synthesis_reference.md` for technical background).

### Comparing against real hardware

Point the test suite at an instrument dumped from an M8 to diff this app's Electric Piano against it field by field:

```bash
M8FM_REFERENCE_M8I="/path/to/E PIANO07.m8i" npm test
```

That checks parameter matching. Matching the actual sound requires measuring how Dirtywave maps raw `00`–`FF` values into seconds, hertz, or modulation depth.

`calibration/M8FM-CALIBRATION.m8s` plays a sweep that measures those values. Every measurement point is its own instrument. Recording it means loading the song onto an M8, capturing the line output, and running the analysis scripts:

```bash
node tools/analyze-recording.mjs your-take.wav     # labelled measurements
node tools/fit-hardware-curves.mjs your-take.wav   # curve fitting
```

Two hardware characteristics have been measured and implemented in the app:

- **Envelope decay** is an exponential curve at `2888/DEC` dB per second. The time to fall 60 dB is `DEC x 20.8 ms`. Doubling `DEC` doubles the time.
- **A MOD bus scales what it is wired to, rather than adding to it.** An operator whose bus rests at zero is silent regardless of its own `LEVEL` setting.

Modulation index, feedback, LFO rate, and the `SW2`–`SW6` waveforms are current estimates. The initial calibration recording was made with operators at `LEV FF`, but an M8 operator clips above roughly `LEV C0` (a sine wave measures a crest factor of 1.41 up to `C0` and 1.06 at `FF`). That clipping happens inside the instrument before the filter, so recording gain adjustments cannot avoid it. The calibration song now sets operators to `LEV A0`, keeping them below the clipping ceiling for clean measurement.

## Development

Built with TypeScript, Lit, and Vite. Reading and writing M8 files uses `m8-js`.

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Run unit tests
npm test

# Build production bundle (writes to docs/ for GitHub Pages)
npm run build
```

## License

GPL-3.0. See [LICENSE](LICENSE) for details.
