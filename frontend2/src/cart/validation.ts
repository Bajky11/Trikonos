import { SizeEnum } from "../api/generated/models";
import type { OrderItemInput } from "../api/generated/models";
import { ApiError } from "../api/http";
import type { CartItem } from "./storage";

export function catalogLines(items: CartItem[]) {
  return items.flatMap((item, index) => {
    if (item.kind !== "catalog") return [];
    const size = Object.values(SizeEnum).find((value) => value === item.size);
    const input: OrderItemInput | null = size
      ? {
          isCustom: false,
          motifId: item.motifId,
          productTypeId: item.productTypeId,
          cutId: item.cutId,
          colorId: item.colorId,
          size,
          quantity: item.quantity,
        }
      : null;
    return [{ item, index, input }];
  });
}

export function cartError(error: unknown) {
  if (!(error instanceof ApiError))
    return "Košík se nepodařilo ověřit. Zkontrolujte připojení a zkuste to znovu.";
  if (error.status === 429)
    return "Příliš mnoho kontrol košíku. Počkejte chvíli a ověřte jej znovu.";
  if (error.status === 400)
    return "Server nemohl ověřit košík. Některá položka nebo její varianta už nemusí existovat. Odeberte ji a vyberte produkt znovu v katalogu.";
  if (error.status === 403)
    return "Ověření košíku bylo odmítnuto. Zkuste kontrolu zopakovat; pokud problém trvá, obnovte stránku.";
  return "Košík se nepodařilo ověřit. Zkuste to znovu.";
}
