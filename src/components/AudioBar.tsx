import type { ChangeEvent } from 'react';
import { usePlayerStore } from '../store/player';
import type { AudioEngine } from '../lib/audio';
import { TranslationModeButton } from './TranslationModeButton';

type Props = { engine: AudioEngine | null };

export function AudioBar({ engine }: Props) {
  const {
    currentTime,
    duration,
    playing,
    setPlaying,
  } = usePlayerStore();

  const toggle = () => {
    if (!engine) return;
    if (playing) { engine.pause(); setPlaying(false); }
    else {
      void engine.play()
        .then(() => setPlaying(true))
        .catch((error) => {
          setPlaying(false);
          console.error('Unable to play audio', error);
        });
    }
  };

  const seek = (e: ChangeEvent<HTMLInputElement>) => {
    if (!engine) return;
    engine.seek(Number(e.target.value));
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-full bg-gray-900 border-b border-gray-700 px-3 sm:px-4 py-3 flex flex-col gap-2">
      <div className="min-w-0 flex items-center gap-2 sm:gap-3">
        <button
          onClick={toggle}
          className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
        >
          {playing ? '⏸' : '▶'}
        </button>
        <span className="text-gray-400 text-sm w-10 flex-shrink-0">{fmt(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={seek}
          className="min-w-0 flex-1 accent-blue-500"
        />
        <span className="text-gray-400 text-sm w-10 flex-shrink-0 text-right">{fmt(duration)}</span>
        <TranslationModeButton />
      </div>
    </div>
  );
}
