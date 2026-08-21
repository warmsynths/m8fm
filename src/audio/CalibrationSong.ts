import { calibrationSweep, silentInstrument } from './Calibration';
import type { SweepPoint } from './Calibration';
import { patchToFMSynth } from './M8Serializer';
import { hex } from './M8Patch';
// @ts-ignore - m8-js ships untyped CommonJS
import Song from 'm8-js/lib/types/Song';
// @ts-ignore
import Chain from 'm8-js/lib/types/internal/Chain';
// @ts-ignore
import ChainStep from 'm8-js/lib/types/internal/ChainStep';
// @ts-ignore
import Phrase from 'm8-js/lib/types/internal/Phrase';
// @ts-ignore
import PhraseStep from 'm8-js/lib/types/internal/PhraseStep';

/**
 * Builds a song that plays the whole calibration sweep on its own.
 *
 * Recording the sweep by hand means punching a note, changing one parameter,
 * punching the next note, hundreds of times, and getting the gaps right. Instead
 * every measurement point becomes its own instrument, and the sequencer steps
 * through them: load the song, press play, record once.
 *
 * The song deliberately uses only the plainest tracker mechanics -- notes,
 * phrases, chains, one song track -- and no FX commands, because the meaning of
 * the FMSYNTH command set is not documented well enough to rely on blind.
 * Cutting a note is done by triggering a silent instrument on the same track,
 * which is ordinary tracker behaviour rather than a special note value.
 */

/** Ticks per beat on the M8. */
const TICKS_PER_BEAT = 24;
export const SONG_TEMPO = 120;
/**
 * Ticks per step. The default groove of 6 gives sixteenth notes; 12 gives a
 * quarter-second step at 120 BPM, so a 16-step phrase is exactly four seconds.
 */
export const SONG_GROOVE = 12;
export const STEPS_PER_PHRASE = 16;

export const STEP_SECONDS = (60 / SONG_TEMPO) * (SONG_GROOVE / TICKS_PER_BEAT);
export const PHRASE_SECONDS = STEP_SECONDS * STEPS_PER_PHRASE;

/** The note every measurement is played at. Low enough to resolve harmonics. */
export const CALIBRATION_NOTE = 48;

/** Step within a measurement's first phrase at which the note is cut. */
const CUT_AFTER_STEPS = 8;
/** Steps of guaranteed silence before the next measurement starts. */
const TAIL_SILENCE_STEPS = 4;

const SILENT_INSTRUMENT = 0;
const EMPTY = 0xff;

export interface ManifestNote {
  index: number;
  test: string;
  parameter: string;
  value: number;
  valueHex: string;
  label: string;
  instrument: number;
  startSeconds: number;
  slotSeconds: number;
}

export interface CalibrationManifest {
  note: number;
  tempo: number;
  groove: number;
  stepSeconds: number;
  phraseSeconds: number;
  totalSeconds: number;
  notes: ManifestNote[];
}

export interface BuiltCalibrationSong {
  song: any;
  manifest: CalibrationManifest;
}

export function buildCalibrationSong(points: SweepPoint[] = calibrationSweep()): BuiltCalibrationSong {
  const song = new Song();
  song.name = 'M8FMCAL';
  song.tempo = SONG_TEMPO;
  // A flat groove: every step the same length, so timing is predictable.
  song.grooves[0].steps = Array.from({ length: STEPS_PER_PHRASE }, (_, i) => (i < 2 ? SONG_GROOVE : EMPTY));

  song.instruments[SILENT_INSTRUMENT] = patchToFMSynth(silentInstrument(), { compensate: false });

  const notes: ManifestNote[] = [];
  const phrases: any[] = [];
  let elapsed = 0;

  points.forEach((point, i) => {
    const instrumentSlot = i + 1;
    song.instruments[instrumentSlot] = patchToFMSynth(point.patch, { compensate: false });

    // One phrase carries the note; any further phrases are the gap that lets a
    // long decay finish before the next measurement begins.
    const firstPhrase = new Phrase();
    firstPhrase.steps[0] = new PhraseStep(undefined, instrumentSlot, CALIBRATION_NOTE, EMPTY);

    const measurementPhrases = [firstPhrase];
    for (let p = 1; p < point.phrases; p++) measurementPhrases.push(new Phrase());

    // Cut the note by triggering the silent instrument, leaving a clean gap
    // before the next onset.
    const cutStep = point.phrases === 1
      ? CUT_AFTER_STEPS
      : STEPS_PER_PHRASE - TAIL_SILENCE_STEPS;
    const cutPhrase = measurementPhrases[point.phrases - 1];
    cutPhrase.steps[cutStep] = new PhraseStep(undefined, SILENT_INSTRUMENT, CALIBRATION_NOTE, EMPTY);

    notes.push({
      index: notes.length + 1,
      test: point.test,
      parameter: point.parameter,
      value: point.value,
      valueHex: hex(point.value),
      label: point.label,
      instrument: instrumentSlot,
      startSeconds: +elapsed.toFixed(3),
      slotSeconds: +(point.phrases * PHRASE_SECONDS).toFixed(3)
    });

    elapsed += point.phrases * PHRASE_SECONDS;
    phrases.push(...measurementPhrases);
  });

  if (phrases.length > song.phrases.length) {
    throw new Error(`calibration needs ${phrases.length} phrases, the song format holds ${song.phrases.length}`);
  }
  if (points.length + 1 > song.instruments.length) {
    throw new Error(`calibration needs ${points.length + 1} instruments, the song format holds ${song.instruments.length}`);
  }

  phrases.forEach((phrase, i) => {
    song.phrases[i] = phrase;
  });

  // Chains hold 16 phrases each, and the song's first track plays the chains in
  // order. Everything runs on one track so nothing overlaps.
  const chainCount = Math.ceil(phrases.length / STEPS_PER_PHRASE);
  if (chainCount > song.chains.length) {
    throw new Error(`calibration needs ${chainCount} chains, the song format holds ${song.chains.length}`);
  }

  for (let c = 0; c < chainCount; c++) {
    const chain = new Chain();
    for (let s = 0; s < STEPS_PER_PHRASE; s++) {
      const phraseIndex = c * STEPS_PER_PHRASE + s;
      chain.steps[s] = new ChainStep(phraseIndex < phrases.length ? phraseIndex : EMPTY, 0x00);
    }
    song.chains[c] = chain;
    song.steps[c].tracks[0] = c;
  }

  return {
    song,
    manifest: {
      note: CALIBRATION_NOTE,
      tempo: SONG_TEMPO,
      groove: SONG_GROOVE,
      stepSeconds: +STEP_SECONDS.toFixed(4),
      phraseSeconds: +PHRASE_SECONDS.toFixed(4),
      totalSeconds: +elapsed.toFixed(1),
      notes
    }
  };
}
