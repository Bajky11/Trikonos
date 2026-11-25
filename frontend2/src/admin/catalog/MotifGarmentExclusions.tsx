import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Link } from "react-router-dom";
import { useAdminGarmentOfferRetrieve } from "../../api/generated/api";
import { SizeEnum } from "../../api/generated/models";
import type { GarmentExclusion } from "../../api/generated/models";
import { CatalogFeedback } from "../../components/Products";
import { useVariantLookups } from "./api";
import { garmentKey, garmentName, groupGarments, sizeLabel } from "./OfferBlocks";

const ruleKey = (rule: Omit<GarmentExclusion, "size"> & { size?: string }) =>
  `${garmentKey(rule)}:${rule.colorId ?? ""}:${rule.size ?? ""}`;

export function MotifGarmentExclusions({
  rules,
  onChange,
  defaultColor,
  onDefaultColorChange,
  disabled,
}: {
  rules: GarmentExclusion[];
  onChange: (rules: GarmentExclusion[]) => void;
  defaultColor: string;
  onDefaultColorChange: (value: string) => void;
  disabled: boolean;
}) {
  const offer = useAdminGarmentOfferRetrieve();
  const lookups = useVariantLookups();
  const dictionaries = lookups.data;
  const title = (rule: Pick<GarmentExclusion, "productTypeId" | "cutId">) =>
    dictionaries ? garmentName(rule, dictionaries) : "Oblečení";
  const colorName = (id: string) =>
    dictionaries?.colors.find((color) => color.id === id)?.name ?? "Odstraněná barva";
  const active = (rows: NonNullable<typeof offer.data>["variants"]) =>
    rows.filter(
      (row) =>
        dictionaries?.productTypes.some((item) => item.id === row.productTypeId && item.isActive) &&
        dictionaries?.cuts.some((item) => item.id === row.cutId && item.isActive) &&
        dictionaries?.colors.some((item) => item.id === row.colorId && item.isActive),
    );
  const available = active(offer.data?.variants ?? []);
  const matches = (rule: GarmentExclusion) =>
    available.some(
      (row) =>
        garmentKey(row) === garmentKey(rule) &&
        (!rule.colorId || row.colorId === rule.colorId) &&
        (!rule.size || row.size === rule.size),
    );
  const selected = new Set(rules.map(ruleKey));
  const offeredColors = new Set(
    available
      .filter((row) => {
        const pair = { productTypeId: row.productTypeId, cutId: row.cutId };
        return (
          !selected.has(ruleKey(pair)) &&
          !selected.has(ruleKey({ ...pair, colorId: row.colorId })) &&
          !selected.has(ruleKey({ ...pair, size: row.size }))
        );
      })
      .map((row) => row.colorId),
  );
  const unavailableDefault = !!defaultColor && !offeredColors.has(defaultColor);
  const remove = (rule: GarmentExclusion) =>
    onChange(rules.filter((item) => ruleKey(item) !== ruleKey(rule)));
  const toggleRule = (rule: GarmentExclusion, exclude: boolean) =>
    exclude ? onChange([...rules, rule]) : remove(rule);
  const option = (rule: GarmentExclusion, label: string, blocked: boolean) => (
    <FormControlLabel
      key={ruleKey(rule)}
      label={label}
      control={
        <Checkbox
          size="small"
          checked={selected.has(ruleKey(rule))}
          disabled={disabled || blocked}
          onChange={(_, checked) => toggleRule(rule, checked)}
        />
      }
    />
  );
  return (
    <section className="motif-editor-section">
      <h3>Oblečení</h3>
      <p className="motif-offer-note">
        Motiv přebírá <Link to="/admin/obleceni">společnou nabídku oblečení</Link>. Odškrtnutím
        vypneš celý typ a střih pro tento motiv.
      </p>
      <CatalogFeedback query={offer} label="Společná nabídka" />
      <CatalogFeedback query={lookups} label="Číselníky" />
      {offer.data && dictionaries && (
        <>
          <TextField
            select
            size="small"
            label="Výchozí barva"
            value={defaultColor}
            disabled={disabled}
            onChange={(event) => onDefaultColorChange(event.target.value)}
            helperText={
              unavailableDefault
                ? "Tato barva není v nabídce motivu. Detail použije první dostupnou."
                : "Tato barva se předvybere při otevření detailu motivu."
            }
          >
            <MenuItem value="">První dostupná barva</MenuItem>
            {unavailableDefault && (
              <MenuItem value={defaultColor} disabled>
                {colorName(defaultColor)} (nedostupná)
              </MenuItem>
            )}
            {dictionaries.colors
              .filter((color) => offeredColors.has(color.id))
              .map((color) => (
                <MenuItem key={color.id} value={color.id}>
                  {color.name}
                </MenuItem>
              ))}
          </TextField>
          {!available.length && <p>Ve společné nabídce není dostupné žádné oblečení.</p>}
          <div className="motif-garments">
            {groupGarments(available).map((group) => {
              const { productTypeId, cutId } = group[0];
              const rule = { productTypeId, cutId };
              const entire = selected.has(ruleKey(rule));
              const name = title(rule);
              const hasExceptions = rules.some(
                (item) => garmentKey(item) === garmentKey(rule) && (item.colorId || item.size),
              );
              const hasAvailableVariant = group.some(
                (row) =>
                  !selected.has(ruleKey({ ...rule, colorId: row.colorId })) &&
                  !selected.has(ruleKey({ ...rule, size: row.size })),
              );
              const colors = dictionaries.colors.filter((color) =>
                group.some((row) => row.colorId === color.id),
              );
              return (
                <article className="motif-garment" key={garmentKey(rule)} aria-label={name}>
                  <Checkbox
                    size="small"
                    className="motif-garment-toggle"
                    checked={!entire}
                    disabled={disabled}
                    slotProps={{ input: { "aria-label": `Nabízet: ${name}` } }}
                    onChange={(_, checked) => toggleRule(rule, !checked)}
                  />
                  <details className="motif-garment-details">
                    <summary>
                      <span className="motif-garment-name">
                        <strong>{name}</strong>
                        {entire ? (
                          <small>Vypnuto</small>
                        ) : (
                          !hasAvailableVariant && <small>Všechny možnosti jsou vypnuté</small>
                        )}
                      </span>
                      <span className="motif-garment-expand">
                        {hasExceptions ? "S výjimkami" : "Výjimky"}
                        <ExpandMoreIcon fontSize="small" aria-hidden />
                      </span>
                    </summary>
                    <div className="motif-garment-options">
                      {entire && <p>Výjimky můžeš upravit po zapnutí oblečení.</p>}
                      <fieldset className="garment-axis" disabled={disabled || entire}>
                        <legend>Vypnout barvy</legend>
                        {colors.map((color) =>
                          option({ ...rule, colorId: color.id }, color.name, entire),
                        )}
                      </fieldset>
                      <fieldset className="garment-axis" disabled={disabled || entire}>
                        <legend>Vypnout velikosti</legend>
                        {Object.values(SizeEnum)
                          .filter((size) => group.some((row) => row.size === size))
                          .map((size) =>
                            option({ ...rule, size }, sizeLabel(size, dictionaries), entire),
                          )}
                      </fieldset>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
          {rules
            .filter((rule) => !matches(rule))
            .map((rule) => (
              <p className="motif-offer-note" key={ruleKey(rule)}>
                {title(rule)}
                {rule.colorId && ` · ${colorName(rule.colorId)}`}
                {rule.size && ` · ${sizeLabel(rule.size, dictionaries)}`} — Není v nabídce oblečení.
                <Button type="button" size="small" disabled={disabled} onClick={() => remove(rule)}>
                  Odebrat výjimku
                </Button>
              </p>
            ))}
        </>
      )}
    </section>
  );
}
