import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import { CatalogFeedback } from "../../components/Products";
import { useCatalogMutation } from "../catalog/api";
import { catalogError, formText, parsePrice } from "../catalog/forms";
import { lookupApis, useProductTypes } from "./api";
import type { LookupInput, LookupItem, LookupKind } from "./api";

export function LookupForm({
  kind,
  initial,
  onSaved,
}: {
  kind: LookupKind;
  initial?: LookupItem;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const types = useProductTypes(kind === "print-areas");
  const save = useCatalogMutation(kind, (input: LookupInput) =>
    lookupApis[kind].save(initial?.id, input),
  );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    const data = new FormData(event.currentTarget);
    const price = kind === "product-types" ? parsePrice(formText(data, "price")) : 0;
    const position = Number(formText(data, "position"));
    const widthMm = Number(formText(data, "widthMm"));
    const heightMm = Number(formText(data, "heightMm"));
    const integer = (value: number, min: number) =>
      Number.isInteger(value) && value >= min && value <= 2147483647;
    if (
      price === null ||
      !integer(position, 0) ||
      (kind === "print-areas" && (!integer(widthMm, 1) || !integer(heightMm, 1)))
    ) {
      setError(
        "Zadejte nezápornou cenu s nejvýše dvěma desetinnými místy, celé pořadí a kladné celé rozměry v mm.",
      );
      return;
    }
    setError("");
    try {
      await save.mutateAsync({
        name: formText(data, "name").trim(),
        position,
        isActive: data.get("isActive") === "on",
        slug: formText(data, "slug").trim(),
        hexValue: formText(data, "hexValue"),
        price,
        productType: formText(data, "productType"),
        widthMm,
        heightMm,
      });
      onSaved();
    } catch (error) {
      setError(catalogError(error));
    }
  };
  return (
    <form className="dialog-form" onSubmit={(event) => void submit(event)}>
      <TextField
        label="Název"
        name="name"
        defaultValue={initial?.name ?? ""}
        required
        disabled={save.isPending}
        slotProps={{ htmlInput: { maxLength: 255 } }}
      />
      {kind === "categories" && (
        <TextField
          label="Slug URL"
          name="slug"
          defaultValue={initial && "slug" in initial ? initial.slug : ""}
          required={!!initial}
          disabled={save.isPending}
          helperText="Při vytvoření lze nechat prázdné. Při úpravě zachovejte slug, pokud nechcete změnit URL kategorie."
        />
      )}
      {kind === "colors" && (
        <TextField
          label="Barva HEX"
          name="hexValue"
          defaultValue={initial && "hexValue" in initial ? initial.hexValue : "#0E584D"}
          required
          disabled={save.isPending}
          helperText="Formát #RRGGBB, například #FFFFFF."
          slotProps={{ htmlInput: { pattern: "#[0-9A-Fa-f]{6}", maxLength: 7 } }}
        />
      )}
      {kind === "product-types" && (
        <TextField
          label="Příplatek typu (Kč)"
          name="price"
          defaultValue={initial && "price" in initial ? String((initial.price ?? 0) / 100) : "0"}
          required
          disabled={save.isPending}
          helperText="Přičítá se k ceně motivu."
          slotProps={{ htmlInput: { inputMode: "decimal" } }}
        />
      )}
      {kind === "print-areas" && (
        <>
          <CatalogFeedback query={types} label="Typy oblečení" />
          <TextField
            select
            label="Typ oblečení"
            name="productType"
            defaultValue={initial && "productType" in initial ? initial.productType : ""}
            required
            disabled={save.isPending || !types.isSuccess}
          >
            <MenuItem value="">Vyberte typ</MenuItem>
            {(types.data ?? []).map((type) => (
              <MenuItem key={type.id} value={type.id}>
                {type.name}
                {!type.isActive && " (neaktivní)"}
              </MenuItem>
            ))}
          </TextField>
          {types.isSuccess && !types.data.length && (
            <p role="alert">Nejdříve založte typ oblečení.</p>
          )}
          <TextField
            label="Šířka (mm)"
            name="widthMm"
            type="number"
            defaultValue={initial && "widthMm" in initial ? initial.widthMm : ""}
            required
            disabled={save.isPending}
            slotProps={{ htmlInput: { min: 1, max: 2147483647, step: 1 } }}
          />
          <TextField
            label="Výška (mm)"
            name="heightMm"
            type="number"
            defaultValue={initial && "heightMm" in initial ? initial.heightMm : ""}
            required
            disabled={save.isPending}
            slotProps={{ htmlInput: { min: 1, max: 2147483647, step: 1 } }}
          />
        </>
      )}
      <TextField
        label="Pořadí"
        name="position"
        type="number"
        defaultValue={initial?.position ?? 0}
        required
        disabled={save.isPending}
        slotProps={{ htmlInput: { min: 0, max: 2147483647, step: 1 } }}
      />
      <FormControlLabel
        control={
          <Checkbox
            name="isActive"
            defaultChecked={initial?.isActive ?? true}
            disabled={save.isPending}
          />
        }
        label="Aktivní položka"
      />
      {kind === "categories" && (
        <p>Deaktivace skryje kategorii v nabídce, ne její motivy. Ty lze deaktivovat samostatně.</p>
      )}
      {kind === "print-areas" && (
        <p>Rozměry se ukládají na backend. Veřejný editor vlastního potisku zatím není napojený.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <Button
        type="submit"
        variant="contained"
        disabled={
          save.isPending || (kind === "print-areas" && (!types.isSuccess || !types.data.length))
        }
      >
        {save.isPending ? "Ukládání…" : "Uložit"}
      </Button>
    </form>
  );
}
