import type { Chunk, LanguageCode, TranslationMode, Word, WordState } from '../lib/types';
import { WordSlot } from './WordSlot';
import { getTranslation, showsChunkTranslation } from '../lib/translations';

type Props = {
  chunk: Chunk;
  chunkIdx: number;
  words: Word[];
  wordIndices: number[];
  activeWordIdx: number;
  isActiveChunk: boolean;
  globalRevealed: boolean;
  wordStates: WordState[];
  onWordStateChange: (wordIdx: number, state: WordState) => void;
  onChunkClick: (chunk: Chunk) => void;
  translationMode: TranslationMode;
  translationLanguage: LanguageCode;
  ep: number;
  piste: number;
  sentenceId: number;
};

export function ChunkBox({
  chunk, words, wordIndices, activeWordIdx, isActiveChunk,
  globalRevealed, wordStates, onWordStateChange, onChunkClick,
  translationMode, translationLanguage, ep, piste, sentenceId,
}: Props) {
  const chunkTranslation = getTranslation(chunk.translations, translationLanguage);

  return (
    <div
      className={`inline-flex max-w-full min-w-0 flex-col items-start border rounded-lg p-1.5 gap-1 cursor-pointer
        transition-colors ${isActiveChunk ? 'border-blue-500/60 bg-blue-950/30' : 'border-gray-700 bg-gray-800/40'}
        hover:border-gray-500`}
      onClick={(e) => { e.stopPropagation(); onChunkClick(chunk); }}
    >
      <div className="flex max-w-full min-w-0 flex-wrap gap-1">
        {wordIndices.map((wi, localIdx) => (
          <WordSlot
            key={wi}
            word={words[wi]}
            wordIdx={wi}
            chunk={chunk}
            isActive={wi === activeWordIdx}
            globalRevealed={globalRevealed}
            wordState={wordStates[localIdx]}
            onStateChange={onWordStateChange}
            onChunkClick={onChunkClick}
            ep={ep}
            piste={piste}
            sentenceId={sentenceId}
          />
        ))}
      </div>
      {showsChunkTranslation(translationMode) && chunkTranslation && (
        <span className="max-w-full break-words text-xs text-yellow-400/80 leading-tight">{chunkTranslation}</span>
      )}
    </div>
  );
}
