import { useState } from "react";
import type { FormEvent } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import {
  adminMotifsImagesCreate,
  adminMotifsImagesDestroy,
  adminMotifsImagesPartialUpdate,
  adminMotifsImagesReorderCreate,
  useAdminMotifsRetrieve,
} from "../../api/generated/api";
import type {
  AdminColor,
  AdminMotifImage,
  PatchedMotifImagePatch,
} from "../../api/generated/models";
import { CatalogFeedback, ProductArt } from "../../components/Products";
import { useCatalogMutation, useVariantLookups } from "./api";
import { garmentKey, garmentName, groupGarments } from "./OfferBlocks";
import { useAdminGarmentOfferRetrieve } from "../../api/generated/api";

type GarmentChoice = { value: string; label: string };
function photoGarment(data: FormData) {
  const [productTypeId, cutId] = formText(data, "garment").split(":");
  return { productTypeId: productTypeId || null, cutId: cutId || null };
}
import { catalogError, formText } from "./forms";

function ImageFields({
  image,
  colors,
  garments,
  disabled,
}: {
  image?: AdminMotifImage;
  colors: AdminColor[];
  garments: GarmentChoice[];
  disabled: boolean;
}) {
  return (
    <>
      <TextField
        name="altText"
        label="Alternativní text"
        helperText="Stručný popis pro čtečky obrazovky. Nezobrazuje se jako titulek."
        defaultValue={image?.altText ?? ""}
        disabled={disabled}
      />
      <TextField
        name="colorId"
        label="Zobrazovat při výběru barvy"
        select
        defaultValue={image?.colorId ?? ""}
        disabled={disabled}
        helperText="Výběr barvy fotografii nepřebarví."
      >
        <MenuItem value="">Bez přiřazené barvy</MenuItem>
        {colors.map((color) => (
          <MenuItem key={color.id} value={color.id}>
            {color.name}
            {!color.isActive && " (neaktivní)"}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        name="garment"
        select
        label="Typ a střih"
        disabled={disabled}
        defaultValue={
          image?.productTypeId && image.cutId
            ? garmentKey({ productTypeId: image.productTypeId, cutId: image.cutId })
            : ""
        }
      >
        <MenuItem value="">Bez přiřazeného oblečení</MenuItem>
        {garments.map(({ value, label }) => (
          <MenuItem key={value} value={value}>
            {label}
          </MenuItem>
        ))}
      </TextField>
    </>
  );
}

type Action =
  | {
      kind: "upload";
      file: File;
      altText: string;
      colorId?: string;
      productTypeId?: string;
      cutId?: string;
    }
  | { kind: "edit"; id: string; data: PatchedMotifImagePatch }
  | { kind: "delete"; id: string }
  | { kind: "reorder"; ids: string[] };

export function ImagesPanel({ motifId, busy }: { motifId: string; busy: boolean }) {
  const detail = useAdminMotifsRetrieve(motifId, { query: { refetchOnWindowFocus: false } });
  const lookups = useVariantLookups();
  const offer = useAdminGarmentOfferRetrieve();
  const garments = new Map<string, GarmentChoice>();
  if (lookups.data) {
    const dictionaries = lookups.data;
    const pairs = [
      ...groupGarments(offer.data?.variants ?? []).flatMap((rows) => rows.slice(0, 1)),
      ...(detail.data?.images ?? []).flatMap((image) =>
        image.productTypeId && image.cutId
          ? [{ productTypeId: image.productTypeId, cutId: image.cutId }]
          : [],
      ),
    ];
    for (const pair of pairs) {
      const value = garmentKey(pair);
      garments.set(value, { value, label: garmentName(pair, dictionaries) });
    }
  }
  const garmentChoices = [...garments.values()];
  const [editing, setEditing] = useState<AdminMotifImage | null>(null);
  const [deleting, setDeleting] = useState<AdminMotifImage | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadVersion, setUploadVersion] = useState(0);
  const write = useCatalogMutation("motifs", async (action: Action) => {
    switch (action.kind) {
      case "upload":
        await adminMotifsImagesCreate(motifId, {
          file: action.file,
          altText: action.altText,
          colorId: action.colorId,
          productTypeId: action.productTypeId,
          cutId: action.cutId,
        });
        break;
      case "edit":
        await adminMotifsImagesPartialUpdate(motifId, action.id, action.data);
        break;
      case "delete":
        await adminMotifsImagesDestroy(motifId, action.id);
        break;
      case "reorder":
        await adminMotifsImagesReorderCreate(motifId, { ids: action.ids });
        break;
    }
  });
  const disabled = busy || write.isPending;
  const run = async (action: Action, success: string) => {
    if (disabled) return false;
    setError("");
    setMessage("");
    try {
      await write.mutateAsync(action);
      setMessage(success);
      return true;
    } catch (error) {
      setError(catalogError(error));
      return false;
    }
  };
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("Vyberte fotografii.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Fotografie může mít nejvýše 10 MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Vyberte fotografii ve formátu JPG, PNG nebo WEBP.");
      return;
    }
    const colorId = formText(data, "colorId");
    const { productTypeId, cutId } = photoGarment(data);
    if (
      await run(
        {
          kind: "upload",
          file,
          altText: formText(data, "altText"),
          ...(colorId ? { colorId } : {}),
          ...(productTypeId && cutId ? { productTypeId, cutId } : {}),
        },
        "Fotografie byla nahrána.",
      )
    )
      setUploadVersion((version) => version + 1);
  };
  const images = detail.data?.images ?? [];
  const move = (index: number, offset: number) => {
    const ids = images.map((image) => image.id);
    const other = index + offset;
    [ids[index], ids[other]] = [ids[other]!, ids[index]!];
    void run({ kind: "reorder", ids }, "Pořadí fotografií bylo uloženo.");
  };
  return (
    <>
      <CatalogFeedback query={detail} label="Fotografie" />
      <CatalogFeedback query={lookups} label="Číselníky" />
      <CatalogFeedback query={offer} label="Nabídka oblečení" />
      {error && !editing && !deleting && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {detail.isSuccess && lookups.data && (
        <>
          {!images.length && <p role="status">Motiv zatím nemá fotografie.</p>}
          <div className="admin-image-grid">
            {images.map((image, index) => (
              <article className="admin-image-card" key={image.id}>
                <ProductArt src={image.thumbnailSmallUrl || image.url} name={image.altText} />
                <div>
                  <p>
                    {index === 0 ? <strong>Hlavní fotografie</strong> : `Fotografie ${index + 1}`}
                  </p>
                  {image.altText && <p>{image.altText}</p>}
                  {image.colorId && (
                    <p>
                      {lookups.data?.colors.find((color) => color.id === image.colorId)?.name ??
                        "Neznámá barva"}
                    </p>
                  )}
                </div>
                <div className="motif-image-actions">
                  <Button
                    disabled={disabled || index === 0 || !!editing || !!deleting}
                    aria-label={`Posunout fotografii ${index + 1} doleva`}
                    onClick={() => move(index, -1)}
                  >
                    ←
                  </Button>
                  <Button
                    disabled={disabled || index === images.length - 1 || !!editing || !!deleting}
                    aria-label={`Posunout fotografii ${index + 1} doprava`}
                    onClick={() => move(index, 1)}
                  >
                    →
                  </Button>
                  <Button
                    disabled={disabled || !!editing || !!deleting}
                    onClick={() => {
                      setError("");
                      setEditing(image);
                    }}
                  >
                    Upravit popisek a barvu
                  </Button>
                  <Button
                    color="error"
                    disabled={disabled || !!editing || !!deleting}
                    onClick={() => {
                      setError("");
                      setDeleting(image);
                    }}
                  >
                    Smazat fotografii
                  </Button>
                </div>
                {editing?.id === image.id && (
                  <form
                    className="dialog-form"
                    aria-label="Upravit fotografii"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void run(
                        {
                          kind: "edit",
                          id: image.id,
                          data: {
                            altText: formText(data, "altText"),
                            colorId: formText(data, "colorId") || null,
                            ...photoGarment(data),
                          },
                        },
                        "Fotografie byla upravena.",
                      ).then((saved) => {
                        if (saved) setEditing(null);
                      });
                    }}
                  >
                    <ImageFields
                      image={image}
                      colors={lookups.data!.colors}
                      garments={garmentChoices}
                      disabled={disabled}
                    />
                    {error && <p role="alert">{error}</p>}
                    <div className="data-table-actions">
                      <Button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setEditing(null);
                          setError("");
                        }}
                      >
                        Zrušit
                      </Button>
                      <Button type="submit" disabled={disabled}>
                        Uložit fotografii
                      </Button>
                    </div>
                  </form>
                )}
                {deleting?.id === image.id && (
                  <div role="group" aria-label="Smazat fotografii?">
                    <p>Fotografie se trvale smaže.</p>
                    {error && <p role="alert">{error}</p>}
                    <Button
                      disabled={disabled}
                      onClick={() => {
                        setDeleting(null);
                        setError("");
                      }}
                    >
                      Zrušit
                    </Button>
                    <Button
                      color="error"
                      disabled={disabled}
                      onClick={() => {
                        void run({ kind: "delete", id: image.id }, "Fotografie byla smazána.").then(
                          (saved) => {
                            if (saved) setDeleting(null);
                          },
                        );
                      }}
                    >
                      Trvale smazat fotografii
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
          <form
            key={uploadVersion}
            className="dialog-form"
            aria-label="Nahrát fotografii"
            onSubmit={(event) => void upload(event)}
          >
            <TextField
              label="Soubor fotografie"
              name="file"
              type="file"
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { accept: "image/jpeg,image/png,image/webp" },
              }}
              required
              disabled={disabled || !!editing || !!deleting}
            />
            <details className="motif-editor-details">
              <summary>Popis a přiřazení fotografie (volitelné)</summary>
              <div className="motif-editor-fields">
                <ImageFields
                  colors={lookups.data.colors}
                  garments={garmentChoices}
                  disabled={disabled || !!editing || !!deleting}
                />
              </div>
            </details>
            <Button
              type="submit"
              variant="contained"
              disabled={disabled || !!editing || !!deleting}
            >
              {write.isPending ? "Ukládání…" : "Nahrát fotografii"}
            </Button>
          </form>
        </>
      )}
    </>
  );
}
