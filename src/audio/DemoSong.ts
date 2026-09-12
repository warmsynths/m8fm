import type { M8Patch } from './M8Patch';
import { clampByte } from './M8Patch';
import { patchToFMSynth } from './M8Serializer';
import type { DemoPattern } from './DemoPatterns';
// @ts-ignore - m8-js ships untyped CommonJS
import { dumpM8File } from 'm8-js';
// @ts-ignore
import Song from 'm8-js/lib/types/Song';
// @ts-ignore
import Chain from 'm8-js/lib/types/internal/Chain';
// @ts-ignore
import ChainStep from 'm8-js/lib/types/internal/ChainStep';
// @ts-ignore
import Phrase from 'm8-js/lib/types/internal/Phrase';
// @ts-ignore
import PhraseStep from 'm8-js/lib/types/internal/PhraseStep';

export const STEPS_PER_PHRASE = 16;
export const EMPTY = 0xff;

/**
 * Builds a Dirtywave M8 Song (.m8s) with the given patch placed at
 * Instrument Slot 00, playing the specified DemoPattern.
 *
 * The pattern notes are mapped across tracks into phrases and chains,
 * and arranged on Song steps so that loading the file on an M8 and pressing
 * PLAY immediately starts the demo groove.
 */
export function buildDemoSong(
  patch: M8Patch,
  pattern: DemoPattern,
  songName?: string,
  multiPatches?: M8Patch[]
): any {
  const song = new Song();

  // M8 song name limit is 12 chars
  const title = (songName || patch.name || pattern.name || 'M8FM')
    .toUpperCase()
    .replace(/[^A-Z0-9_\- ]/g, '')
    .trim()
    .slice(0, 12);
  song.name = title || 'M8FM';
  song.tempo = pattern.tempo;

  if (multiPatches && multiPatches.length > 0) {
    multiPatches.forEach((p, idx) => {
      if (idx < 128) song.instruments[idx] = patchToFMSynth(p);
    });
  } else {
    // Set the current patch as Instrument 00
    song.instruments[0] = patchToFMSynth(patch);
  }

  // Group notes by track
  const tracksInUse = new Set<number>();
  pattern.notes.forEach((n) => tracksInUse.add(n.track));
  const sortedTracks = Array.from(tracksInUse).sort((a, b) => a - b);

  const numPhrasesPerTrack = Math.ceil(pattern.totalSteps / STEPS_PER_PHRASE);
  let nextPhraseIndex = 0;
  let nextChainIndex = 0;

  for (const trackIdx of sortedTracks) {
    if (trackIdx >= 8) continue; // M8 has 8 tracks (0..7)

    const trackNotes = pattern.notes.filter((n) => n.track === trackIdx);
    const trackPhrases: number[] = [];

    for (let p = 0; p < numPhrasesPerTrack; p++) {
      const phraseIndex = nextPhraseIndex++;
      const phrase = new Phrase();
      const stepOffset = p * STEPS_PER_PHRASE;

      for (let s = 0; s < STEPS_PER_PHRASE; s++) {
        const currentStep = stepOffset + s;
        if (currentStep >= pattern.totalSteps) break;

        const noteAtStep = trackNotes.find((n) => n.step === currentStep);
        if (noteAtStep) {
          const vol =
            noteAtStep.velocity !== undefined
              ? clampByte(noteAtStep.velocity * 255)
              : EMPTY;
          const instrIdx = (multiPatches && multiPatches.length > trackIdx) ? trackIdx : 0;
          phrase.steps[s] = new PhraseStep(undefined, instrIdx, noteAtStep.note, vol);
        }
      }

      song.phrases[phraseIndex] = phrase;
      trackPhrases.push(phraseIndex);
    }

    // Build chain for this track
    const chainIndex = nextChainIndex++;
    const chain = new Chain();
    for (let i = 0; i < trackPhrases.length; i++) {
      chain.steps[i] = new ChainStep(trackPhrases[i], 0x00);
    }
    song.chains[chainIndex] = chain;

    // Assign chain across 4 song steps so the demo loops nicely before stopping
    for (let s = 0; s < 4; s++) {
      song.steps[s].tracks[trackIdx] = chainIndex;
    }
  }

  return song;
}

/**
 * Serializes a DemoSong to raw M8 song file binary (.m8s).
 */
export function serializeDemoSong(
  patch: M8Patch,
  pattern: DemoPattern,
  songName?: string,
  multiPatches?: M8Patch[]
): Uint8Array {
  const song = buildDemoSong(patch, pattern, songName, multiPatches);
  return Uint8Array.from(dumpM8File(song));
}
