import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Sentence, Chunk, PisteInfo } from '../lib/types';
import { AudioEngine } from '../lib/audio';
import { loadManifest, loadPisteData } from '../lib/data';
import { AudioBar } from '../components/AudioBar';
import { SentenceRow } from '../components/SentenceRow';
import { usePlayerStore } from '../store/player';
import { findActiveSentence } from '../lib/timing';
import { useProgressStore, sentenceKey } from '../store/progress';

export function Player() {
  const { ep, piste } = useParams<{ ep: string; piste: string }>();
  const epNum = Number(ep);
  const pisteNum = Number(piste);

  const [pisteInfo, setPisteInfo] = useState<PisteInfo | null>(null);
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [activeSentenceIdx, setActiveSentenceIdx] = useState(0);
  const [engine, setEngine] = useState<AudioEngine | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);

  const { setCurrentTime, setDuration, setPlaying, translationMode, translationLanguage } = usePlayerStore();
  const progressData = useProgressStore(s => s.data);
  const totalSentences = sentences.length;
  const processedSentences = sentences.filter(sentence => {
    const progress = progressData[sentenceKey(epNum, pisteNum, sentence.id)];
    return progress && (progress.status !== 'none' || progress.revealed);
  }).length;
  const progressPercent = totalSentences > 0 ? Math.round((processedSentences / totalSentences) * 100) : 0;

  useEffect(() => {
    let cancelled = false;
    loadManifest()
      .then(async (m) => {
        const ep_ = m.episodes.find(e => e.id === epNum);
        const p = ep_?.pistes.find(p => p.piste === pisteNum);
        if (!p) return;
        const { sentences } = await loadPisteData(p.data);
        if (cancelled) return;
        setEpisodeTitle(ep_?.title ?? `Épisode ${epNum}`);
        setPisteInfo(p);
        setSentences(sentences);
        const engine = new AudioEngine(p.audio, (t) => {
          setCurrentTime(t);
          setActiveSentenceIdx(findActiveSentence(sentences, t));
        });
        engine.onLoadedMetadata(() => setDuration(engine.duration));
        engine.onEnded(() => setPlaying(false));
        engine.onRangePaused(() => setPlaying(false));
        engineRef.current = engine;
        setEngine(engine);
      })
      .catch(err => console.error('Failed to load piste', err));

    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
      setEngine(null);
      setEpisodeTitle('');
      setCurrentTime(0);
      setDuration(0);
      setPlaying(false);
    };
  }, [epNum, pisteNum, setCurrentTime, setDuration, setPlaying]);

  const handleChunkClick = (chunk: Chunk) => {
    if (!engineRef.current) return;
    void engineRef.current.playRange(chunk.start, chunk.end)
      .then(() => setPlaying(true))
      .catch((error) => {
        setPlaying(false);
        console.error('Unable to play audio', error);
      });
  };

  const handleSentenceClick = (start: number, end: number) => {
    if (!engineRef.current) return;
    void engineRef.current.playRange(start, end)
      .then(() => setPlaying(true))
      .catch((error) => {
        setPlaying(false);
        console.error('Unable to play audio', error);
      });
  };

  if (!pisteInfo) {
    return <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden bg-gray-950 text-white flex flex-col">
      <div className="sticky top-0 z-10 max-w-full bg-gray-900">
        <div className="min-w-0 border-b border-gray-800 px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3">
          <Link
            to="/"
            className="shrink-0 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm font-medium border border-gray-600 transition-colors"
          >
            ← Home
          </Link>
          <span className="shrink-0 text-gray-500">|</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{episodeTitle} — {pisteInfo.title}</span>
          <span className="shrink-0 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs font-semibold text-gray-200">
            {progressPercent}%
          </span>
        </div>
        <AudioBar engine={engine} />
      </div>
      <div className="flex-1 overflow-x-hidden overflow-y-auto p-3">
        {sentences.map((s, i) => (
          <SentenceRow
            key={s.id}
            sentence={s}
            isActive={i === activeSentenceIdx}
            ep={epNum}
            piste={pisteNum}
            onChunkClick={handleChunkClick}
            onSentenceClick={handleSentenceClick}
            translationMode={translationMode}
            translationLanguage={translationLanguage}
          />
        ))}
      </div>
    </div>
  );
}
