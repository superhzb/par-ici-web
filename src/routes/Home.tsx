import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LanguageCode, ManifestData, Sentence } from '../lib/types';
import { LessonCard } from '../components/LessonCard';
import { usePlayerStore } from '../store/player';
import { SUPPORTED_LANGUAGES } from '../lib/translations';
import { loadManifest, loadAllPistes } from '../lib/data';
import { exportProgressFile } from '../lib/exportProgress';

export function Home() {
  const [manifest, setManifest] = useState<ManifestData | null>(null);
  const [pisteData, setPisteData] = useState<Record<string, Sentence[]>>({});
  const [exportState, setExportState] = useState<'idle' | 'preparing' | 'done' | 'error'>('idle');
  const { translationLanguage, setTranslationLanguage } = usePlayerStore();

  useEffect(() => {
    let cancelled = false;
    loadManifest()
      .then(m => { if (!cancelled) setManifest(m); })
      .catch(err => console.error('Failed to load manifest', err));

    // load all piste data for lesson-card color computation
    loadAllPistes()
      .then(loaded => {
        if (cancelled) return;
        const map: Record<string, Sentence[]> = {};
        for (const { piste, sentences } of loaded) map[`${piste.episode}_${piste.piste}`] = sentences;
        setPisteData(map);
      })
      .catch(err => console.error('Failed to load piste data', err));

    return () => { cancelled = true; };
  }, []);

  const handleExport = async () => {
    setExportState('preparing');
    try {
      await exportProgressFile();
      setExportState('done');
      window.setTimeout(() => setExportState('idle'), 1800);
    } catch (err) {
      console.error('Failed to export progress', err);
      setExportState('error');
    }
  };

  if (!manifest) {
    return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 pt-4">
        <h1 className="text-2xl font-bold">Par ici B1</h1>
        <div className="flex items-center gap-2">
          <select
            value={translationLanguage}
            onChange={(event) => setTranslationLanguage(event.target.value as LanguageCode)}
            className="h-8 rounded border border-gray-700 bg-gray-900 px-2 text-sm text-gray-100"
            title="Translation language"
            aria-label="Translation language"
          >
            {SUPPORTED_LANGUAGES.map(language => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
          <Link
            to="/practice"
            className="px-3 py-1.5 rounded-lg bg-purple-800 hover:bg-purple-700 text-sm font-medium"
          >
            Practice
          </Link>
          <button
            type="button"
            onClick={handleExport}
            disabled={exportState === 'preparing'}
            className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:cursor-wait disabled:opacity-70 text-sm font-medium border border-gray-700"
          >
            {exportState === 'preparing'
              ? 'Preparing...'
              : exportState === 'done'
                ? 'Exported'
                : exportState === 'error'
                  ? 'Export failed'
                  : 'Export'}
          </button>
        </div>
      </div>
      {manifest.episodes.map(ep => (
        <div key={ep.id} className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {ep.title ?? `Épisode ${ep.id}`}
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {ep.pistes.map(p => (
              <LessonCard
                key={`${p.episode}_${p.piste}`}
                piste={p}
                sentences={pisteData[`${p.episode}_${p.piste}`] ?? null}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
