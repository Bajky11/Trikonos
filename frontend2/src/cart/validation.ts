import { SizeEnum } from "../api/generated/models";
import type { OrderItemInput } from "../api/generated/models";
import { ApiError } from "../api/http";
import type { CartItem } from "./storage";

export function catalogLines(items: CartItem[]) {
  return validationLines(items).filter((line) => line.item.kind === "catalog");
}

export function validationLines(items: CartItem[]) {
  return items.flatMap((item, index) => {
    if (item.kind !== "catalog" && item.kind !== "custom") return [];
    const size = Object.values(SizeEnum).find((value) => value === item.size);
    const expired = item.kind === "custom" && Date.now() - item.upload.uploadedAt >= 7 * 86400000;
    const input: OrderItemInput | null =
      size && !expired
        ? {
            isCustom: item.kind === "custom",
            ...(item.kind === "catalog"
              ? { motifId: item.motifId }
              : { placements: [{ ...item.placement, fileToken: item.upload.fileToken }] }),
            productTypeId: item.productTypeId,
            cutId: item.cutId,
            colorId: item.colorId,
            size,
            quantity: item.quantity,
          }
        : null;
    return [
      {
        item,
        index,
        input,
        localError: expired
          ? "Platnost podkladu vypršela. Nahrajte jej znovu v editoru a nahraďte tuto položku."
          : !size
            ? "Tato velikost už není podporovaná. Vyberte variantu znovu."
            : "",
      },
    ];
  });
}

export function cartError(error: unknown) {
  if (!(error instanceof ApiError))
    return "Košík se nepodařilo ověřit. Zkontrolujte připojení a zkuste to znovu.";
  if (error.code === "INVALID_FILE_TOKEN")
    return "Podklad vlastního potisku je neplatný nebo vypršel. Nahrajte jej znovu v editoru a nahraďte původní položku. Košík zatím není ověřený.";
  if (error.status === 429)
    return "Příliš mnoho kontrol košíku. Počkejte chvíli a ověřte jej znovu.";
  if (error.status === 400)
    return "Server nemohl ověřit košík. Některá položka nebo její varianta už nemusí existovat. Odeberte neplatnou položku a vyberte ji znovu v katalogu nebo editoru.";
  if (error.status === 403)
    return "Ověření košíku bylo odmítnuto. Zkuste kontrolu zopakovat; pokud problém trvá, obnovte stránku.";
  return "Košík se nepodařilo ověřit. Zkuste to znovu.";
}
