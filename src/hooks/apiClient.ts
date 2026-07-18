/**
 * This file is the shared browser-side fetch wrapper for React Query hooks.
 * What calls it: the hooks in src/hooks/**.
 * What it calls: window.fetch.
 * One thing a junior engineer would likely get wrong when writing something similar: ignore non-2xx responses so mutations fail silently and the UI goes stale in confusing ways.
 */
export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: {
          message?: string;
        };
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Request failed.");
  }

  return payload as T;
}
