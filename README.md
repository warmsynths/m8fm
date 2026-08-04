# m8fm

m8fm is an alternative interface for the FM synthesizer engine in the M8 Tracker. 

## Inspiration

This project is inspired by the workflow of the Elektron Model:Cycles. The goal is to provide a more immediate and accessible way to interact with and program the M8 tracker's built-in FM engine.

## How it fits together

The app keeps one representation of a patch, `M8Patch`, holding the raw M8
parameter values exactly as the device shows them. The UI prints those values,
`M8Serializer` copies them straight into the `.m8i` file, and the audio engine
converts them into audio units through the curves in `src/audio/M8Patch.ts`.
Because there is only one interpretation of a raw value, what you see in the FM
PARAMETERS panel is what the export writes and what the preview plays.

Synthesis runs in an `AudioWorklet` (`src/audio/fm-processor.js`) that does true
4-operator phase modulation with per-sample operator feedback. Web Audio nodes
cannot do either — see `m8_fm_synthesis_reference.md` for why.

### Comparing against real hardware

Point the test suite at an instrument dumped from an M8 to diff this app's
Electric Piano against it field by field:

```
M8FM_REFERENCE_M8I="/path/to/E PIANO07.m8i" npm test
```

## Technology Stack

The application is built using the following technologies:
- TypeScript for type-safe application logic.
- Vite as the build tool and development server.
- Lit for building lightweight, reactive web components.
- m8-js for reading and writing M8 instrument files.

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0). See the LICENSE file for details.
