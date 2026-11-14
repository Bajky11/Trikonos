import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { Snackbar } from "@mui/material";
import { customColors, products, shirtColors, shirtTypes } from "../data/catalog";

export interface Design {
  src: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface CartItem {
  id: string;
  name: string;
  quantity: number;
  size: string;
  color: string;
  type: string;
  price: number;
  design?: Design;
}
const key = "trikonos-react-demo-cart-v1";
function validItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as CartItem;
  const type = shirtTypes.find((type) => type.id === item.type);
  return (
    typeof item.name === "string" &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 1 &&
    item.quantity <= 99 &&
    Number.isFinite(item.price) &&
    item.price >= 0 &&
    !!type?.sizes.includes(item.size) &&
    (item.id === "custom-print" ? customColors : shirtColors).some(
      (color) => color.name === item.color,
    ) &&
    (item.id === "custom-print" || products.some((product) => product.id === item.id))
  );
}
function loadCart(): CartItem[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(stored) ? stored.filter(validItem).slice(0, 500) : [];
  } catch {
    return [];
  }
}
const ShopContext = createContext<{
  count: number;
  notify: (message: string) => void;
  add: (item: CartItem) => boolean;
} | null>(null);
export function ShopProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState(loadCart);
  const [message, setMessage] = useState("");
  const add = (item: CartItem) => {
    if (!validItem(item)) {
      setMessage("Zkontrolujte typ trička, barvu, velikost a počet kusů.");
      return false;
    }
    const next = [...items, item];
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      setMessage(
        "Návrh se nepodařilo uložit. Zkuste menší obrázek nebo povolte úložiště prohlížeče.",
      );
      return false;
    }
    setItems(next);
    setMessage(
      `${item.name} (${item.quantity} ks) přidáno do košíku. Objednání zatím není dostupné.`,
    );
    return true;
  };
  return (
    <ShopContext.Provider
      value={{
        count: items.reduce((sum, item) => sum + item.quantity, 0),
        notify: setMessage,
        add,
      }}
    >
      {children}
      <Snackbar
        key={message}
        open={!!message}
        message={message}
        autoHideDuration={5000}
        onClose={() => setMessage("")}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      />
    </ShopContext.Provider>
  );
}
export function useShop() {
  const shop = useContext(ShopContext);
  if (!shop) throw new Error("ShopProvider is missing");
  return shop;
}
