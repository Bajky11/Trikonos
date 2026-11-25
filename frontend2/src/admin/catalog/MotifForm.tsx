import { useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  FormControlLabel,
  MenuItem,
  TextField,
} from "@mui/material";
import {
  adminMotifsCreate,
  adminMotifDesignUpdate,
  adminMotifDesignDestroy,
  adminMotifsImagesCreate,
  adminMotifsPartialUpdate,
} from "../../api/generated/api";
import type { AdminMotifDetail, AdminCategory, GarmentExclusion } from "../../api/generated/models";
import { useCatalogMutation } from "./api";
import { catalogError, formText, parsePrice } from "./forms";
import type { AdminMotifsCreateMutationBody } from "../../api/generated/api";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/http";
import { MotifGarmentExclusions } from "./MotifGarmentExclusions";
import { GarmentPreview } from "../../components/GarmentPreview";

export function MotifForm({
  initial,
  categories,
  duplicate = false,
  busy = false,
  onDuplicate,
  onClose,
  onSaved,
  children,
}: {
  initial?: AdminMotifDetail;
  categories: AdminCategory[];
  duplicate?: boolean;
  busy?: boolean;
  onDuplicate?: () => void;
  onClose: () => void;
  onSaved: () => void;
  children?: ReactNode;
}) {
  const formId = useId();
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const [rules, setRules] = useState<GarmentExclusion[]>(() => [
    ...(initial?.garmentExclusions ?? []),
  ]);
  const [rulesChanged, setRulesChanged] = useState(false);
  const [defaultColor, setDefaultColor] = useState(initial?.defaultColorId ?? "");
  const persisted = useRef<AdminMotifDetail | undefined>(duplicate ? undefined : initial);
  const uploaded = useRef<string | null>(null);
  const [design, setDesign] = useState<File | null>(null);
  const [removeDesign, setRemoveDesign] = useState(false);
  const uploadedDesign = useRef<File | null>(null);
  const client = useQueryClient();
  const save = useCatalogMutation(
    "motifs",
    async ({ data, file }: { data: AdminMotifsCreateMutationBody; file: File | null }) => {
      const { copyRestrictionsFrom, ...fields } = data;
      const fileKey = file ? `${file.name}:${file.size}:${file.lastModified}` : null;
      const uploadFile = file && uploaded.current !== fileKey;
      const uploadDesign = design && uploadedDesign.current !== design;
      const hasUploads = uploadFile || uploadDesign;
      if (!persisted.current) {
        persisted.current = await adminMotifsCreate({
          ...data,
          ...(hasUploads ? { isActive: false } : {}),
        });
      } else {
        persisted.current = await adminMotifsPartialUpdate(persisted.current.id, {
          ...fields,
          slug: data.slug || persisted.current.slug,
          ...(hasUploads ? { isActive: persisted.current.isActive } : {}),
        });
      }
      const id = persisted.current.id;
      if (uploadFile) {
        await adminMotifsImagesCreate(id, { file, altText: data.name });
        uploaded.current = fileKey;
      }
      if (uploadDesign) {
        await adminMotifDesignUpdate(id, { file: design });
        uploadedDesign.current = design;
      } else if (removeDesign) {
        await adminMotifDesignDestroy(id);
        uploadedDesign.current = null;
      }
      if (persisted.current.isActive !== data.isActive)
        persisted.current = await adminMotifsPartialUpdate(id, {
          slug: persisted.current.slug,
          isActive: data.isActive,
        });
    },
  );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || save.isPending) return;
    const data = new FormData(event.currentTarget);
    const price = parsePrice(formText(data, "price"));
    const position = Number(formText(data, "position"));
    const fileInput = data.get("file");
    const file = fileInput instanceof File && fileInput.size ? fileInput : null;
    if (
      file &&
      (file.size > 10 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    ) {
      setError("Vyberte obrázek JPG, PNG nebo WEBP do 10 MB.");
      return;
    }
    if (price === null || !Number.isInteger(position) || position < 0 || position > 2147483647) {
      setError("Zadejte nezápornou cenu s nejvýše dvěma desetinnými místy a celé pořadí.");
      return;
    }
    setError("");
    try {
      const slug = formText(data, "slug").trim();
      await save.mutateAsync({
        data: {
          name: formText(data, "name").trim(),
          description: formText(data, "description"),
          ...(slug ? { slug } : {}),
          price,
          position,
          category: formText(data, "category"),
          isActive: data.get("isActive") === "on",
          ...(duplicate && initial ? { copyRestrictionsFrom: initial.id } : {}),
          ...(rulesChanged ? { garmentExclusions: rules } : {}),
          ...(defaultColor !== (initial?.defaultColorId ?? "")
            ? { defaultColorId: defaultColor || null }
            : {}),
        },
        file,
      });
      onSaved();
    } catch (error) {
      if (persisted.current) {
        void client.invalidateQueries({ queryKey: ["/api/v1/admin/motifs"] });
      }
      const message =
        error instanceof ApiError
          ? catalogError(error)
          : error instanceof Error
            ? error.message
            : catalogError(error);
      setError(
        `${message}${persisted.current && (!initial || duplicate) ? " Motiv byl vytvořen jako koncept. Opravte chybu a uložte znovu; nový motiv se nezaloží." : persisted.current ? " Některé změny už mohly být uloženy." : ""}`,
      );
    }
  };
  const existing = !!initial && !duplicate;
  const disabled = busy || save.isPending;
  return (
    <>
      <DialogContent className="motif-editor-content" dividers>
        <form
          id={formId}
          aria-label="Nastavení motivu"
          onChange={() => setChanged(true)}
          onSubmit={(event) => void submit(event)}
        >
          <section className="motif-editor-section">
            <h3>Základní údaje</h3>
            <TextField
              label="Název motivu"
              name="name"
              defaultValue={initial ? (duplicate ? `${initial.name} – kopie` : initial.name) : ""}
              required
              disabled={save.isPending}
              slotProps={{ htmlInput: { maxLength: 255 } }}
            />
            <TextField
              label="Popis"
              name="description"
              defaultValue={initial?.description ?? ""}
              multiline
              minRows={2}
              disabled={save.isPending}
            />
            <div className="motif-editor-fields">
              <TextField
                label="Cena motivu (Kč)"
                name="price"
                defaultValue={initial ? String(initial.price / 100) : ""}
                required
                disabled={save.isPending}
                slotProps={{ htmlInput: { inputMode: "decimal" } }}
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
            </div>
            {!categories.length && (
              <p role="alert">Nejdříve založte kategorii ve stávající správě backendu.</p>
            )}
            <FormControlLabel
              control={
                <Checkbox
                  name="isActive"
                  defaultChecked={duplicate ? false : (initial?.isActive ?? false)}
                  disabled={save.isPending}
                />
              }
              label="Zobrazovat motiv v katalogu"
            />
          </section>
          <MotifGarmentExclusions
            defaultColor={defaultColor}
            onDefaultColorChange={(value) => {
              setDefaultColor(value);
              setChanged(true);
            }}
            rules={rules}
            disabled={disabled}
            onChange={(value) => {
              setRules(value);
              setRulesChanged(true);
              setChanged(true);
            }}
          />
          <section className="motif-editor-section">
            <h3>Motiv pro automatický náhled</h3>
            {existing && initial.designImageUrl && !removeDesign && (
              <div className="admin-garment-preview">
                <GarmentPreview
                  design={initial.designImageUrl}
                  label="Uložený náhled motivu na tričku"
                />
              </div>
            )}
            <TextField
              label={existing && initial.designImageUrl ? "Nahradit PNG motivu" : "PNG motivu"}
              type="file"
              disabled={disabled || removeDesign}
              onChange={(event) => {
                setDesign((event.target as HTMLInputElement).files?.[0] ?? null);
                setChanged(true);
              }}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { accept: "image/png" } }}
              helperText="Použij PNG s průhledným pozadím. Web ho vycentruje na oblečení ve vybrané barvě."
            />
            {existing && initial.designImageUrl && !design && (
              <FormControlLabel
                label="Odebrat PNG motivu"
                control={
                  <Checkbox
                    checked={removeDesign}
                    disabled={disabled}
                    onChange={(_, checked) => {
                      setRemoveDesign(checked);
                      setChanged(true);
                    }}
                  />
                }
              />
            )}
          </section>
          {!existing && (
            <section className="motif-editor-section">
              <h3>Fotografie hotového produktu (volitelné)</h3>
              <TextField
                label="Obrázek motivu"
                name="file"
                type="file"
                disabled={save.isPending}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { accept: "image/jpeg,image/png,image/webp" },
                }}
                helperText={duplicate ? "Fotografie původního motivu se nekopírují." : undefined}
              />
            </section>
          )}
        </form>
        {children}
        <section className="motif-editor-section">
          <details
            className="motif-editor-details"
            onChange={() => setChanged(true)}
            onInvalid={(event) => {
              event.currentTarget.open = true;
            }}
          >
            <summary>Další nastavení</summary>
            <div className="motif-editor-fields">
              <TextField
                label="Slug URL"
                name="slug"
                defaultValue={duplicate ? "" : (initial?.slug ?? "")}
                disabled={save.isPending}
                slotProps={{ htmlInput: { form: formId } }}
              />
              <TextField
                label="Pořadí"
                name="position"
                type="number"
                defaultValue={initial?.position ?? 0}
                required
                disabled={save.isPending}
                slotProps={{ htmlInput: { form: formId, min: 0, max: 2147483647, step: 1 } }}
              />
            </div>
          </details>
          {onDuplicate && (
            <Button type="button" disabled={disabled || changed} onClick={onDuplicate}>
              Duplikovat motiv
            </Button>
          )}
        </section>
      </DialogContent>
      <DialogActions className="motif-editor-actions">
        {error && <p role="alert">{error}</p>}
        <Button disabled={disabled} onClick={onClose}>
          Zavřít
        </Button>
        <Button
          type="submit"
          form={formId}
          variant="contained"
          disabled={disabled || !categories.length}
        >
          {save.isPending ? "Ukládání…" : "Uložit a zavřít"}
        </Button>
      </DialogActions>
    </>
  );
}
