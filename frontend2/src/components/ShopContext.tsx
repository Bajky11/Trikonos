import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { Snackbar } from "@mui/material";
import { cartStorageKey, loadCart, maxCartItems, validCartItem } from "../cart/storage";
import type { CartItem } from "../cart/storage";
export type { Design } from "../cart/storage";
const ShopContext = createContext<{
  count: number;
  notify: (message: string) => void;
  add: (item: CartItem) => boolean;
} | null>(null);
export function ShopProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState(loadCart);
  const [message, setMessage] = useState("");
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
    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(next));
    } catch {
      setMessage("Položku se nepodařilo uložit. Povolte úložiště prohlížeče nebo uvolněte místo.");
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
