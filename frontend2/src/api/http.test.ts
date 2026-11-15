import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { apiFetch, ApiError } from "./http";
import { createQueryClient } from "./queryClient";

afterEach(() => vi.unstubAllGlobals());

describe("API transport", () => {
  it("uses the backend origin, credentials and forwards the abort signal", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ shopName: "Obchod" }));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    await expect(apiFetch("/api/v1/config", { signal })).resolves.toEqual({ shopName: "Obchod" });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/config",
      expect.objectContaining({
        credentials: "include",
        signal,
      }),
    );
  });

  it("preserves server error details and status", async () => {
    const data = {
      error: { code: "INVALID", message: "Chybná data", fields: { email: ["Invalid"] } },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data, { status: 400 })));
    await expect(apiFetch("/api/v1/config")).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "Chybná data",
      data,
    });
  });

  it("handles non-JSON errors and empty responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );
    await expect(apiFetch("/api/v1/config")).rejects.toMatchObject({
      status: 503,
      data: "Unavailable",
    });
    await expect(apiFetch("/api/v1/admin/auth/csrf")).resolves.toBeUndefined();
  });

  it.each(["", "invalid json"])(
    "keeps the HTTP status when an error contains malformed JSON: %j",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(body, {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );
      await expect(apiFetch("/api/v1/config")).rejects.toMatchObject({
        name: "ApiError",
        status: 400,
        data: body,
      });
    },
  );

  it("preserves the caller's Accept header for binary responses", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response("pdf", {
        headers: { "Content-Type": "application/pdf" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await apiFetch<Blob>("/api/v1/example", {
      headers: { Accept: "application/pdf" },
    });
    expect(await result.text()).toBe("pdf");
    expect(fetch.mock.calls[0]![1].headers.get("Accept")).toBe("application/pdf");
  });

  it("reads the current CSRF cookie for each unsafe request and preserves multipart bodies", async () => {
    const cookie = { cookie: "other=1; csrftoken=first" };
    vi.stubGlobal("document", cookie);
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetch);
    const body = new FormData();
    body.append("file", new Blob(["design"]));
    await apiFetch("/api/v1/uploads/designs", { method: "POST", body });
    expect(fetch.mock.calls[0]![1].headers.get("X-CSRFToken")).toBe("first");
    expect(fetch.mock.calls[0]![1].headers.has("Content-Type")).toBe(false);
    expect(fetch.mock.calls[0]![1].body).toBe(body);
    cookie.cookie = "csrftoken=rotated";
    await apiFetch("/api/v1/admin/auth/logout", { method: "POST" });
    expect(fetch.mock.calls[1]![1].headers.get("X-CSRFToken")).toBe("rotated");
  });

  it.each([new TypeError("Network failure"), new DOMException("Aborted", "AbortError")])(
    "does not swallow network failures or cancellation: %s",
    async (error) => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
      await expect(apiFetch("/api/v1/config")).rejects.toBe(error);
    },
  );
});

describe("query defaults", () => {
  it("does not retry client errors or mutations and bounds server retries", () => {
    const client = createQueryClient();
    const { queries, mutations } = client.getDefaultOptions();
    const retry = queries!.retry as (count: number, error: Error) => boolean;
    expect(retry(0, new ApiError(403, null))).toBe(false);
    expect(retry(0, new TypeError("Network failure"))).toBe(true);
    expect(retry(0, new ApiError(503, null))).toBe(true);
    expect(retry(1, new ApiError(503, null))).toBe(false);
    expect(mutations!.retry).toBe(false);
    client.clear();
  });
});
