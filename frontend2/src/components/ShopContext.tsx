import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { Snackbar } from "@mui/material";
import { cartStorageKey, loadCart, maxCartItems, validCartItem } from "../cart/storage";
import type { CartItem } from "../cart/storage";
export type { Design } from "../cart/storage";
const ShopContext = createContext<{
  count: number;
  items: CartItem[];
  setQuantity: (index: number, quantity: number) => boolean;
  remove: (index: number) => boolean;
  acceptPrice: (index: number, unitPrice: number) => boolean;
  notify: (message: string) => void;
  add: (item: CartItem) => boolean;
} | null>(null);
export function ShopProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState(loadCart);
  const [message, setMessage] = useState("");
  const save = (next: CartItem[]) => {
    if (!next.every(validCartItem)) {
      setMessage("Zkontrolujte zvolenou variantu a počet kusů.");
      return false;
    }
    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(next));
    } catch {
      setMessage(
        "Změnu košíku se nepodařilo uložit. Povolte úložiště prohlížeče nebo uvolněte místo.",
      );
      return false;
    }
    setItems(next);
    return true;
  };
  const add = (item: CartItem) => {
    if (items.length >= maxCartItems) {
      setMessage("Košík je plný. Další položku zatím nelze uložit.");
      return false;
    }
    if (!validCartItem(item)) {
      setMessage("Zkontrolujte zvolenou variantu a počet kusů.");
      return false;
    }
    const next = [...items, item];
    if (!save(next)) return false;
    setMessage(
      `${item.name} (${item.quantity} ks) přidáno do košíku. Objednání zatím není dostupné.`,
    );
    return true;
  };
  return (
    <ShopContext.Provider
      value={{
        count: items.reduce((sum, item) => sum + item.quantity, 0),
        items,
        setQuantity: (index, quantity) =>
          save(items.map((item, i) => (i === index ? { ...item, quantity } : item))),
        remove: (index) => save(items.filter((_, i) => i !== index)),
        acceptPrice: (index, unitPrice) =>
          save(
            items.map((item, i) =>
              i === index && item.kind === "catalog" ? { ...item, unitPrice } : item,
            ),
          ),
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
