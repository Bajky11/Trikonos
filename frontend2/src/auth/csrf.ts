import { adminAuthCsrfRetrieve } from "../api/generated/api";

// Refresh before writes, including after reload on a different API hostname.
export async function withCsrf<T>(request: () => Promise<T>): Promise<T> {
  await adminAuthCsrfRetrieve({ cache: "no-store" });
  return request();
}
