import { ApiError } from "./http";

export function publicFormError(error: unknown, kind: "lookup" | "contact") {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return "Příliš mnoho pokusů. Počkejte alespoň minutu a zkuste to znovu.";
    if (kind === "lookup" && error.status === 404)
      return "Objednávku se zadaným číslem a e-mailem se nepodařilo dohledat. Zkontrolujte oba údaje.";
    if (error.status === 400) return "Zkontrolujte vyplněné údaje a zkuste to znovu.";
    if (error.status === 403) return "Požadavek nebyl povolen. Obnovte stránku a zkuste to znovu.";
    if (kind === "contact" && error.code === "CONTACT_UNAVAILABLE")
      return "Odesílání zpráv nyní není dostupné. Zkuste to později nebo použijte kontaktní e-mail obchodu.";
  }
  return kind === "lookup"
    ? "Dohledání nyní není dostupné. Zkuste to později; novou objednávku kvůli tomu nevytvářejte."
    : "Odeslání se nepodařilo potvrdit. Zpráva mohla být přijata; před opakováním chvíli vyčkejte nebo kontaktujte obchod e-mailem.";
}
