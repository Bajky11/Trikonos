import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminCategoriesList,
  adminColorsList,
  adminCutsList,
  adminProductTypesList,
  catalogOptionsRetrieve,
  getAdminCategoriesListQueryKey,
  getAdminAuthMeRetrieveQueryKey,
} from "../../api/generated/api";
import { ApiError } from "../../api/http";
import { withCsrf } from "../../auth/csrf";

type Page<T> = { results: T[]; next?: string | null };

// Lookup endpoints are paginated too; never silently truncate the editor's choices.
export async function allPages<T>(fetchPage: (page: number) => Promise<Page<T>>) {
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
      const [productTypes, cuts, colors, options] = await Promise.all([
        allPages((page) => adminProductTypesList({ page, pageSize: 100 }, { signal })),
        allPages((page) => adminCutsList({ page, pageSize: 100 }, { signal })),
        allPages((page) => adminColorsList({ page, pageSize: 100 }, { signal })),
        catalogOptionsRetrieve({ signal }),
      ]);
      return {
        productTypes,
        cuts,
        colors,
        sizes: options.sizes,
        mockups: options.garmentMockups ?? [],
      };
    },
  });
}

export function useAdminColors() {
  return useQuery({
    queryKey: ["/api/v1/admin/colors", "all"],
    queryFn: ({ signal }) =>
      allPages((page) => adminColorsList({ page, pageSize: 100 }, { signal })),
  });
}

export const catalogMutationKey = ["admin-catalog-write"];

export function useCatalogMutation<T, R>(
  resource:
    | "motifs"
    | "garment-offer"
    | "garment-mockups"
    | "categories"
    | "colors"
    | "cuts"
    | "product-types"
    | "print-areas",
  request: (data: T) => Promise<R>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: catalogMutationKey,
    // Upload variables can contain large Files; do not retain completed writes.
    gcTime: 0,
    mutationFn: (data: T) => withCsrf(() => request(data)),
    onSuccess: () => {
      const prefixes = [`/api/v1/admin/${resource}`, "/api/v1/motifs"];
      if (resource === "motifs") prefixes.push("/api/v1/categories");
      const lookup = resource !== "motifs";
      if (lookup)
        prefixes.push(
          "/api/v1/categories",
          "/api/v1/catalog/options",
          ...[
            "categories",
            "colors",
            "cuts",
            "product-types",
            "print-areas",
            "motifs",
            "garment-offer",
          ].map((name) => `/api/v1/admin/${name}`),
        );
      return client.invalidateQueries({
        predicate: (query) => {
          const path = query.queryKey[0];
          return (
            typeof path === "string" &&
            (prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ||
              (lookup && path === "/api/v1/admin/" && query.queryKey[1] === "variant-lookups"))
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
