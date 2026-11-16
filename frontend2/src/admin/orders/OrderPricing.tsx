import { useState } from "react";
import { Button, Paper, TextField } from "@mui/material";
import {
  adminOrdersItemsPartialUpdate,
  adminOrdersShippingCostUpdate,
  adminOrdersShippingCostDestroy,
} from "../../api/generated/api";
import type { AdminOrderDetail, AdminOrderItem } from "../../api/generated/models";
import { apiBaseUrl } from "../../api/http";
import { money } from "../../data/catalog";
import { formText, parsePrice } from "../catalog/forms";
import type { SaveOrder } from "./OrderEditor";

export const amount = (value: number | null | undefined) =>
  value == null ? "K nacenění" : money(value / 100);
function assetUrl(value: string) {
  try {
    const url = new URL(value, apiBaseUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
function Item({
  item,
  order,
  disabled,
  save,
}: {
  item: AdminOrderItem;
  order: AdminOrderDetail;
  disabled: boolean;
  save: SaveOrder;
}) {
  const [error, setError] = useState("");
  return (
    <Paper component="section" variant="outlined" className="cart-line" aria-label={item.itemLabel}>
      <h3>{item.itemLabel}</h3>
      <p>
        {item.isCustom ? "Vlastní potisk" : "Katalogová položka"} · {item.productType?.name} ·{" "}
        {item.cut?.name} · {item.color?.name} · {item.size}
      </p>
      {item.customText && <p>{item.customText}</p>}
      <p>
        {item.quantity} ks × {amount(item.unitPrice)} · Řádek:{" "}
        {amount(
          item.unitPrice == null || item.quantity == null ? null : item.unitPrice * item.quantity,
        )}
      </p>
      {item.placements.map((placement) => (
        <div key={placement.id}>
          <p>
            {placement.printArea.name}: {placement.width} × {placement.height} mm; pozice{" "}
            {placement.x}, {placement.y} mm; rotace {placement.rotationDeg}°
          </p>
          {assetUrl(placement.url) && (
            <a href={assetUrl(placement.url)} target="_blank" rel="noopener noreferrer">
              Zobrazit podklad — {placement.printArea.name}
            </a>
          )}
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || order.isLocked) return;
          const data = new FormData(event.currentTarget),
            value = formText(data, "unitPrice").trim();
          const unitPrice = value ? parsePrice(value) : null,
            quantity = Number(formText(data, "quantity"));
          if (
            (value && unitPrice === null) ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 500
          ) {
            setError("Zadejte nezápornou cenu s nejvýše dvěma desetinnými místy a počet 1–500.");
            return;
          }
          setError("");
          if (
            unitPrice === null &&
            !window.confirm(
              "Vrátit položku do stavu bez ceny? Celková cena přestane být stanovená.",
            )
          )
            return;
          save(
            () => adminOrdersItemsPartialUpdate(order.id, item.id, { unitPrice, quantity }),
            "Cena a množství byly uložené; případné předchozí potvrzení bylo zrušené.",
          );
        }}
      >
        <fieldset className="checkout-fields" disabled={disabled || order.isLocked}>
          <legend>Nacenění položky</legend>
          <TextField
            label="Cena za kus (Kč)"
            name="unitPrice"
            defaultValue={item.unitPrice == null ? "" : (item.unitPrice / 100).toFixed(2)}
            helperText="Prázdné = neoceněno; 0 = zdarma."
            slotProps={{ htmlInput: { inputMode: "decimal" } }}
          />
          <TextField
            label="Počet kusů"
            name="quantity"
            type="number"
            defaultValue={item.quantity}
            required
            slotProps={{ htmlInput: { min: 1, max: 500, step: 1 } }}
          />
          {error && <p role="alert">{error}</p>}
          <Button type="submit">Uložit cenu a množství</Button>
        </fieldset>
      </form>
    </Paper>
  );
}
export function OrderPricing({
  order,
  disabled,
  save,
}: {
  order: AdminOrderDetail;
  disabled: boolean;
  save: SaveOrder;
}) {
  const [error, setError] = useState("");
  return (
    <section aria-label="Položky a nacenění">
      <h2>Položky a nacenění</h2>
      {order.items.map((item) => (
        <Item
          key={`${item.id}-${order.updatedAt}`}
          item={item}
          order={order}
          disabled={disabled}
          save={save}
        />
      ))}
      <p>
        Mezisoučet: {amount(order.subtotal)} · Doprava: {amount(order.shippingCost)} (
        {order.shippingCostManual ? "ruční cena" : "automatická cena"})
      </p>
      <p>
        Celkem: <strong>{amount(order.total)}</strong>
      </p>
      <form
        key={order.updatedAt}
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || order.isLocked) return;
          const price = parsePrice(formText(new FormData(event.currentTarget), "shippingCost"));
          if (price === null) {
            setError("Zadejte nezápornou cenu dopravy s nejvýše dvěma desetinnými místy.");
            return;
          }
          setError("");
          save(
            () => adminOrdersShippingCostUpdate(order.id, { shippingCost: price }),
            "Ruční cena dopravy byla uložená; potvrzení je potřeba obnovit.",
          );
        }}
      >
        <fieldset disabled={disabled || order.isLocked} className="checkout-fields">
          <legend>Cena dopravy</legend>
          <TextField
            label="Cena dopravy (Kč)"
            name="shippingCost"
            defaultValue={order.shippingCost == null ? "" : (order.shippingCost / 100).toFixed(2)}
            required
            slotProps={{ htmlInput: { inputMode: "decimal" } }}
          />
          {error && <p role="alert">{error}</p>}
          <Button type="submit">Nastavit ruční cenu dopravy</Button>
          <Button
            type="button"
            onClick={() => {
              if (window.confirm("Zrušit ruční cenu a přepočítat dopravu podle aktuálního ceníku?"))
                save(
                  () => adminOrdersShippingCostDestroy(order.id),
                  "Doprava byla přepočítaná podle ceníku.",
                );
            }}
          >
            Vrátit automatickou cenu dopravy
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
