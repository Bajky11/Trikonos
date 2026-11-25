import { TextField } from "@mui/material";
import { ApiError } from "../api/http";
import type { DeliveryLocation } from "./PacketaAddressPicker";

export function AddressFields({
  prefix,
  company = false,
  hideOptional = false,
  location,
  onLocationChange,
  recipientOptional = false,
}: {
  prefix: "billing" | "shipping";
  company?: boolean;
  hideOptional?: boolean;
  location?: DeliveryLocation;
  onLocationChange?: (location: DeliveryLocation) => void;
  recipientOptional?: boolean;
}) {
  return (
    <>
      {(!hideOptional || prefix !== "billing") && (
        <TextField
          label={
            prefix === "billing"
              ? "Jméno pro fakturaci (pokud se liší)"
              : "Jméno a příjmení příjemce"
          }
          name={`${prefix}.fullName`}
          required={prefix !== "billing" && !recipientOptional}
          helperText={recipientOptional ? "Pokud se liší od kontaktních údajů." : undefined}
          slotProps={{
            htmlInput: {
              maxLength: 255,
              autoComplete: `${prefix} name`,
            },
          }}
        />
      )}
      {!hideOptional && (
        <TextField
          label="Firma (nepovinné)"
          name={`${prefix}.companyName`}
          slotProps={{ htmlInput: { maxLength: 255, autoComplete: `${prefix} organization` } }}
        />
      )}
      {company && !hideOptional && (
        <>
          <TextField
            label="IČO (nepovinné)"
            name="billing.ico"
            helperText="8 číslic"
            slotProps={{ htmlInput: { pattern: "[0-9]{8}", maxLength: 8, inputMode: "numeric" } }}
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
        value={location?.street}
        onChange={(event) =>
          location && onLocationChange?.({ ...location, street: event.target.value })
        }
        slotProps={{ htmlInput: { maxLength: 255, autoComplete: `${prefix} street-address` } }}
      />
      <TextField
        label="Obec"
        name={`${prefix}.city`}
        required
        value={location?.city}
        onChange={(event) =>
          location && onLocationChange?.({ ...location, city: event.target.value })
        }
        slotProps={{ htmlInput: { maxLength: 255, autoComplete: `${prefix} address-level2` } }}
      />
      <TextField
        label="PSČ"
        name={`${prefix}.zip`}
        required
        value={location?.zip}
        onChange={(event) =>
          location && onLocationChange?.({ ...location, zip: event.target.value })
        }
        slotProps={{
          htmlInput: {
            pattern: "[0-9]{3} ?[0-9]{2}",
            inputMode: "numeric",
            maxLength: 6,
            autoComplete: `${prefix} postal-code`,
          },
        }}
      />
      <p>Země: Česká republika</p>
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
