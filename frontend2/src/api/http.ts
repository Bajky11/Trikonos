const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(status: number, data: unknown) {
    const envelope = data as { error?: { message?: unknown } } | null;
    const message = envelope?.error?.message;
    super(typeof message === "string" ? message : `Požadavek selhal (HTTP ${status}).`);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

// Works for local same-host/different-port development. Cross-host admin auth
// needs a separate CSRF token bootstrap; never widen the session cookie domain.
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
    const token = csrfToken();
    if (token) headers.set("X-CSRFToken", token);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
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
