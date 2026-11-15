import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminCategoriesList,
  adminColorsList,
  adminCutsList,
  adminProductTypesList,
  getAdminCategoriesListQueryKey,
  getAdminAuthMeRetrieveQueryKey,
} from "../../api/generated/api";
import { ApiError } from "../../api/http";
import { withCsrf } from "../../auth/csrf";

type Page<T> = { results: T[]; next?: string | null };

// Lookup endpoints are paginated too; never silently truncate the editor's choices.
async function allPages<T>(fetchPage: (page: number) => Promise<Page<T>>) {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const result = await fetchPage(page);
    items.push(...result.results);
    if (!result.next) return items;
    if (!result.results.length) throw new Error("Neplatné stránkování číselníku.");
  }
}

export function useAdminCategories() {
  return useQuery({
    queryKey: [...getAdminCategoriesListQueryKey(), "all"],
    queryFn: ({ signal }) =>
      allPages((page) => adminCategoriesList({ page, pageSize: 100 }, { signal })),
  });
}

export function useVariantLookups() {
  return useQuery({
    // Private namespace, also removed by the existing logout/session cleanup.
    queryKey: ["/api/v1/admin/", "variant-lookups"],
    queryFn: async ({ signal }) => {
      const [productTypes, cuts, colors] = await Promise.all([
        allPages((page) => adminProductTypesList({ page, pageSize: 100 }, { signal })),
        allPages((page) => adminCutsList({ page, pageSize: 100 }, { signal })),
        allPages((page) => adminColorsList({ page, pageSize: 100 }, { signal })),
      ]);
      return { productTypes, cuts, colors };
    },
  });
}

export const catalogMutationKey = ["admin-catalog-write"];

export function useCatalogMutation<T, R>(
  resource: "motifs" | "motif-variants",
  request: (data: T) => Promise<R>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: catalogMutationKey,
    mutationFn: (data: T) => withCsrf(() => request(data)),
    onSuccess: () => {
      const prefixes = [`/api/v1/admin/${resource}`, "/api/v1/motifs"];
      if (resource === "motifs") prefixes.push("/api/v1/categories");
      return client.invalidateQueries({
        predicate: (query) => {
          const path = query.queryKey[0];
          return (
            typeof path === "string" &&
            prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
          );
        },
      });
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        (error.status === 401 || (error.status === 403 && error.code === "AUTHENTICATION_REQUIRED"))
      ) {
        void client.invalidateQueries({ queryKey: getAdminAuthMeRetrieveQueryKey() });
      }
    },
  });
}
