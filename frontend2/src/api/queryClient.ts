import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./http";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        retry: (failureCount, error) =>
          failureCount < 1 && !(error instanceof ApiError && error.status < 500),
      },
      // Retrying a write requires an explicit, operation-specific decision.
      mutations: { retry: false },
    },
  });
}
