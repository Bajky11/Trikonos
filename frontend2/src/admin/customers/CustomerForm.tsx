import { useState } from "react";
import { Button, Checkbox, FormControlLabel, TextField } from "@mui/material";
import type { AdminCustomerDetail, PatchedAdminCustomerUpdate } from "../../api/generated/models";
import { formText } from "../catalog/forms";

const fields: {
  key: "email" | "phone" | "firstName" | "lastName" | "companyName" | "note";
  label: string;
  maxLength?: number;
}[] = [
  { key: "email", label: "E-mail zákazníka", maxLength: 254 },
  { key: "phone", label: "Telefon", maxLength: 30 },
  { key: "firstName", label: "Jméno", maxLength: 255 },
  { key: "lastName", label: "Příjmení", maxLength: 255 },
  { key: "companyName", label: "Firma", maxLength: 255 },
  { key: "note", label: "Interní poznámka" },
];

export function CustomerForm({
  customer,
  disabled,
  save,
}: {
  customer: AdminCustomerDetail;
  disabled: boolean;
  save: (body: PatchedAdminCustomerUpdate) => void;
}) {
  const [consent, setConsent] = useState(customer.marketingConsent ?? false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        const data = new FormData(event.currentTarget);
        const body: PatchedAdminCustomerUpdate = {};
        for (const { key } of fields) {
          let value = formText(data, key).trim();
          if (key === "email") value = value.toLocaleLowerCase("en");
          if (value !== (customer[key] ?? "")) body[key] = value;
        }
        if (consent !== (customer.marketingConsent ?? false)) body.marketingConsent = consent;
        if (!Object.keys(body).length) return;
        const warnings = [
          body.email !== undefined
            ? `Změnit e-mail na ${body.email}? Nové objednávkové e-maily půjdou na nový kontakt i u existujících objednávek.`
            : "",
          body.marketingConsent !== undefined
            ? `Změnit evidenci marketingového souhlasu na ${consent ? "ANO" : "NE"}? Ověřte skutečné oprávnění; API neukládá datum, verzi ani doklad souhlasu.`
            : "",
        ].filter(Boolean);
        if (warnings.length && !window.confirm(warnings.join("\n\n"))) return;
        save(body);
      }}
    >
      <fieldset className="checkout-fields" disabled={disabled}>
        <legend>Kontakt, poznámka a souhlas</legend>
        {fields.map(({ key, label, maxLength }) => (
          <TextField
            key={key}
            label={label}
            name={key}
            defaultValue={customer[key] ?? ""}
            required={key === "email"}
            type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
            multiline={key === "note"}
            minRows={key === "note" ? 3 : undefined}
            slotProps={{ htmlInput: { maxLength } }}
          />
        ))}
        <FormControlLabel
          label="Marketingový souhlas (aktuální evidence)"
          control={
            <Checkbox checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          }
        />
        <p>
          Změna kontaktu ovlivní také kontaktní údaje a příjemce e-mailů existujících objednávek.
          Nemění uložené fakturační/doručovací adresy ani snapshoty položek.
        </p>
        <Button type="submit" variant="contained">
          Uložit zákazníka
        </Button>
      </fieldset>
    </form>
  );
}
