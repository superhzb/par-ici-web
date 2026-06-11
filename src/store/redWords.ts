import { create } from 'zustand';
import type { RedWordEntry, SentenceKey, WordRef } from '../lib/types';
import { normalizeWord } from '../lib/timing';
import { loadJSON, saveJSON } from '../lib/storage';
import { sentenceKey } from './progress';

const STORAGE_KEY = 'par-ici/red-words/v1';
type RedWordsData = Record<string, RedWordEntry>;

// True when a ref points at the given sentence (ignores wordIdx).
const refMatchesSentence = (r: WordRef, ep: number, piste: number, sentenceId: number): boolean =>
  r.ep === ep && r.piste === piste && r.sentenceId === sentenceId;

// Set of sentence keys that have at least one red word — computed once, O(refs).
export function redSentenceKeys(data: RedWordsData): Set<SentenceKey> {
  const keys = new Set<SentenceKey>();
  for (const entry of Object.values(data)) {
    for (const ref of entry.refs) keys.add(sentenceKey(ref.ep, ref.piste, ref.sentenceId));
  }
  return keys;
}

type RedWordsStore = {
  data: RedWordsData;
  isRed: (wordText: string, ep: number, piste: number, sentenceId: number, wordIdx: number) => boolean;
  addRed: (wordText: string, ep: number, piste: number, sentenceId: number, wordIdx: number) => void;
  removeRed: (wordText: string, ep: number, piste: number, sentenceId: number, wordIdx: number) => void;
  clearSentenceReds: (ep: number, piste: number, sentenceId: number) => void;
  getRedKeysForSentence: (ep: number, piste: number, sentenceId: number) => string[];
};

export const useRedWordsStore = create<RedWordsStore>((set, get) => {
  const commit = (data: RedWordsData) => {
    saveJSON(STORAGE_KEY, data);
    set({ data });
  };

  return {
    data: loadJSON<RedWordsData>(STORAGE_KEY, {}),

    isRed: (wordText, ep, piste, sentenceId, wordIdx) => {
      const norm = normalizeWord(wordText);
      return get().data[norm]?.refs.some(
        r => refMatchesSentence(r, ep, piste, sentenceId) && r.wordIdx === wordIdx
      ) ?? false;
    },

    addRed: (wordText, ep, piste, sentenceId, wordIdx) => {
      const norm = normalizeWord(wordText);
      const cur = get().data;
      const entry = cur[norm] ?? { word: wordText, refs: [] };
      const exists = entry.refs.some(
        r => refMatchesSentence(r, ep, piste, sentenceId) && r.wordIdx === wordIdx
      );
      if (exists) return;
      commit({
        ...cur,
        [norm]: { word: wordText, refs: [...entry.refs, { ep, piste, sentenceId, wordIdx }] },
      });
    },

    removeRed: (wordText, ep, piste, sentenceId, wordIdx) => {
      const norm = normalizeWord(wordText);
      const cur = get().data;
      const entry = cur[norm];
      if (!entry) return;

      const remaining = entry.refs.filter(
        r => !(refMatchesSentence(r, ep, piste, sentenceId) && r.wordIdx === wordIdx)
      );
      const next = { ...cur };
      if (remaining.length > 0) next[norm] = { ...entry, refs: remaining };
      else delete next[norm];
      commit(next);
    },

    clearSentenceReds: (ep, piste, sentenceId) => {
      const next: RedWordsData = {};
      for (const [norm, entry] of Object.entries(get().data)) {
        const remaining = entry.refs.filter(r => !refMatchesSentence(r, ep, piste, sentenceId));
        if (remaining.length > 0) next[norm] = { ...entry, refs: remaining };
      }
      commit(next);
    },

    getRedKeysForSentence: (ep, piste, sentenceId) => {
      const cur = get().data;
      return Object.keys(cur).filter(norm =>
        cur[norm].refs.some(r => refMatchesSentence(r, ep, piste, sentenceId))
      );
    },
  };
});
