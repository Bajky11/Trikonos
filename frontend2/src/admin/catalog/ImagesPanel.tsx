import { useState } from "react";
import type { FormEvent } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
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
import { useAdminColors, useCatalogMutation } from "./api";
import { catalogError, formText } from "./forms";

function ImageFields({
  image,
  colors,
  disabled,
}: {
  image?: AdminMotifImage;
  colors: AdminColor[];
  disabled: boolean;
}) {
  return (
    <>
      <TextField
        name="altText"
        label="Popisek fotografie"
        defaultValue={image?.altText ?? ""}
        disabled={disabled}
      />
      <TextField
        name="colorId"
        label="Barva fotografie"
        select
        defaultValue={image?.colorId ?? ""}
        disabled={disabled}
        helperText="Bez barvy se fotografie zobrazí pro všechny barvy motivu."
      >
        <MenuItem value="">Všechny barvy</MenuItem>
        {colors.map((color) => (
          <MenuItem key={color.id} value={color.id}>
            {color.name}
            {!color.isActive && " (neaktivní)"}
          </MenuItem>
        ))}
      </TextField>
    </>
  );
}

type Action =
  | { kind: "upload"; file: File; altText: string; colorId?: string }
  | { kind: "edit"; id: string; data: PatchedMotifImagePatch }
  | { kind: "delete"; id: string }
  | { kind: "reorder"; ids: string[] };

export function ImagesPanel({ motifId }: { motifId: string }) {
  const detail = useAdminMotifsRetrieve(motifId, { query: { refetchOnWindowFocus: false } });
  const colors = useAdminColors();
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
  const run = async (action: Action, success: string) => {
    if (write.isPending) return false;
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
    if (
      await run(
        {
          kind: "upload",
          file,
          altText: formText(data, "altText"),
          ...(colorId ? { colorId } : {}),
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
      <p>
        První fotografie je hlavní obrázek katalogu. Ukládá se originál a dva náhledy na backendu.
      </p>
      <CatalogFeedback query={detail} label="Fotografie" />
      <CatalogFeedback query={colors} label="Barvy" />
      {error && !editing && !deleting && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {detail.isSuccess && colors.isSuccess && (
        <>
          {!images.length && <p role="status">Motiv zatím nemá fotografie.</p>}
          <div className="admin-image-grid">
            {images.map((image, index) => (
              <article className="admin-image-card" key={image.id}>
                <ProductArt src={image.thumbnailSmallUrl || image.url} name={image.altText} />
                <p>{index === 0 ? "Hlavní fotografie" : `Fotografie ${index + 1}`}</p>
                <p>{image.altText || "Bez popisku"}</p>
                <p>
                  {image.colorId
                    ? (colors.data.find((color) => color.id === image.colorId)?.name ??
                      "Neznámá barva")
                    : "Všechny barvy"}
                </p>
                <Button
                  disabled={write.isPending || index === 0}
                  aria-label={`Posunout fotografii ${index + 1} doleva`}
                  onClick={() => move(index, -1)}
                >
                  ←
                </Button>
                <Button
                  disabled={write.isPending || index === images.length - 1}
                  aria-label={`Posunout fotografii ${index + 1} doprava`}
                  onClick={() => move(index, 1)}
                >
                  →
                </Button>
                <Button
                  disabled={write.isPending}
                  onClick={() => {
                    setError("");
                    setEditing(image);
                  }}
                >
                  Upravit popisek a barvu
                </Button>
                <Button
                  color="error"
                  disabled={write.isPending}
                  onClick={() => {
                    setError("");
                    setDeleting(image);
                  }}
                >
                  Smazat fotografii
                </Button>
              </article>
            ))}
          </div>
          <form
            key={uploadVersion}
            className="dialog-form"
            aria-label="Nahrát fotografii"
            onSubmit={(event) => void upload(event)}
          >
            <h3>Nahrát fotografii</h3>
            <TextField
              label="Soubor fotografie"
              name="file"
              type="file"
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { accept: "image/jpeg,image/png,image/webp" },
              }}
              required
              disabled={write.isPending}
            />
            <p>JPG, PNG nebo WEBP, nejvýše 10 MB. Skutečný obsah souboru ověřuje server.</p>
            <ImageFields colors={colors.data} disabled={write.isPending} />
            <Button type="submit" variant="contained" disabled={write.isPending}>
              {write.isPending ? "Ukládání…" : "Nahrát fotografii"}
            </Button>
          </form>
        </>
      )}
      <Dialog
        open={editing !== null}
        onClose={write.isPending ? undefined : () => setEditing(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Upravit fotografii</DialogTitle>
        {editing && (
          <form
            key={editing.id}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run(
                {
                  kind: "edit",
                  id: editing.id,
                  data: {
                    altText: formText(data, "altText"),
                    colorId: formText(data, "colorId") || null,
                  },
                },
                "Fotografie byla upravena.",
              ).then((saved) => {
                if (saved) setEditing(null);
              });
            }}
          >
            <DialogContent className="dialog-form">
              <ImageFields image={editing} colors={colors.data ?? []} disabled={write.isPending} />
              {error && <p role="alert">{error}</p>}
            </DialogContent>
            <DialogActions>
              <Button disabled={write.isPending} onClick={() => setEditing(null)}>
                Zrušit
              </Button>
              <Button type="submit" disabled={write.isPending}>
                Uložit fotografii
              </Button>
            </DialogActions>
          </form>
        )}
      </Dialog>
      <Dialog
        open={deleting !== null}
        onClose={write.isPending ? undefined : () => setDeleting(null)}
      >
        <DialogTitle>Smazat fotografii?</DialogTitle>
        <DialogContent>
          <p>Trvale se smaže originál i oba náhledy. Tuto akci nelze vrátit.</p>
          {error && <p role="alert">{error}</p>}
        </DialogContent>
        <DialogActions>
          <Button disabled={write.isPending} onClick={() => setDeleting(null)}>
            Zrušit
          </Button>
          <Button
            color="error"
            disabled={write.isPending}
            onClick={() => {
              if (deleting)
                void run({ kind: "delete", id: deleting.id }, "Fotografie byla smazána.").then(
                  (saved) => {
                    if (saved) setDeleting(null);
                  },
                );
            }}
          >
            Trvale smazat fotografii
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
