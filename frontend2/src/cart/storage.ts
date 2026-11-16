import { customColors, shirtTypes } from "../data/catalog";

export interface Design {
  src: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Snapshot only: the server must revalidate availability and price before checkout.
export interface CatalogCartItem {
  kind: "catalog";
  motifId: string;
  productTypeId: string;
  cutId: string;
  colorId: string;
  size: string;
  name: string;
  quantity: number;
  unitPrice: number; // haléře, unlike the legacy custom-print demo's price in Kč
}

interface LegacyCustomCartItem {
  kind?: never;
  id: "custom-print";
  name: string;
  quantity: number;
  size: string;
  color: string;
  type: string;
  price: number;
  design?: Design;
}

export interface CustomCartItem {
  kind: "custom";
  name: string;
  productTypeId: string;
  cutId: string;
  colorId: string;
  size: string;
  quantity: number;
  upload: {
    fileToken: string;
    url: string;
    fileName: string;
    mimeType: string;
    widthPx: number;
    heightPx: number;
    uploadedAt: number;
  };
  placement: {
    printAreaId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotationDeg: number;
  };
  areaWidthMm: number;
  areaHeightMm: number;
}

export type CartItem = CatalogCartItem | CustomCartItem | LegacyCustomCartItem;
export const cartStorageKey = "trikonos-cart-v2";
export const maxCartItems = 500;
const legacyKey = "trikonos-react-demo-cart-v1";
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function validCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (
    typeof item.name !== "string" ||
    typeof item.quantity !== "number" ||
    !Number.isInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > 99 ||
    typeof item.size !== "string" ||
    !item.size
  )
    return false;
  if (item.kind === "catalog") {
    return (
      [item.motifId, item.productTypeId, item.cutId, item.colorId].every(
        (id) => typeof id === "string" && uuid.test(id),
      ) &&
      typeof item.unitPrice === "number" &&
      Number.isSafeInteger(item.unitPrice) &&
      item.unitPrice >= 0
    );
  }
  if (item.kind === "custom") {
    const upload = item.upload as CustomCartItem["upload"] | undefined;
    const placement = item.placement as CustomCartItem["placement"] | undefined;
    const integer = (value: unknown, min: number): value is number =>
      typeof value === "number" && Number.isSafeInteger(value) && value >= min;
    return (
      [item.productTypeId, item.cutId, item.colorId, placement?.printAreaId].every(
        (id) => typeof id === "string" && uuid.test(id),
      ) &&
      !!upload &&
      typeof upload.fileToken === "string" &&
      !!upload.fileToken &&
      typeof upload.url === "string" &&
      !/^(data|blob):/i.test(upload.url) &&
      typeof upload.fileName === "string" &&
      ["image/png", "image/jpeg"].includes(upload.mimeType) &&
      integer(upload.widthPx, 1) &&
      integer(upload.heightPx, 1) &&
      integer(upload.uploadedAt, 1) &&
      !!placement &&
      integer(placement.x, 0) &&
      integer(placement.y, 0) &&
      integer(placement.width, 1) &&
      integer(placement.height, 1) &&
      placement.rotationDeg === 0 &&
      integer(item.areaWidthMm, 1) &&
      integer(item.areaHeightMm, 1) &&
      placement.x + placement.width <= item.areaWidthMm &&
      placement.y + placement.height <= item.areaHeightMm
    );
  }
  if (item.kind !== undefined) return false;
  const type = shirtTypes.find((option) => option.id === item.type);
  return (
    item.id === "custom-print" &&
    !!type?.sizes.includes(item.size) &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    item.price >= 0 &&
    customColors.some((color) => color.name === item.color)
  );
}

export function loadCart(): CartItem[] {
  try {
    // Preserve custom-print drafts, but never promote old fake catalog IDs to real items.
    const stored: unknown = JSON.parse(
      localStorage.getItem(cartStorageKey) ?? localStorage.getItem(legacyKey) ?? "[]",
    );
    return Array.isArray(stored) ? stored.filter(validCartItem).slice(0, maxCartItems) : [];
  } catch {
    return [];
  }
}
