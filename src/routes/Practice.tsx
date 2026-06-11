import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Sentence, Chunk, RedWordEntry, SentenceProgress } from '../lib/types';
import { useProgressStore, sentenceKey } from '../store/progress';
import { useRedWordsStore, redSentenceKeys } from '../store/redWords';
import { usePracticeQueueStore } from '../store/practiceQueue';
import { SentenceRow } from '../components/SentenceRow';
import { AudioEngine } from '../lib/audio';
import { loadAllPistes } from '../lib/data';
import { usePlayerStore } from '../store/player';
import { TranslationModeButton } from '../components/TranslationModeButton';

type LoadedPiste = {
  ep: number;
  piste: number;
  audioSrc: string;
  sentences: Sentence[];
};

const BATCH_SIZE = 50;

type PracticeItem = {
  sentence: Sentence;
  ep: number;
  piste: number;
  audioSrc: string;
  key: string;
};

function getPracticeItems(
  loadedPistes: LoadedPiste[],
  progressData: Record<string, SentenceProgress>,
  redWordsData: Record<string, RedWordEntry>,
  practicedAt: Record<string, number>
): PracticeItem[] {
  const redKeys = redSentenceKeys(redWordsData);

  const naturalItems = loadedPistes.flatMap((p) =>
    p.sentences.flatMap((s) => {
      const key = sentenceKey(p.ep, p.piste, s.id);
      const prog = progressData[key];
      const hasRed = redKeys.has(key);
      return prog?.status === 'fail' || hasRed
        ? [{ sentence: s, ep: p.ep, piste: p.piste, audioSrc: p.audioSrc, key }]
        : [];
    })
  );

  return naturalItems.sort((a, b) => {
    const aPracticed = practicedAt[a.key] !== undefined;
    const bPracticed = practicedAt[b.key] !== undefined;
    if (aPracticed === bPracticed) return 0;
    return aPracticed ? 1 : -1;
  });
}

export function Practice() {
  const [loadedPistes, setLoadedPistes] = useState<LoadedPiste[]>([]);
  const [sessionItems, setSessionItems] = useState<PracticeItem[] | null>(null);
  const [activePracticeKey, setActivePracticeKey] = useState<string | null>(null);
  const [loadingAudioKey, setLoadingAudioKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const progressData = useProgressStore(s => s.data);
  const redWordsData = useRedWordsStore(s => s.data);
  const practiceQueueData = usePracticeQueueStore(s => s.data);
  const markPracticed = usePracticeQueueStore(s => s.markPracticed);
  const prunePracticeQueue = usePracticeQueueStore(s => s.prune);
  const { translationMode, translationLanguage, setCurrentTime, setDuration, setPlaying } = usePlayerStore();
  const enginesRef = useRef<Map<string, AudioEngine>>(new Map());
  const playbackRequestRef = useRef(0);
  const practicedAt = practiceQueueData.practicedAt;

  const candidateItems = useMemo<PracticeItem[]>(() => {
    return getPracticeItems(loadedPistes, progressData, redWordsData, practicedAt);
  }, [loadedPistes, practicedAt, progressData, redWordsData]);

  const items = sessionItems ?? candidateItems.slice(0, BATCH_SIZE);

  useEffect(() => {
    if (!loading) {
      prunePracticeQueue(candidateItems.map(item => item.key));
    }
  }, [candidateItems, loading, prunePracticeQueue]);

  useEffect(() => {
    let cancelled = false;

    loadAllPistes()
      .then((loaded) => {
        if (cancelled) return;
        const nextLoadedPistes: LoadedPiste[] = loaded.map(({ piste, sentences }) => ({
          ep: piste.episode,
          piste: piste.piste,
          audioSrc: piste.audio,
          sentences,
        }));
        setLoadedPistes(nextLoadedPistes);
        setSessionItems(getPracticeItems(
          nextLoadedPistes,
          useProgressStore.getState().data,
          useRedWordsStore.getState().data,
          usePracticeQueueStore.getState().data.practicedAt
        ).slice(0, BATCH_SIZE));
        setLoading(false);
      })
      .catch(err => console.error('Failed to load practice data', err));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const engines = enginesRef.current;
    return () => {
      for (const eng of engines.values()) eng.destroy();
      setActivePracticeKey(null);
      setCurrentTime(0);
      setDuration(0);
      setPlaying(false);
    };
  }, [setCurrentTime, setDuration, setPlaying]);

  const getEngine = (audioSrc: string): AudioEngine => {
    if (!enginesRef.current.has(audioSrc)) {
      const eng = new AudioEngine(audioSrc, (t) => setCurrentTime(t));
      eng.onEnded(() => {
        setActivePracticeKey(null);
        setPlaying(false);
      });
      eng.onRangePaused(() => {
        setActivePracticeKey(null);
        setPlaying(false);
      });
      enginesRef.current.set(audioSrc, eng);
    }
    return enginesRef.current.get(audioSrc)!;
  };

  const playItemRange = async (itemKey: string, audioSrc: string, start: number, end: number) => {
    const requestId = playbackRequestRef.current + 1;
    playbackRequestRef.current = requestId;
    for (const [src, eng] of enginesRef.current.entries()) {
      if (src !== audioSrc) eng.pause();
    }
    setActivePracticeKey(itemKey);
    setLoadingAudioKey(itemKey);
    try {
      await getEngine(audioSrc).playRange(start, end);
      if (playbackRequestRef.current === requestId) {
        setPlaying(true);
      }
    } catch (error) {
      if (playbackRequestRef.current === requestId) {
        setActivePracticeKey(null);
        setPlaying(false);
      }
      console.error('Unable to play audio', error);
    } finally {
      if (playbackRequestRef.current === requestId) {
        setLoadingAudioKey(null);
      }
    }
  };

  const handleChunkClick = (itemKey: string, audioSrc: string, chunk: Chunk) => {
    void playItemRange(itemKey, audioSrc, chunk.start, chunk.end);
  };

  const handleSentenceClick = (itemKey: string, audioSrc: string, start: number, end: number) => {
    void playItemRange(itemKey, audioSrc, start, end);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">Loading...</div>
  );

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-gray-950 text-white flex flex-col">
      <div className="sticky top-0 z-10 max-w-full bg-gray-900 border-b border-gray-800 px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3">
        <Link
          to="/"
          className="shrink-0 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm font-medium border border-gray-600 transition-colors"
        >
          ← Home
        </Link>
        <span className="shrink-0 text-gray-500">|</span>
        <span className="min-w-0 truncate text-sm font-semibold text-purple-300">Practice ({items.length}/{candidateItems.length})</span>
        <div className="ml-auto shrink-0">
          <TranslationModeButton />
        </div>
      </div>
      <div className="flex-1 overflow-x-hidden overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="text-center text-gray-500 mt-12">
            <div className="text-4xl mb-3">🎉</div>
            <div>No sentences to practice.</div>
            <div className="text-sm mt-1">Mark words red or sentences as fail to add them here.</div>
          </div>
        ) : (
          <>
            {items.map(({ sentence, ep, piste, audioSrc, key: itemKey }) => {
              return (
                <SentenceRow
                  key={itemKey}
                  sentence={sentence}
                  isActive={itemKey === activePracticeKey}
                  ep={ep}
                  piste={piste}
                  onChunkClick={(chunk) => handleChunkClick(itemKey, audioSrc, chunk)}
                  onSentenceClick={(start, end) => handleSentenceClick(itemKey, audioSrc, start, end)}
                  translationMode={translationMode}
                  translationLanguage={translationLanguage}
                  onPracticeInteracted={() => markPracticed(itemKey)}
                  isAudioLoading={loadingAudioKey === itemKey}
                  practiceMode
                />
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
