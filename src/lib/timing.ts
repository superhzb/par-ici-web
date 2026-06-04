import type { Sentence, Chunk, Word } from './types';

export const RANGE_PRE_ROLL_SECONDS = 0.3;

export function findActiveSentence(sentences: Sentence[], t: number): number {
  if (sentences.length === 0 || t <= sentences[0].start) return 0;

  for (let i = 0; i < sentences.length; i++) {
    if (t >= sentences[i].start && t <= sentences[i].end) return i;
    if (i > 0 && t > sentences[i - 1].end && t < sentences[i].start) {
      return sentences[i].start - t <= RANGE_PRE_ROLL_SECONDS ? i : i - 1;
    }
  }
  return sentences.length - 1;
}

// Index of the range containing t — [start, end), with the last range inclusive
// of its end so the final tick still resolves. Returns -1 if none match.
function findRangeIndex(ranges: ReadonlyArray<{ start: number; end: number }>, t: number): number {
  for (let i = 0; i < ranges.length; i++) {
    const isLast = i === ranges.length - 1;
    if (t >= ranges[i].start && (t < ranges[i].end || (isLast && t <= ranges[i].end))) return i;
  }
  return -1;
}

export function findActiveWord(words: Word[], t: number): number {
  return findRangeIndex(words, t);
}

export function findActiveChunk(chunks: Chunk[], t: number): number {
  return findRangeIndex(chunks, t);
}

export function findChunkForWord(chunks: Chunk[], wordStart: number): Chunk | null {
  const i = findRangeIndex(chunks, wordStart);
  return i === -1 ? null : chunks[i];
}

export function normalizeWord(text: string): string {
  return text.toLowerCase().replace(/[^a-zàâäéèêëîïôùûüÿœæç']/gi, '');
}
