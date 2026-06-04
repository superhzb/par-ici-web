import type { PisteInfo, RedWordEntry, Sentence, SentenceProgress, WordRef } from './types';
import { loadAllPistes } from './data';
import { getTranslation } from './translations';

const PROGRESS_KEY = 'par-ici/progress/v1';
const RED_WORDS_KEY = 'par-ici/red-words/v1';
const PRACTICE_QUEUE_KEY = 'par-ici/practice-queue/v1';

type ProgressData = Record<string, SentenceProgress>;
type RedWordsData = Record<string, RedWordEntry>;
type PracticeQueueData = { practicedAt: Record<string, number> };

type LoadedPiste = {
  piste: PisteInfo;
  sentences: Sentence[];
};

type SentenceIndexEntry = {
  piste: PisteInfo;
  sentence: Sentence;
};

type ReviewRedWord = {
  word: string;
  normalized: string;
  wordIdx: number;
  start: number | null;
  end: number | null;
};

type ReviewSentence = {
  key: string;
  ep: number;
  piste: number;
  sentenceId: number;
  status: SentenceProgress['status'];
  revealed: boolean;
  text: string;
  translations: Sentence['translations'];
  audio: string;
  start: number;
  end: number;
  redWords: ReviewRedWord[];
};

type ReviewWordOccurrence = {
  key: string;
  ep: number;
  piste: number;
  sentenceId: number;
  wordIdx: number;
  sentenceText: string;
  translation: string;
  translations: Sentence['translations'];
  audio: string;
  start: number | null;
  end: number | null;
};

type ReviewWord = {
  word: string;
  normalized: string;
  count: number;
  occurrences: ReviewWordOccurrence[];
};

export type ProgressExport = {
  format: 'par-ici-progress-export';
  version: 1;
  exportedAt: string;
  restore: {
    localStorageKeys: {
      [PROGRESS_KEY]: ProgressData;
      [RED_WORDS_KEY]: RedWordsData;
      [PRACTICE_QUEUE_KEY]: PracticeQueueData;
    };
  };
  review: {
    sentences: ReviewSentence[];
    words: ReviewWord[];
  };
};

function readStoredJSON<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function sentenceKey(ep: number, piste: number, sentenceId: number): string {
  return `ep${ep}_p${piste}_s${sentenceId}`;
}

function buildSentenceIndex(loadedPistes: LoadedPiste[]): Map<string, SentenceIndexEntry> {
  const index = new Map<string, SentenceIndexEntry>();
  for (const loaded of loadedPistes) {
    for (const sentence of loaded.sentences) {
      index.set(sentenceKey(loaded.piste.episode, loaded.piste.piste, sentence.id), {
        piste: loaded.piste,
        sentence,
      });
    }
  }
  return index;
}

function refsBySentence(redWords: RedWordsData): Map<string, Array<{ normalized: string; entry: RedWordEntry; ref: WordRef }>> {
  const bySentence = new Map<string, Array<{ normalized: string; entry: RedWordEntry; ref: WordRef }>>();
  for (const [normalized, entry] of Object.entries(redWords)) {
    for (const ref of entry.refs) {
      const key = sentenceKey(ref.ep, ref.piste, ref.sentenceId);
      const refs = bySentence.get(key) ?? [];
      refs.push({ normalized, entry, ref });
      bySentence.set(key, refs);
    }
  }
  return bySentence;
}

function uniqueMeaningfulSentenceKeys(progress: ProgressData, redWords: RedWordsData): string[] {
  const keys = new Set<string>();
  for (const [key, item] of Object.entries(progress)) {
    if (item.status !== 'none' || item.revealed) keys.add(key);
  }
  for (const entry of Object.values(redWords)) {
    for (const ref of entry.refs) keys.add(sentenceKey(ref.ep, ref.piste, ref.sentenceId));
  }
  return [...keys].sort();
}

function buildReviewSentences(
  progress: ProgressData,
  redWords: RedWordsData,
  sentenceIndex: Map<string, SentenceIndexEntry>
): ReviewSentence[] {
  const redRefs = refsBySentence(redWords);
  return uniqueMeaningfulSentenceKeys(progress, redWords).flatMap((key) => {
    const indexed = sentenceIndex.get(key);
    if (!indexed) return [];

    const { piste, sentence } = indexed;
    const sentenceProgress = progress[key] ?? { status: 'none', revealed: false };
    const redWordsForSentence = (redRefs.get(key) ?? []).flatMap(({ normalized, entry, ref }) => {
      const word = sentence.words[ref.wordIdx];
      return [{
        word: word?.text ?? entry.word,
        normalized,
        wordIdx: ref.wordIdx,
        start: word?.start ?? null,
        end: word?.end ?? null,
      }];
    });

    return [{
      key,
      ep: piste.episode,
      piste: piste.piste,
      sentenceId: sentence.id,
      status: sentenceProgress.status,
      revealed: sentenceProgress.revealed,
      text: sentence.text,
      translations: sentence.translations,
      audio: piste.audio,
      start: sentence.start,
      end: sentence.end,
      redWords: redWordsForSentence,
    }];
  });
}

function buildReviewWords(
  redWords: RedWordsData,
  sentenceIndex: Map<string, SentenceIndexEntry>
): ReviewWord[] {
  return Object.entries(redWords)
    .map(([normalized, entry]) => {
      const occurrences = entry.refs.flatMap((ref): ReviewWordOccurrence[] => {
        const key = sentenceKey(ref.ep, ref.piste, ref.sentenceId);
        const indexed = sentenceIndex.get(key);
        if (!indexed) return [];

        const { piste, sentence } = indexed;
        const word = sentence.words[ref.wordIdx];
        return [{
          key,
          ep: ref.ep,
          piste: ref.piste,
          sentenceId: ref.sentenceId,
          wordIdx: ref.wordIdx,
          sentenceText: sentence.text,
          translation: getTranslation(sentence.translations, 'en'),
          translations: sentence.translations,
          audio: piste.audio,
          start: word?.start ?? null,
          end: word?.end ?? null,
        }];
      });

      return {
        word: entry.word,
        normalized,
        count: occurrences.length,
        occurrences,
      };
    })
    .sort((a, b) => a.normalized.localeCompare(b.normalized));
}

export async function buildProgressExport(): Promise<ProgressExport> {
  const progress = readStoredJSON<ProgressData>(PROGRESS_KEY, {});
  const redWords = readStoredJSON<RedWordsData>(RED_WORDS_KEY, {});
  const practiceQueue = readStoredJSON<PracticeQueueData>(PRACTICE_QUEUE_KEY, { practicedAt: {} });
  const loadedPistes = await loadAllPistes();
  const sentenceIndex = buildSentenceIndex(loadedPistes);

  return {
    format: 'par-ici-progress-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    restore: {
      localStorageKeys: {
        [PROGRESS_KEY]: progress,
        [RED_WORDS_KEY]: redWords,
        [PRACTICE_QUEUE_KEY]: practiceQueue,
      },
    },
    review: {
      sentences: buildReviewSentences(progress, redWords, sentenceIndex),
      words: buildReviewWords(redWords, sentenceIndex),
    },
  };
}

export function progressExportFilename(date = new Date()): string {
  return `par-ici-progress-${date.toISOString().slice(0, 10)}.json`;
}

async function shareFile(file: File): Promise<boolean> {
  if (!navigator.canShare?.({ files: [file] })) return false;
  await navigator.share({
    files: [file],
    title: 'Par ici progress export',
    text: 'Par ici progress export JSON',
  });
  return true;
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportProgressFile(): Promise<void> {
  const data = await buildProgressExport();
  const filename = progressExportFilename();
  const json = JSON.stringify(data, null, 2);
  const file = new File([json], filename, { type: 'application/json' });

  try {
    if (await shareFile(file)) return;
  } catch (err) {
    console.warn('Native file share failed; falling back to download.', err);
  }
  downloadFile(file);
}
