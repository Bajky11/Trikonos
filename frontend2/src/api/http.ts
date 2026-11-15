export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(
  /\/+$/,
  "",
);
let csrfHeaderToken: string | undefined;

export function clearCsrfToken() {
  csrfHeaderToken = undefined;
}

export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;
  readonly code?: string;

  constructor(status: number, data: unknown) {
    const envelope = data as { error?: { message?: unknown; code?: unknown } } | null;
    const message = envelope?.error?.message;
    super(typeof message === "string" ? message : `Požadavek selhal (HTTP ${status}).`);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.code = typeof envelope?.error?.code === "string" ? envelope.error.code : undefined;
  }
}

// Prefer the current cookie locally (including rotations from another tab).
// Cross-host clients use the token returned by the CSRF/login response headers.
function csrfToken() {
  const value = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("csrftoken="))
    ?.slice("csrftoken=".length);
  return value ? decodeURIComponent(value) : undefined;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes((options.method ?? "GET").toUpperCase())) {
    const token = csrfToken() ?? csrfHeaderToken;
    if (token) headers.set("X-CSRFToken", token);
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  const token = response.headers.get("X-CSRFToken");
  if (token) csrfHeaderToken = token;
  if (response.status === 204 || response.status === 205) return undefined as T;

  const isJson = (response.headers.get("Content-Type") ?? "").includes("json");
  if (!response.ok) {
    const text = await response.text();
    let data: unknown = text;
    if (isJson) {
      try {
        data = JSON.parse(text);
      } catch {
        // Keep the HTTP status and original body even if the server sent invalid JSON.
      }
    }
    throw new ApiError(response.status, data);
  }
  return (isJson ? await response.json() : await response.blob()) as T;
}

// Network failures and malformed successful responses can also throw native errors.
export type ErrorType<_Error> = Error;
