import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import { SizeEnum } from "../../api/generated/models";
import type { MotifVariantRef, SizeEnum as Size } from "../../api/generated/models";
import { GarmentMockupField } from "./GarmentMockupField";
import type { useVariantLookups } from "./api";

export type Lookups = NonNullable<ReturnType<typeof useVariantLookups>["data"]>;
export const sizeLabel = (size: string, lookups: Lookups) =>
  lookups.sizes.find((item) => item.value === size)?.label ?? size;
type Garment = Pick<MotifVariantRef, "productTypeId" | "cutId">;
type OfferBlock = Garment & { key: string; colors: string[]; sizes: Size[]; gaps: Set<string> };
export const garmentKey = (row: Garment) => `${row.productTypeId}:${row.cutId}`;
export const variantKey = (row: MotifVariantRef) => `${garmentKey(row)}:${row.colorId}:${row.size}`;
export const garmentName = (row: Garment, lookups: Lookups) =>
  `${lookups.productTypes.find((item) => item.id === row.productTypeId)?.name ?? "Neznámý typ"} · ${lookups.cuts.find((item) => item.id === row.cutId)?.name ?? "Neznámý střih"}`;
const pair = (color: string, size: string) => `${color}:${size}`;
const sizes = Object.values(SizeEnum);

export function groupGarments(rows: MotifVariantRef[]) {
  const groups = new Map<string, MotifVariantRef[]>();
  for (const row of rows) {
    const key = garmentKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return [...groups.values()];
}

export function blocksFromVariants(rows: MotifVariantRef[]): OfferBlock[] {
  return groupGarments(rows).map((group) => {
    const { productTypeId, cutId } = group[0];
    const colors = [...new Set(group.map((row) => row.colorId))];
    const selectedSizes = sizes.filter((size) => group.some((row) => row.size === size));
    const existing = new Set(group.map((row) => pair(row.colorId, row.size)));
    const gaps = new Set(
      colors
        .flatMap((color) => selectedSizes.map((size) => pair(color, size)))
        .filter((key) => !existing.has(key)),
    );
    return { key: crypto.randomUUID(), productTypeId, cutId, colors, sizes: selectedSizes, gaps };
  });
}

export function validateBlocks(blocks: OfferBlock[]) {
  const keys = new Set<string>();
  for (const block of blocks) {
    if (!block.productTypeId || !block.cutId) return "U každého oblečení vyberte typ a střih.";
    if (!variantsFromBlocks([block]).size) return "Vyberte barvy a velikosti, nebo kartu odeberte.";
    const key = garmentKey(block);
    if (keys.has(key)) return "Stejný typ a střih může být v nabídce pouze jednou.";
    keys.add(key);
  }
  return "";
}

export function variantsFromBlocks(blocks: OfferBlock[]) {
  const desired = new Map<string, MotifVariantRef>();
  for (const { productTypeId, cutId, colors, sizes, gaps } of blocks)
    for (const colorId of colors)
      for (const size of sizes) {
        if (gaps.has(pair(colorId, size))) continue;
        const row = { productTypeId, cutId, colorId, size };
        desired.set(variantKey(row), row);
      }
  return desired;
}

const toggle = <T,>(values: T[], item: T, checked: boolean) =>
  checked ? [...values, item] : values.filter((value) => value !== item);

export function OfferBlocks({
  blocks,
  onChange,
  lookups,
  disabled,
}: {
  blocks: OfferBlock[];
  onChange: (blocks: OfferBlock[]) => void;
  lookups: Lookups;
  disabled: boolean;
}) {
  const update = (key: string, patch: Partial<OfferBlock>) =>
    onChange(blocks.map((block) => (block.key === key ? { ...block, ...patch } : block)));
  return (
    <section className="garment-cards" aria-label="Nabídka oblečení">
      {blocks.map((block) => {
        const complete = !!(block.productTypeId && block.cutId);
        const name = complete ? garmentName(block, lookups) : "Nové oblečení";
        const colors = lookups.colors.filter(
          (color) => color.isActive || block.colors.includes(color.id),
        );
        return (
          <article className="garment-card" key={block.key} aria-label={name}>
            <header className="garment-card-header">
              <h3>{name}</h3>
              <Button
                type="button"
                size="small"
                color="error"
                disabled={disabled}
                onClick={() => onChange(blocks.filter((item) => item.key !== block.key))}
              >
                Odebrat
              </Button>
            </header>
            <div className="garment-card-fields">
              {(
                [
                  ["productTypeId", "Typ oblečení", lookups.productTypes],
                  ["cutId", "Střih", lookups.cuts],
                ] as const
              ).map(([key, label, choices]) => (
                <TextField
                  key={key}
                  select
                  size="small"
                  label={label}
                  value={block[key]}
                  disabled={disabled}
                  onChange={(event) => update(block.key, { [key]: event.target.value })}
                >
                  <MenuItem value="">Vyberte</MenuItem>
                  {choices
                    .filter((item) => item.isActive || item.id === block[key])
                    .map((item) => (
                      <MenuItem key={item.id} value={item.id}>
                        {item.name}
                        {!item.isActive && " (neaktivní)"}
                      </MenuItem>
                    ))}
                </TextField>
              ))}
            </div>
            {complete && (
              <>
                <GarmentMockupField
                  key={garmentKey(block)}
                  productTypeId={block.productTypeId}
                  cutId={block.cutId}
                  disabled={disabled}
                  url={lookups.mockups.find((item) => garmentKey(item) === garmentKey(block))?.url}
                />
                <fieldset className="garment-axis" disabled={disabled}>
                  <legend>Barvy</legend>
                  {colors.map((color) => (
                    <FormControlLabel
                      key={color.id}
                      label={`${color.name}${color.isActive ? "" : " (neaktivní)"}`}
                      control={
                        <Checkbox
                          size="small"
                          checked={block.colors.includes(color.id)}
                          onChange={(_, checked) =>
                            update(block.key, { colors: toggle(block.colors, color.id, checked) })
                          }
                        />
                      }
                    />
                  ))}
                </fieldset>
                <fieldset className="garment-axis" disabled={disabled}>
                  <legend>Velikosti</legend>
                  {sizes.map((size) => (
                    <FormControlLabel
                      key={size}
                      label={sizeLabel(size, lookups)}
                      control={
                        <Checkbox
                          size="small"
                          checked={block.sizes.includes(size)}
                          onChange={(_, checked) =>
                            update(block.key, { sizes: toggle(block.sizes, size, checked) })
                          }
                        />
                      }
                    />
                  ))}
                </fieldset>
                {!!block.gaps.size && (
                  <div className="motif-offer-note">
                    <p>
                      Některé dvojice barvy a velikosti ve starší nabídce chybí. Zůstanou vypnuté,
                      dokud nabídku nesjednotíte.
                    </p>
                    <Button
                      type="button"
                      size="small"
                      disabled={disabled}
                      onClick={() => update(block.key, { gaps: new Set() })}
                    >
                      Použít velikosti pro všechny barvy
                    </Button>
                  </div>
                )}
              </>
            )}
          </article>
        );
      })}
      <Button
        type="button"
        variant="outlined"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...blocks,
            {
              key: crypto.randomUUID(),
              productTypeId: "",
              cutId: "",
              colors: [],
              sizes: [],
              gaps: new Set(),
            },
          ])
        }
      >
        Přidat oblečení
      </Button>
    </section>
  );
}
