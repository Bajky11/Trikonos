import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { readSession } from "./session";

afterEach(() => vi.unstubAllGlobals());

describe("session lookup", () => {
  it.each([401, 403])("treats HTTP %i as an anonymous session", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { code: "AUTHENTICATION_REQUIRED" } }, { status }),
        ),
    );
    await expect(readSession()).resolves.toBeNull();
  });

  it("returns the profile without caching the HTTP response", async () => {
    const user = { id: "user-id", name: "Admin", email: "admin@example.com" };
    const fetch = vi.fn().mockResolvedValue(Response.json(user));
    vi.stubGlobal("fetch", fetch);
    await expect(readSession()).resolves.toEqual(user);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/admin/auth/me",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("does not turn a server failure into a logged-out session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 503 })));
    await expect(readSession()).rejects.toMatchObject({ status: 503 });
  });
});
