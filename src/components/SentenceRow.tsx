import { useRef, useEffect, useState } from 'react';
import type { Sentence, Chunk, LanguageCode, TranslationMode, WordState } from '../lib/types';
import { ChunkBox } from './ChunkBox';
import { useProgressStore, sentenceKey } from '../store/progress';
import { useRedWordsStore } from '../store/redWords';
import { findActiveWord, findActiveChunk, findChunkForWord } from '../lib/timing';
import { usePlayerStore } from '../store/player';
import { getTranslation, revealsFrench, showsSentenceTranslation } from '../lib/translations';

type Props = {
  sentence: Sentence;
  isActive: boolean;
  ep: number;
  piste: number;
  onChunkClick: (chunk: Chunk) => void;
  onSentenceClick: (start: number, end: number) => void;
  translationMode: TranslationMode;
  translationLanguage: LanguageCode;
  practiceMode?: boolean;
  onPracticeInteracted?: () => void;
  isAudioLoading?: boolean;
};

export function SentenceRow({
  sentence,
  isActive,
  ep,
  piste,
  onChunkClick,
  onSentenceClick,
  translationMode,
  translationLanguage,
  practiceMode = false,
  onPracticeInteracted,
  isAudioLoading = false,
}: Props) {
  const key = sentenceKey(ep, piste, sentence.id);
  const { getProgress, setStatus, setRevealed } = useProgressStore();
  const { isRed, addRed, removeRed, clearSentenceReds } = useRedWordsStore();
  const currentTime = usePlayerStore(s => s.currentTime);
  const progress = getProgress(key);
  const rowRef = useRef<HTMLDivElement>(null);

  const [practiceInteracted, setPracticeInteracted] = useState(false);

  const [wordStates, setWordStates] = useState<WordState[]>(() =>
    sentence.words.map((w, idx) => {
      if (practiceMode) return 'hidden';
      if (isRed(w.text, ep, piste, sentence.id, idx)) return 'red';
      if (progress.revealed) return 'revealed';
      return 'hidden';
    })
  );

  const effectiveStatus = (practiceMode && !practiceInteracted)
    ? 'none'
    : practiceMode && wordStates.some(s => s === 'red')
      ? 'fail'
      : progress.status;
  const hasLocalReveal = wordStates.some(s => s !== 'hidden');
  const effectiveRevealed = (practiceMode && !practiceInteracted) ? hasLocalReveal : progress.revealed;
  const modeRevealed = revealsFrench(translationMode);
  const displayedRevealed = effectiveRevealed || modeRevealed;

  useEffect(() => {
    if (isActive && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActive]);

  const activeWordIdx = isActive ? findActiveWord(sentence.words, currentTime) : -1;
  const activeChunkIdx = isActive ? findActiveChunk(sentence.chunks, currentTime) : -1;
  const sentenceTranslation = getTranslation(sentence.translations, translationLanguage);

  const wordToChunk = sentence.words.map(w => findChunkForWord(sentence.chunks, w.start) ?? sentence.chunks[0]);

  const getStoredVisibleWordStates = () =>
    sentence.words.map((w, idx) => isRed(w.text, ep, piste, sentence.id, idx) ? 'red' : 'revealed');

  const chunkWordIndices: number[][] = sentence.chunks.map((_, ci) =>
    sentence.words.reduce<number[]>((acc, _w, wi) => {
      if (wordToChunk[wi] === sentence.chunks[ci]) acc.push(wi);
      return acc;
    }, [])
  );

  const handleWordStateChange = (wordIdx: number, newState: WordState) => {
    const changedWord = sentence.words[wordIdx];
    const wasRed = wordStates[wordIdx] === 'red';
    setWordStates(prev => {
      const next = [...prev];
      next[wordIdx] = newState;
      return next;
    });
    if (newState === 'red') {
      addRed(changedWord.text, ep, piste, sentence.id, wordIdx);
      if (practiceMode) setPracticeInteracted(true);
      if (practiceMode) onPracticeInteracted?.();
      setStatus(key, 'fail');
    } else if (wasRed) {
      removeRed(changedWord.text, ep, piste, sentence.id, wordIdx);
      if (practiceMode) {
        setPracticeInteracted(true);
        onPracticeInteracted?.();
      }
    }
  };

  const handleReveal = () => {
    setWordStates(getStoredVisibleWordStates());
    if (practiceMode && !practiceInteracted) {
      setPracticeInteracted(true);
      onPracticeInteracted?.();
    }
    setRevealed(key, true);
    if (!practiceMode) setStatus(key, 'fail');
  };

  const handleUnreveal = () => {
    setWordStates(sentence.words.map((w, idx) =>
      practiceMode && !practiceInteracted
        ? 'hidden'
        : isRed(w.text, ep, piste, sentence.id, idx) ? 'red' : 'hidden'
    ));
    if (practiceMode && !practiceInteracted) return;
    setRevealed(key, false);
  };

  const handleRevealToggle = () => {
    if (effectiveRevealed) handleUnreveal();
    else handleReveal();
  };

  const handlePass = () => {
    if (practiceMode) setPracticeInteracted(true);
    if (practiceMode) onPracticeInteracted?.();
    if (progress.status === 'pass') {
      setStatus(key, 'none');
    } else {
      clearSentenceReds(ep, piste, sentence.id);
      setWordStates(sentence.words.map(() => 'revealed'));
      setRevealed(key, true);
      setStatus(key, 'pass');
    }
  };

  const handleFail = () => {
    if (practiceMode) setPracticeInteracted(true);
    if (practiceMode) onPracticeInteracted?.();
    if (progress.status === 'fail') {
      setStatus(key, 'none');
    } else {
      setWordStates(sentence.words.map((w, idx) => isRed(w.text, ep, piste, sentence.id, idx) ? 'red' : 'revealed'));
      setRevealed(key, true);
      setStatus(key, 'fail');
    }
  };

  const statusBg =
    effectiveStatus === 'pass' ? 'border-green-700/50 bg-green-950/20' :
    effectiveStatus === 'fail' ? 'border-red-700/50 bg-red-950/20' :
    isActive ? 'border-blue-700/40 bg-blue-950/10' : 'border-gray-700/30';

  return (
    <div
      ref={rowRef}
      className={`max-w-full overflow-hidden rounded-lg border p-3 pb-9 mb-2 transition-colors relative cursor-pointer ${statusBg}`}
      onClick={() => onSentenceClick(sentence.start, sentence.end)}
    >
      <div className="min-w-0 pr-20">
        <div className="flex max-w-full flex-wrap gap-2 items-start">
          {sentence.chunks.map((chunk, ci) => {
            const localWordStates = chunkWordIndices[ci].map(wi => wordStates[wi]);
            return (
              <ChunkBox
                key={ci}
                chunk={chunk}
                chunkIdx={ci}
                words={sentence.words}
                wordIndices={chunkWordIndices[ci]}
                activeWordIdx={activeWordIdx}
                isActiveChunk={ci === activeChunkIdx}
                globalRevealed={displayedRevealed}
                wordStates={localWordStates}
                onWordStateChange={handleWordStateChange}
                onChunkClick={onChunkClick}
                translationMode={translationMode}
                translationLanguage={translationLanguage}
                ep={ep}
                piste={piste}
                sentenceId={sentence.id}
              />
            );
          })}
        </div>
        {(showsSentenceTranslation(translationMode) || displayedRevealed) && sentenceTranslation && (
          <div className="text-xs text-yellow-300/70 mt-1.5 pl-0.5">{sentenceTranslation}</div>
        )}
      </div>

      <div className="absolute top-2 right-2 flex gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); handlePass(); }}
          className={`w-9 h-9 rounded text-base font-bold border transition-colors
            ${effectiveStatus === 'pass' ? 'bg-green-600 border-green-500 text-white' : 'bg-gray-800 border-gray-600 text-green-500 hover:bg-green-900'}`}
          title="Pass"
        >✓</button>
        <button
          onClick={(e) => { e.stopPropagation(); handleFail(); }}
          className={`w-9 h-9 rounded text-base font-bold border transition-colors
            ${effectiveStatus === 'fail' ? 'bg-red-700 border-red-600 text-white' : 'bg-gray-800 border-gray-600 text-red-500 hover:bg-red-900'}`}
          title="Fail"
        >✗</button>
      </div>

      {isAudioLoading && (
        <div className="absolute bottom-2 left-3 flex items-center gap-2 text-xs text-blue-300">
          <span className="h-3 w-3 rounded-full border-2 border-blue-400/40 border-t-blue-300 animate-spin" />
          <span>Loading audio...</span>
        </div>
      )}

      <div className="absolute bottom-2 right-2">
        <button
          onClick={(e) => { e.stopPropagation(); handleRevealToggle(); }}
          className={`w-7 h-7 rounded border transition-colors flex items-center justify-center
            ${effectiveRevealed ? 'bg-sky-700 border-sky-600 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
          title={effectiveRevealed ? 'Hide' : 'Reveal'}
        >
          {effectiveRevealed ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
