import { TextField } from "@mui/material";
import { ApiError } from "../api/http";

export function AddressFields({ prefix, company = false }: { prefix: string; company?: boolean }) {
  return (
    <>
      <TextField
        label={
          prefix === "billing" ? "Jméno pro fakturaci (pokud se liší)" : "Jméno a příjmení příjemce"
        }
        name={`${prefix}.fullName`}
        required={prefix !== "billing"}
        slotProps={{
          htmlInput: {
            maxLength: 255,
            autoComplete: `${prefix === "billing" ? "billing" : "shipping"} name`,
          },
        }}
      />
      <TextField
        label="Firma (nepovinné)"
        name={`${prefix}.companyName`}
        slotProps={{ htmlInput: { maxLength: 255 } }}
      />
      {company && (
        <>
          <TextField
            label="IČO (nepovinné)"
            name="billing.ico"
            slotProps={{ htmlInput: { pattern: "[0-9]{8}", maxLength: 8 } }}
          />
          <TextField
            label="DIČ (nepovinné)"
            name="billing.dic"
            slotProps={{ htmlInput: { maxLength: 20 } }}
          />
        </>
      )}
      <TextField
        label="Ulice a číslo domu"
        name={`${prefix}.street`}
        required
        slotProps={{ htmlInput: { maxLength: 255, autoComplete: `${prefix} street-address` } }}
      />
      <TextField
        label="Obec"
        name={`${prefix}.city`}
        required
        slotProps={{ htmlInput: { maxLength: 255, autoComplete: `${prefix} address-level2` } }}
      />
      <TextField
        label="PSČ"
        name={`${prefix}.zip`}
        required
        slotProps={{
          htmlInput: {
            pattern: "[0-9]{3} ?[0-9]{2}",
            maxLength: 6,
            autoComplete: `${prefix} postal-code`,
          },
        }}
      />
      <p>Země: Česká republika. Tento formulář zatím podporuje adresy v ČR.</p>
    </>
  );
}
export const text = (data: FormData, field: string) => {
  const value = data.get(field);
  return typeof value === "string" ? value.trim() : "";
};
export function address(data: FormData, prefix: string) {
  return {
    fullName: text(data, `${prefix}.fullName`),
    companyName: text(data, `${prefix}.companyName`),
    street: text(data, `${prefix}.street`),
    city: text(data, `${prefix}.city`),
    zip: text(data, `${prefix}.zip`).replace(/ /g, ""),
    country: "CZ",
  };
}
export function checkoutError(error: unknown) {
  if (!(error instanceof ApiError))
    return "Spojení se přerušilo. Objednávka mohla být přijata. Dokončete stejný pokus, nevytvářejte nový.";
  if (error.code === "PRICE_CHANGED")
    return "Cena se změnila. Znovu ověřte a zkontrolujte shrnutí před odesláním.";
  const fields = (error.data as { error?: { fields?: Record<string, unknown> } } | null)?.error
    ?.fields;
  const details = fields
    ? Object.entries(fields).flatMap(([key, value]) =>
        Array.isArray(value)
          ? value
              .filter((message): message is string => typeof message === "string")
              .map((message) => `${key}: ${message}`)
          : [],
      )
    : [];
  return [error.message, ...details].join(" ");
}
