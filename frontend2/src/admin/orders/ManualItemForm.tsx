import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Autocomplete, Button, MenuItem, TextField } from "@mui/material";
import {
  motifsList,
  uploadsDesignsCreate,
  useCatalogOptionsRetrieve,
  useMotifsRetrieve,
} from "../../api/generated/api";
import type { DesignUploadResponse, OrderItemInput } from "../../api/generated/models";
import { SizeEnum } from "../../api/generated/models";
import { withCsrf } from "../../auth/csrf";
import { CatalogFeedback } from "../../components/Products";
import { allPages } from "../catalog/api";
import { catalogError, formText, parsePrice } from "../catalog/forms";

export type ManualLine = { input: OrderItemInput; label: string };
export function ManualItemForm({
  disabled,
  add,
}: {
  disabled: boolean;
  add: (line: ManualLine) => void;
}) {
  const [custom, setCustom] = useState(false),
    [slug, setSlug] = useState(""),
    [variant, setVariant] = useState("");
  const [productType, setProductType] = useState(""),
    [cutId, setCutId] = useState(""),
    [colorId, setColorId] = useState(""),
    [upload, setUpload] = useState<DesignUploadResponse | null>(null),
    [error, setError] = useState("");
  const options = useCatalogOptionsRetrieve();
  const motifs = useQuery({
    queryKey: ["/api/v1/motifs", "manual-options"],
    queryFn: ({ signal }) => allPages((page) => motifsList({ page, pageSize: 100 }, { signal })),
    retry: false,
  });
  const detail = useMotifsRetrieve(slug, {
    query: { enabled: !!slug && !custom, retry: false, refetchOnWindowFocus: false },
  });
  const uploadMutation = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (file: File) => withCsrf(() => uploadsDesignsCreate({ file })),
  });
  const type = options.data?.productTypes.find((value) => value.id === productType);
  const offer = options.data?.garmentVariants ?? [];
  const forType = offer.filter((value) => value.productTypeId === productType);
  const forCut = forType.filter((value) => value.cutId === cutId);
  const forColor = forCut.filter((value) => value.colorId === colorId);
  const busy = disabled || uploadMutation.isPending;
  return (
    <section aria-label="Přidání položky ruční objednávky">
      <h2>Přidat položku</h2>
      <CatalogFeedback query={options} label="Číselníky položky" />
      <CatalogFeedback query={motifs} label="Motivy pro ruční objednávku" />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !options.data) return;
          const data = new FormData(event.currentTarget),
            quantity = Number(formText(data, "quantity")),
            priceText = formText(data, "unitPrice").trim(),
            price = priceText ? parsePrice(priceText) : null;
          if (
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 500 ||
            (priceText && price === null)
          ) {
            setError(
              "Zkontrolujte počet 1–500 a nezápornou cenu v Kč s nejvýše dvěma desetinnými místy.",
            );
            return;
          }
          let input: OrderItemInput, label: string;
          if (!custom) {
            const chosen = detail.data?.variants[Number(variant)];
            if (!detail.data || variant === "" || !chosen) {
              setError("Vyberte motiv a jeho skutečnou variantu.");
              return;
            }
            const size = Object.values(SizeEnum).find((value) => value === chosen.size);
            if (!size) {
              setError("Velikost varianty není podporovaná kontraktem objednávky.");
              return;
            }
            input = { isCustom: false, motifId: detail.data.id, ...chosen, size, quantity };
            label = `${detail.data.name} · ${chosen.size}`;
          } else {
            const area = type?.printAreas.find((area) => area.id === formText(data, "printAreaId"));
            const size = Object.values(SizeEnum).find((value) => value === formText(data, "size"));
            const width = Number(formText(data, "width")),
              height = Number(formText(data, "height")),
              x = Number(formText(data, "x")),
              y = Number(formText(data, "y")),
              rotationDeg = Number(formText(data, "rotationDeg"));
            if (
              !type ||
              !area ||
              !size ||
              !forColor.some((value) => value.size === size) ||
              !upload ||
              [width, height, x, y, rotationDeg].some((value) => !Number.isSafeInteger(value)) ||
              width <= 0 ||
              height <= 0 ||
              x < 0 ||
              y < 0 ||
              x + width > area.widthMm ||
              y + height > area.heightMm
            ) {
              setError("Nahrajte PNG/JPG a zadejte umístění v celých mm uvnitř zvolené plochy.");
              return;
            }
            input = {
              isCustom: true,
              customText: formText(data, "customText"),
              productTypeId: type.id,
              cutId: formText(data, "cutId"),
              colorId: formText(data, "colorId"),
              size,
              quantity,
              placements: [
                {
                  printAreaId: area.id,
                  fileToken: upload.fileToken,
                  width,
                  height,
                  x,
                  y,
                  rotationDeg,
                },
              ],
            };
            label = `Vlastní potisk · ${type.name} · ${size}`;
          }
          if (price !== null) input.unitPrice = price;
          setError("");
          add({ input, label });
          if (custom) setUpload(null);
        }}
      >
        <fieldset className="checkout-fields" disabled={busy}>
          <legend>Nová položka</legend>
          <TextField
            select
            label="Druh položky"
            value={custom ? "custom" : "catalog"}
            disabled={busy}
            onChange={(event) => {
              setCustom(event.target.value === "custom");
              setError("");
            }}
          >
            <MenuItem value="catalog">Katalogový motiv</MenuItem>
            <MenuItem value="custom">Vlastní potisk</MenuItem>
          </TextField>
          {!custom ? (
            <>
              <Autocomplete
                options={motifs.data ?? []}
                getOptionLabel={(motif) => motif.name}
                getOptionKey={(motif) => motif.id}
                value={motifs.data?.find((motif) => motif.slug === slug) ?? null}
                disabled={busy}
                loading={motifs.isLoading}
                loadingText="Načítám motivy…"
                noOptionsText="Žádný odpovídající motiv"
                clearText="Vymazat motiv"
                openText="Zobrazit motivy"
                closeText="Skrýt motivy"
                onChange={(_, motif) => {
                  setSlug(motif?.slug ?? "");
                  setVariant("");
                }}
                renderInput={(params) => <TextField {...params} label="Motiv položky" required />}
              />
              {slug && <CatalogFeedback query={detail} label="Varianty motivu" />}
              <TextField
                select
                label="Varianta položky"
                value={variant}
                required
                disabled={busy || !detail.isSuccess}
                onChange={(event) => setVariant(event.target.value)}
              >
                <MenuItem value="">Vyberte variantu</MenuItem>
                {detail.data?.variants.map((value, index) => (
                  <MenuItem key={index} value={String(index)}>
                    {
                      options.data?.productTypes.find((type) => type.id === value.productTypeId)
                        ?.name
                    }{" "}
                    · {options.data?.cuts.find((cut) => cut.id === value.cutId)?.name} ·{" "}
                    {options.data?.colors.find((color) => color.id === value.colorId)?.name} ·{" "}
                    {value.size}
                  </MenuItem>
                ))}
              </TextField>
            </>
          ) : (
            <>
              <TextField
                select
                label="Typ vlastního oděvu"
                value={productType}
                required
                disabled={busy}
                onChange={(event) => {
                  setProductType(event.target.value);
                  setCutId("");
                  setColorId("");
                  setUpload(null);
                }}
              >
                <MenuItem value="">Vyberte typ</MenuItem>
                {options.data?.productTypes
                  .filter(
                    (type) =>
                      type.printAreas.length &&
                      offer.some((value) => value.productTypeId === type.id),
                  )
                  .map((type) => (
                    <MenuItem key={type.id} value={type.id}>
                      {type.name}
                    </MenuItem>
                  ))}
              </TextField>
              {(
                [
                  [
                    "cutId",
                    "Střih",
                    options.data?.cuts.filter((cut) =>
                      forType.some((value) => value.cutId === cut.id),
                    ) ?? [],
                  ],
                  [
                    "colorId",
                    "Barva",
                    options.data?.colors.filter((color) =>
                      forCut.some((value) => value.colorId === color.id),
                    ) ?? [],
                  ],
                  [
                    "size",
                    "Velikost",
                    options.data?.sizes
                      .filter((size) => forColor.some((value) => value.size === size.value))
                      .map((size) => ({ id: size.value, name: size.label })) ?? [],
                  ],
                  ["printAreaId", "Plocha vlastního potisku", type?.printAreas ?? []],
                ] as const
              ).map(([name, label, values]) => (
                <TextField
                  key={`${name}-${productType}-${name === "size" ? `${cutId}-${colorId}` : ""}`}
                  select
                  name={name}
                  label={label}
                  {...(name === "cutId"
                    ? {
                        value: cutId,
                        onChange: (event) => {
                          setCutId(event.target.value);
                          setColorId("");
                        },
                      }
                    : name === "colorId"
                      ? { value: colorId, onChange: (event) => setColorId(event.target.value) }
                      : { defaultValue: "" })}
                  required
                  disabled={busy || !values.length}
                >
                  <MenuItem value="">Vyberte</MenuItem>
                  {values.map((value) => (
                    <MenuItem key={value.id} value={value.id}>
                      {value.name}
                    </MenuItem>
                  ))}
                </TextField>
              ))}
              <TextField name="customText" label="Popis vlastního potisku" />
              <TextField
                label="PNG/JPG podklad"
                type="file"
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { accept: "image/png,image/jpeg" },
                }}
                disabled={busy}
                onChange={(event) => {
                  const file = (event.target as HTMLInputElement).files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setUpload(null);
                  if (
                    !["image/png", "image/jpeg"].includes(file.type) ||
                    file.size > 20 * 1024 * 1024
                  ) {
                    setError("Použijte PNG/JPG nejvýše 20 MB.");
                    return;
                  }
                  void uploadMutation
                    .mutateAsync(file)
                    .then(setUpload)
                    .catch((error: unknown) => setError(catalogError(error)))
                    .finally(() => uploadMutation.reset());
                }}
              />
              {upload && (
                <p role="status">Podklad nahraný: {upload.fileName}. Token platí 7 dní.</p>
              )}
              {(
                [
                  ["width", "Šířka podkladu (mm)", 100],
                  ["height", "Výška podkladu (mm)", 100],
                  ["x", "X podkladu (mm)", 0],
                  ["y", "Y podkladu (mm)", 0],
                  ["rotationDeg", "Rotace podkladu (°)", 0],
                ] as const
              ).map(([name, label, value]) => (
                <TextField
                  key={name}
                  name={name}
                  label={label}
                  type="number"
                  required
                  defaultValue={value}
                  slotProps={{ htmlInput: { step: 1 } }}
                />
              ))}
            </>
          )}
          <TextField
            label="Počet kusů nové položky"
            name="quantity"
            type="number"
            required
            defaultValue={1}
            slotProps={{ htmlInput: { min: 1, max: 500, step: 1 } }}
          />
          <TextField
            label="Ruční cena za kus (Kč)"
            name="unitPrice"
            helperText="Prázdné = katalogová cena, u vlastního potisku čekání na nacenění. 0 = zdarma."
            slotProps={{ htmlInput: { inputMode: "decimal" } }}
          />
          {error && <p role="alert">{error}</p>}
          <Button type="submit" disabled={busy || (custom && !upload)}>
            Přidat do ruční objednávky
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
