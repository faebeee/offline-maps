import type {
  CreateDownloadRequest,
  Job,
  JobsResponse,
  PlaceCandidate,
  PlacesResponse,
  Region,
  RegionsResponse,
  Status,
  Theme,
} from "@offline-maps/shared";

export type { Bbox, Job, PlaceCandidate, Polygon, Region, Status, Theme } from "@offline-maps/shared";
export { DEFAULT_MAXZOOM, isJobFinished, isTheme, MAX_ZOOM, THEMES } from "@offline-maps/shared";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatBuild(build: string): string {
  if (!/^\d{8}$/.test(build)) return build;
  return `${build.slice(0, 4)}-${build.slice(4, 6)}-${build.slice(6, 8)}`;
}

/** Unwraps the backend's error shape so the UI can show the real reason. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });

  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch {
      // non-JSON error body; keep the status line
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ------------------------------------------------------------ regions ---

export async function fetchRegions(): Promise<Region[]> {
  const data = await request<RegionsResponse>("/api/regions");
  return data.regions;
}

export function deleteRegion(name: string): Promise<void> {
  return request<void>(`/api/regions/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export function styleUrl(region: Region, theme: Theme): string {
  return `/api/styles/${region.name}.json?theme=${theme}`;
}

// ------------------------------------------------------------- status ---

export function fetchStatus(): Promise<Status> {
  return request<Status>("/api/status");
}

export function startSetup(): Promise<Job> {
  return request<Job>("/api/setup", { method: "POST" });
}

// ------------------------------------------------------------- places ---

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceCandidate[]> {
  const data = await request<PlacesResponse>(
    `/api/places?q=${encodeURIComponent(query)}`,
    { signal },
  );
  return data.places;
}

// --------------------------------------------------------------- jobs ---

export function startDownload(body: CreateDownloadRequest): Promise<Job> {
  return request<Job>("/api/downloads", { method: "POST", body: JSON.stringify(body) });
}

export function confirmDownload(id: string): Promise<Job> {
  return request<Job>(`/api/downloads/${id}/confirm`, { method: "POST" });
}

export function cancelJob(id: string): Promise<Job> {
  return request<Job>(`/api/jobs/${id}`, { method: "DELETE" });
}

export async function fetchJobs(): Promise<Job[]> {
  const data = await request<JobsResponse>("/api/jobs");
  return data.jobs;
}

/**
 * Server-sent job updates. The stream replays the current state on connect, so
 * a reloaded page picks a running download straight back up.
 */
export function subscribeToJob(id: string, onJob: (job: Job) => void): () => void {
  const source = new EventSource(`/api/jobs/${id}/events`);
  source.onmessage = (event) => onJob(JSON.parse(event.data) as Job);
  // The server completes the stream when the job settles; EventSource reads
  // that as an error and would otherwise reconnect forever.
  source.onerror = () => source.close();
  return () => source.close();
}
