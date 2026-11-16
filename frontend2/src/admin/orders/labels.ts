export const orderStatuses: Record<string, string> = {
  QUOTE_REQUESTED: "Čeká na nacenění",
  NEW: "Nová",
  PAID: "Zaplacená",
  PROCESSING: "Ve výrobě",
  SHIPPED: "Odeslaná",
  DELIVERED: "Doručená",
  CANCELLED: "Zrušená",
  REFUNDED: "Vrácená platba",
};
export const paymentStatuses: Record<string, string> = {
  PENDING: "Čeká na platbu",
  PAID: "Uhrazeno",
  FAILED: "Neúspěšná",
  REFUNDED: "Vráceno",
};
export const paymentMethods: Record<string, string> = {
  BANK_TRANSFER: "Převodem",
  CASH_ON_DELIVERY: "Při převzetí / dobírka",
  INVOICE: "Faktura se splatností",
};
export const deliveryTypes: Record<string, string> = {
  PERSONAL_PICKUP: "Osobní odběr",
  HOME_DELIVERY: "Na adresu",
  PICKUP_POINT: "Výdejní místo",
};
export const shipmentStatuses: Record<string, string> = {
  CREATED: "Založená",
  LABEL_PRINTED: "Vytištěný štítek",
  HANDED_OVER: "Předaná dopravci",
  IN_TRANSIT: "Na cestě",
  DELIVERED: "Doručená",
  RETURNED: "Vrácená",
};
export const dateTime = (value: string) => new Date(value).toLocaleString("cs-CZ");
