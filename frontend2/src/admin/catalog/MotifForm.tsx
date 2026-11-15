import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import { adminMotifsCreate, adminMotifsPartialUpdate } from "../../api/generated/api";
import type { AdminMotifDetail, AdminCategory } from "../../api/generated/models";
import { useCatalogMutation } from "./api";
import { catalogError, formText, parsePrice } from "./forms";
import type { AdminMotifsCreateMutationBody } from "../../api/generated/api";

export function MotifForm({
  initial,
  categories,
  onSaved,
}: {
  initial?: AdminMotifDetail;
  categories: AdminCategory[];
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const save = useCatalogMutation("motifs", (data: AdminMotifsCreateMutationBody) =>
    initial ? adminMotifsPartialUpdate(initial.id, data) : adminMotifsCreate(data),
  );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    const data = new FormData(event.currentTarget);
    const price = parsePrice(formText(data, "price"));
    const position = Number(formText(data, "position"));
    if (price === null || !Number.isInteger(position) || position < 0 || position > 2147483647) {
      setError("Zadejte nezápornou cenu s nejvýše dvěma desetinnými místy a celé pořadí.");
      return;
    }
    setError("");
    try {
      const slug = formText(data, "slug").trim();
      await save.mutateAsync({
        name: formText(data, "name").trim(),
        description: formText(data, "description"),
        // Explicit on edit: this backend otherwise regenerates a missing slug on PATCH.
        ...(slug ? { slug } : {}),
        price,
        position,
        category: formText(data, "category"),
        isActive: data.get("isActive") === "on",
      });
      onSaved();
    } catch (error) {
      setError(catalogError(error));
    }
  };
  return (
    <form className="dialog-form" onSubmit={(event) => void submit(event)}>
      <TextField
        label="Název motivu"
        name="name"
        defaultValue={initial?.name ?? ""}
        required
        disabled={save.isPending}
        slotProps={{ htmlInput: { maxLength: 255 } }}
      />
      <TextField
        label="Slug URL"
        name="slug"
        defaultValue={initial?.slug ?? ""}
        required={!!initial}
        disabled={save.isPending}
        helperText="Při vytvoření lze nechat prázdné. Změna slugu změní veřejnou URL."
      />
      <TextField
        label="Popis"
        name="description"
        defaultValue={initial?.description ?? ""}
        multiline
        minRows={3}
        disabled={save.isPending}
      />
      <TextField
        label="Cena motivu (Kč)"
        name="price"
        defaultValue={initial ? String(initial.price / 100) : ""}
        required
        disabled={save.isPending}
        slotProps={{ htmlInput: { inputMode: "decimal" } }}
        helperText="Základní cena motivu, bez příplatku za typ oblečení."
      />
      <TextField
        select
        label="Kategorie"
        name="category"
        defaultValue={initial?.category.id ?? ""}
        required
        disabled={save.isPending || !categories.length}
      >
        <MenuItem value="">Vyberte kategorii</MenuItem>
        {categories.map((category) => (
          <MenuItem key={category.id} value={category.id}>
            {category.name}
            {!category.isActive && " (neaktivní)"}
          </MenuItem>
        ))}
      </TextField>
      {!categories.length && (
        <p role="alert">Nejdříve založte kategorii ve stávající správě backendu.</p>
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
            defaultChecked={initial?.isActive ?? false}
            disabled={save.isPending}
          />
        }
        label="Zobrazovat motiv v katalogu"
      />
      {!initial && <p>Nový motiv může zůstat konceptem, dokud mu nenastavíte povolené varianty.</p>}
      {error && <p role="alert">{error}</p>}
      <Button type="submit" variant="contained" disabled={save.isPending || !categories.length}>
        {save.isPending ? "Ukládání…" : "Uložit a zavřít"}
      </Button>
    </form>
  );
}
