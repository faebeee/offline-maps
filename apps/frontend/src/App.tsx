import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteRegion,
  fetchRegions,
  fetchStatus,
  formatBuild,
  formatBytes,
  THEMES,
  type Job,
  type PlaceCandidate,
  type Region,
  type Status,
  type Theme,
} from "./api";
import { AddRegionDialog } from "./AddRegionDialog";
import { JobView } from "./JobView";
import { MapView, type Cursor } from "./MapView";
import { SetupGate } from "./SetupGate";
import { useJob } from "./useJob";

const THEME_KEY = "offline-maps:theme";
const REGION_KEY = "offline-maps:region";

export function App() {
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(() => localStorage.getItem(REGION_KEY));
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) as Theme | null) ?? "light",
  );
  const [showCoverage, setShowCoverage] = useState(true);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<PlaceCandidate | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextRegions, nextStatus] = await Promise.all([fetchRegions(), fetchStatus()]);
    setRegions(nextRegions);
    setStatus(nextStatus);
    return nextRegions;
  }, []);

  const onJobFinished = useCallback(
    (job: Job) => {
      void refresh().then((next) => {
        // Jump to whatever was just downloaded.
        if (job.type === "download" && job.state === "done" && job.region) {
          if (next.some((r) => r.name === job.region?.name)) setSelected(job.region.name);
          setAdding(false);
          setPreview(null);
        }
      });
    },
    [refresh],
  );

  const { job, track } = useJob(onJobFinished);

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, [refresh]);

  const region = useMemo(() => {
    if (!regions || regions.length === 0) return undefined;
    return regions.find((r) => r.name === selected) ?? regions[0];
  }, [regions, selected]);

  useEffect(() => {
    if (region) localStorage.setItem(REGION_KEY, region.name);
  }, [region]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme =
      theme === "dark" || theme === "black" ? "dark" : "light";
  }, [theme]);

  async function remove(name: string) {
    setPendingDelete(null);
    try {
      await deleteRegion(name);
      const next = await refresh();
      if (selected === name) setSelected(next[0]?.name ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (error) {
    return (
      <Empty title="Backend unreachable">
        <p>{error}</p>
        <p>
          Start it with <code>npm run dev</code>.
        </p>
      </Empty>
    );
  }

  if (!regions || !status) return <Empty title="Loading…" />;

  if (!status.ready) {
    return <SetupGate status={status} job={job} onJobStarted={track} />;
  }

  const dialog = adding ? (
    <AddRegionDialog
      job={job}
      onJobStarted={track}
      onJobDismissed={() => track(null)}
      onPreview={setPreview}
      onClose={() => {
        setAdding(false);
        setPreview(null);
      }}
    />
  ) : null;

  if (regions.length === 0 || !region) {
    return (
      <>
        <Empty title="No regions yet">
          <p>Download a city, state or country to start exploring offline.</p>
          <div className="modal-actions">
            <button type="button" className="primary" onClick={() => setAdding(true)}>
              Add region
            </button>
          </div>
        </Empty>
        {dialog}
      </>
    );
  }

  const running = job && job.state !== "done" && job.state !== "cancelled" && job.state !== "failed";

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="brand">
          <div className="brand-row">
            <h1>Offline Maps</h1>
            <button type="button" className="icon" onClick={() => setAdding(true)} title="Add region">
              +
            </button>
          </div>
          <p className="muted">
            {regions.length} region{regions.length === 1 ? "" : "s"} on disk
          </p>
        </header>

        <nav className="regions">
          {regions.map((r) => (
            <div key={r.name} className={r.name === region.name ? "region active" : "region"}>
              <button type="button" className="region-main" onClick={() => setSelected(r.name)}>
                <span className="region-label">{r.label}</span>
                <span className="muted small">
                  {formatBytes(r.bytes)} · z{r.minzoom}–{r.maxzoom} · {formatBuild(r.build)}
                </span>
              </button>

              {pendingDelete === r.name ? (
                <span className="confirm">
                  <button type="button" className="danger small" onClick={() => void remove(r.name)}>
                    Delete
                  </button>
                  <button type="button" className="small" onClick={() => setPendingDelete(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="icon subtle"
                  title={`Delete ${r.name}`}
                  aria-label={`Delete ${r.label}`}
                  onClick={() => setPendingDelete(r.name)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </nav>

        {running && !adding && (
          <button type="button" className="activity" onClick={() => setAdding(true)}>
            <JobView job={job} />
          </button>
        )}

        <div className="controls">
          <label className="field">
            <span className="muted small">Theme</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={showCoverage}
              onChange={(e) => setShowCoverage(e.target.checked)}
            />
            <span className="small">Show coverage edge</span>
          </label>

          <a className="small link" href={`/pmtiles/${region.name}.pmtiles`} download>
            Download {region.name}.pmtiles
          </a>
        </div>
      </aside>

      <main className="viewport">
        <MapView
          region={region}
          theme={theme}
          showCoverage={showCoverage}
          preview={preview?.preview}
          onCursor={setCursor}
        />
        <footer className="status">
          <span>{preview ? preview.label : region.label}</span>
          {cursor && (
            <>
              <span className="muted">z{cursor.zoom.toFixed(1)}</span>
              <span className="muted">
                {cursor.lat.toFixed(5)}, {cursor.lon.toFixed(5)}
              </span>
            </>
          )}
        </footer>
      </main>

      {dialog}
    </div>
  );
}

function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-card">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}
