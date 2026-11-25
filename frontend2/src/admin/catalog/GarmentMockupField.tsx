import { useState } from "react";
import { Button, TextField } from "@mui/material";
import { adminGarmentMockupDestroy, adminGarmentMockupUpdate } from "../../api/generated/api";
import { ProductArt } from "../../components/Products";
import { useCatalogMutation } from "./api";
import { catalogError } from "./forms";

export function GarmentMockupField({
  productTypeId,
  cutId,
  url,
  disabled,
}: {
  productTypeId: string;
  cutId: string;
  url?: string;
  disabled: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState("");
  const write = useCatalogMutation("garment-mockups", (file: File | null) =>
    file
      ? adminGarmentMockupUpdate(productTypeId, cutId, { file })
      : adminGarmentMockupDestroy(productTypeId, cutId),
  );
  const locked = disabled || write.isPending;
  const save = async (file: File | null) => {
    setStatus("");
    try {
      await write.mutateAsync(file);
      setFile(null);
      setVersion((value) => value + 1);
      setStatus(file ? "Podklad byl uložen." : "Opět se používá výchozí tričko.");
    } catch {
      // Keep the selection for retry; the mutation exposes the API error below.
    }
  };

  return (
    <details className="motif-editor-details">
      <summary>Podklad náhledu · {url ? "vlastní PNG" : "výchozí tričko"}</summary>
      <div className="admin-garment-preview">
        <ProductArt
          src={url ?? new URL("/assets/tshirt.png", window.location.origin).href}
          name="Podklad oblečení"
        />
      </div>
      <TextField
        key={version}
        type="file"
        label="PNG podkladu"
        disabled={locked}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { accept: "image/png" } }}
        onChange={(event) => setFile((event.target as HTMLInputElement).files?.[0] ?? null)}
        helperText="Nahraj bílé oblečení zepředu s průhledným pozadím. Pro správnou polohu motivu použij stejné rozložení jako u výchozího trička (1131 × 1390 px)."
      />
      <div>
        <Button type="button" disabled={locked || !file} onClick={() => file && void save(file)}>
          Uložit podklad
        </Button>
        {url && (
          <Button type="button" disabled={locked} onClick={() => void save(null)}>
            Použít výchozí tričko
          </Button>
        )}
      </div>
      {write.isError && <p role="alert">{catalogError(write.error)}</p>}
      {status && <p role="status">{status}</p>}
    </details>
  );
}
