import { useState } from "react";
import { Button } from "@mui/material";
import { useSnackbar } from "notistack";
import { adminGarmentMockupDestroy, adminGarmentMockupUpdate } from "../../api/generated/api";
import { ImageDropzone } from "../../components/ImageDropzone";
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
  const { enqueueSnackbar } = useSnackbar();
  const write = useCatalogMutation("garment-mockups", (file: File | null) =>
    file
      ? adminGarmentMockupUpdate(productTypeId, cutId, { file })
      : adminGarmentMockupDestroy(productTypeId, cutId),
  );
  const locked = disabled || write.isPending;
  const save = async (file: File | null) => {
    try {
      await write.mutateAsync(file);
      setFile(null);
      enqueueSnackbar(file ? "Podklad byl uložen." : "Opět se používá výchozí tričko.", {
        variant: "success",
      });
    } catch {
      // Keep the selection for retry; the mutation exposes the API error below.
    }
  };

  return (
    <section className="garment-mockup">
      <header className="garment-axis-header garment-mockup-header">
        <div className="garment-mockup-heading">
          <h4>Podklad náhledu</h4>
          <small>{url ? "Vlastní PNG" : "Výchozí tričko"}</small>
        </div>
        <div className="garment-axis-actions" data-visible={!!url}>
          <Button
            type="button"
            size="small"
            variant="text"
            color="primary"
            disabled={locked || !url}
            onClick={() => void save(null)}
          >
            Resetovat
          </Button>
        </div>
      </header>
      <div className="garment-mockup-body">
        <div className="garment-mockup-thumbnail">
          <ProductArt
            src={url ?? new URL("/assets/tshirt.png", window.location.origin).href}
            name="Podklad oblečení"
          />
        </div>
        <ImageDropzone
          label="PNG podkladu"
          format="png"
          file={file}
          onChange={setFile}
          disabled={locked}
          helperText="PNG 1131 × 1390 px, bílé oblečení zepředu na průhledném pozadí. Dodržte rozložení výchozího trička."
        />
      </div>
      <div className="garment-mockup-footer">
        {file && (
          <Button
            type="button"
            variant="contained"
            color="primary"
            fullWidth
            disabled={locked}
            onClick={() => void save(file)}
          >
            Uložit podklad
          </Button>
        )}
        {write.isError && <p role="alert">{catalogError(write.error)}</p>}
      </div>
    </section>
  );
}
