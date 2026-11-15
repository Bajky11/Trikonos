import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Query, QueryClient } from "@tanstack/react-query";
import {
  adminAuthCsrfRetrieve,
  adminAuthLoginCreate,
  adminAuthLogoutCreate,
  adminAuthMeRetrieve,
  getAdminAuthMeRetrieveQueryKey,
} from "../api/generated/api";
import type { Login, Me } from "../api/generated/models";
import { ApiError, clearCsrfToken } from "../api/http";

const sessionKey = getAdminAuthMeRetrieveQueryKey();
const isAdminQuery = (query: Query) =>
  typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/v1/admin/");
const isPrivateData = (query: Query) => isAdminQuery(query) && query.queryKey[0] !== sessionKey[0];

export async function readSession(signal?: AbortSignal): Promise<Me | null> {
  try {
    return await adminAuthMeRetrieve({ signal, cache: "no-store" });
  } catch (error) {
    // DRF session authentication returns 403, not 401, for an anonymous request.
    if (error instanceof ApiError && [401, 403].includes(error.status)) return null;
    throw error;
  }
}

async function replaceSession(client: QueryClient, user: Me | null) {
  // An in-flight /me must not restore stale user data after logout.
  await client.cancelQueries({ predicate: isAdminQuery });
  client.removeQueries({ predicate: isPrivateData });
  client.setQueryData(sessionKey, user);
}

export function useSession() {
  const client = useQueryClient();
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => readSession(signal),
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => (query.state.data ? 60_000 : false),
  });
  useEffect(() => {
    if (session.data === null) {
      void client.cancelQueries({ predicate: isPrivateData });
      client.removeQueries({ predicate: isPrivateData });
    }
  }, [client, session.data]);
  return session;
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: async (credentials: Login) => {
      await adminAuthCsrfRetrieve({ cache: "no-store" });
      return adminAuthLoginCreate(credentials);
    },
    onSuccess: (user) => replaceSession(client, user),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        // Also works after reload, when the cross-host token is not in memory yet.
        await adminAuthCsrfRetrieve({ cache: "no-store" });
        await adminAuthLogoutCreate();
      } catch (error) {
        // An expired session is already logged out. Do not hide a CSRF rejection.
        if (error instanceof ApiError && error.status === 403) {
          const data = error.data as { error?: { code?: unknown } } | null;
          if (data?.error?.code === "AUTHENTICATION_REQUIRED") return;
        }
        throw error;
      }
    },
    onSuccess: async () => {
      clearCsrfToken();
      await replaceSession(client, null);
    },
  });
}
