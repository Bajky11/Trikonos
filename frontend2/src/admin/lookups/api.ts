import {
  adminCategoriesList,
  adminCategoriesCreate,
  adminCategoriesPartialUpdate,
  adminCategoriesDestroy,
  adminColorsList,
  adminColorsCreate,
  adminColorsPartialUpdate,
  adminColorsDestroy,
  adminCutsList,
  adminCutsCreate,
  adminCutsPartialUpdate,
  adminCutsDestroy,
  adminProductTypesList,
  adminProductTypesCreate,
  adminProductTypesPartialUpdate,
  adminProductTypesDestroy,
  adminPrintAreasList,
  adminPrintAreasCreate,
  adminPrintAreasPartialUpdate,
  adminPrintAreasDestroy,
} from "../../api/generated/api";
import type {
  AdminCategory,
  AdminColor,
  AdminCut,
  AdminProductType,
  AdminPrintArea,
} from "../../api/generated/models";
import { useQuery } from "@tanstack/react-query";
import { allPages } from "../catalog/api";

export function useProductTypes(enabled: boolean) {
  return useQuery({
    queryKey: ["/api/v1/admin/product-types", "all"],
    queryFn: ({ signal }) =>
      allPages((page) => adminProductTypesList({ page, pageSize: 100 }, { signal })),
    enabled,
  });
}

export const lookupTitles = {
  colors: "Barvy",
  cuts: "Střihy",
  "product-types": "Typy oblečení",
  categories: "Kategorie",
  "print-areas": "Tiskové plochy",
};
export type LookupKind = keyof typeof lookupTitles;
export type LookupItem = AdminCategory | AdminColor | AdminCut | AdminProductType | AdminPrintArea;
export type LookupInput = {
  name: string;
  position: number;
  isActive: boolean;
  slug: string;
  hexValue: string;
  price: number;
  productType: string;
  widthMm: number;
  heightMm: number;
};
export type LookupParams = {
  page: number;
  pageSize: number;
  q?: string;
  isActive?: boolean;
  productType?: string;
};
type LookupApi = {
  list: (
    params: LookupParams,
    options?: RequestInit,
  ) => Promise<{ count: number; results: LookupItem[] }>;
  save: (id: string | undefined, input: LookupInput) => Promise<LookupItem>;
  remove: (id: string) => Promise<void>;
};
const common = ({ name, position, isActive }: LookupInput) => ({ name, position, isActive });

// Keep requests in generated clients; this adapter only selects the fields of each form.
export const lookupApis: Record<LookupKind, LookupApi> = {
  categories: {
    list: adminCategoriesList,
    remove: adminCategoriesDestroy,
    save: (id, input) => {
      const body = { ...common(input), ...(input.slug ? { slug: input.slug } : {}) };
      return id ? adminCategoriesPartialUpdate(id, body) : adminCategoriesCreate(body);
    },
  },
  colors: {
    list: adminColorsList,
    remove: adminColorsDestroy,
    save: (id, input) => {
      const body = { ...common(input), hexValue: input.hexValue };
      return id ? adminColorsPartialUpdate(id, body) : adminColorsCreate(body);
    },
  },
  cuts: {
    list: adminCutsList,
    remove: adminCutsDestroy,
    save: (id, input) =>
      id ? adminCutsPartialUpdate(id, common(input)) : adminCutsCreate(common(input)),
  },
  "product-types": {
    list: adminProductTypesList,
    remove: adminProductTypesDestroy,
    save: (id, input) => {
      const body = { ...common(input), price: input.price };
      return id ? adminProductTypesPartialUpdate(id, body) : adminProductTypesCreate(body);
    },
  },
  "print-areas": {
    list: adminPrintAreasList,
    remove: adminPrintAreasDestroy,
    save: (id, input) => {
      const body = {
        ...common(input),
        productType: input.productType,
        widthMm: input.widthMm,
        heightMm: input.heightMm,
      };
      return id ? adminPrintAreasPartialUpdate(id, body) : adminPrintAreasCreate(body);
    },
  },
};

export function deleteWarning(kind: LookupKind) {
  if (kind === "product-types")
    return "Smazáním typu se odstraní také jeho povolené kombinace a tiskové plochy, pokud tomu nebrání vazby na objednávky. Bezpečnější je deaktivace.";
  if (kind === "colors")
    return "Smazáním barvy se odstraní i její povolené kombinace, pokud tomu nebrání vazby na objednávky. Fotografie přiřazené k této barvě předem přiřaďte jiné barvě nebo všem barvám. Bezpečnější je deaktivace.";
  if (kind === "cuts")
    return "Smazáním střihu se odstraní i jeho povolené kombinace, pokud tomu nebrání vazby na objednávky. Bezpečnější je deaktivace.";
  return "Položku použitou v motivu nebo objednávce může backend odmítnout smazat. V takovém případě ji deaktivujte.";
}
