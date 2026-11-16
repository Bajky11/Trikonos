import { useState } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import { adminOrdersPartialUpdate, useCatalogOptionsRetrieve } from "../../api/generated/api";
import type {
  AdminOrderAddress,
  AdminOrderDetail,
  PatchedAdminOrderUpdate,
} from "../../api/generated/models";
import { DeliveryTypeEnum, PaymentMethodEnum } from "../../api/generated/models";
import { formText } from "../catalog/forms";
import { deliveryTypes, paymentMethods } from "./labels";

export type SaveOrder = (request: () => Promise<AdminOrderDetail>, message: string) => void;
const fields = {
  fullName: "Jméno příjemce",
  companyName: "Firma",
  street: "Ulice a číslo",
  city: "Obec",
  zip: "PSČ",
  country: "Země (kód)",
  ico: "IČO",
  dic: "DIČ",
};

function Address({
  prefix,
  initial,
}: {
  prefix: "billing" | "shipping";
  initial: AdminOrderAddress;
}) {
  return (
    <fieldset className="checkout-fields">
      <legend>{prefix === "billing" ? "Fakturační adresa" : "Doručovací adresa"}</legend>
      {Object.entries(fields)
        .filter(([key]) => prefix === "billing" || !["ico", "dic"].includes(key))
        .map(([key, label]) => (
          <TextField
            key={key}
            label={label}
            name={`${prefix}.${key}`}
            defaultValue={initial[key as keyof AdminOrderAddress] ?? ""}
            required={["fullName", "street", "city", "zip", "country"].includes(key)}
            slotProps={{
              htmlInput: {
                maxLength: key === "country" ? 2 : ["ico", "dic", "zip"].includes(key) ? 20 : 255,
              },
            }}
          />
        ))}
    </fieldset>
  );
}

export function OrderEditor({
  order,
  disabled,
  save,
}: {
  order: AdminOrderDetail;
  disabled: boolean;
  save: SaveOrder;
}) {
  const options = useCatalogOptionsRetrieve();
  const [delivery, setDelivery] = useState(order.deliveryType || "");
  const [carrier, setCarrier] = useState(order.carrier?.id ?? "");
  const [payment, setPayment] = useState(order.paymentMethod || "");
  const carriers = [...(options.data?.carriers ?? [])];
  if (order.carrier && !carriers.some((value) => value.id === order.carrier?.id))
    carriers.push(order.carrier);
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || order.isLocked) return;
          const data = new FormData(event.currentTarget);
          const next: PatchedAdminOrderUpdate = { note: formText(data, "note") };
          for (const prefix of ["billing", "shipping"] as const) {
            const value = Object.fromEntries(
              Object.keys(fields)
                .filter((key) => prefix === "billing" || !["ico", "dic"].includes(key))
                .map((key) => [key, formText(data, `${prefix}.${key}`).trim()]),
            );
            const full: AdminOrderAddress = {
              fullName: value.fullName!,
              street: value.street!,
              city: value.city!,
              zip: value.zip!,
              country: value.country!,
              companyName: value.companyName!,
              ...(prefix === "billing" ? { ico: value.ico!, dic: value.dic! } : {}),
            };
            if (
              Object.entries(full).some(
                ([key, value]) => value !== (order[prefix][key as keyof AdminOrderAddress] ?? ""),
              )
            )
              next[prefix] = full;
          }
          if (
            delivery !== (order.deliveryType || "") ||
            (delivery !== "PERSONAL_PICKUP" && carrier !== (order.carrier?.id ?? ""))
          ) {
            next.deliveryType =
              Object.values(DeliveryTypeEnum).find((value) => value === delivery) ?? null;
            next.carrierId = delivery === "PERSONAL_PICKUP" ? null : carrier || null;
          }
          if (payment !== (order.paymentMethod || ""))
            next.paymentMethod =
              Object.values(PaymentMethodEnum).find((value) => value === payment) ?? null;
          if (delivery === "PICKUP_POINT") {
            for (const key of ["pickupPointId", "pickupPointName"] as const)
              if (formText(data, key) !== (order[key] ?? "")) next[key] = formText(data, key);
          } else if (order.pickupPointId || order.pickupPointName) {
            next.pickupPointId = "";
            next.pickupPointName = "";
          }
          if (next.note === (order.note ?? "")) delete next.note;
          if (!Object.keys(next).length) return;
          save(() => adminOrdersPartialUpdate(order.id, next), "Údaje objednávky byly uložené.");
        }}
      >
        <fieldset disabled={disabled || order.isLocked} className="checkout-fields">
          <legend>Údaje objednávky</legend>
          <Address prefix="billing" initial={order.billing} />
          <Address prefix="shipping" initial={order.shipping} />
          <TextField
            select
            label="Způsob doručení"
            disabled={disabled || order.isLocked}
            value={delivery}
            onChange={(event) =>
              setDelivery(
                Object.values(DeliveryTypeEnum).find((value) => value === event.target.value) ?? "",
              )
            }
          >
            <MenuItem value="">Neurčeno</MenuItem>
            {Object.entries(deliveryTypes).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          {delivery !== "PERSONAL_PICKUP" && (
            <TextField
              select
              label="Dopravce"
              disabled={disabled || order.isLocked}
              value={carrier}
              onChange={(event) => setCarrier(event.target.value)}
            >
              <MenuItem value="">Neurčen</MenuItem>
              {carriers.map((value) => (
                <MenuItem key={value.id} value={value.id}>
                  {value.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {delivery === "PICKUP_POINT" && (
            <>
              <TextField
                name="pickupPointId"
                label="ID výdejního místa"
                required
                defaultValue={order.pickupPointId}
              />
              <TextField
                name="pickupPointName"
                label="Název výdejního místa"
                required
                defaultValue={order.pickupPointName}
              />
            </>
          )}
          <TextField
            select
            label="Platební metoda"
            disabled={disabled || order.isLocked}
            value={payment}
            onChange={(event) =>
              setPayment(
                Object.values(PaymentMethodEnum).find((value) => value === event.target.value) ??
                  "",
              )
            }
          >
            <MenuItem value="">Neurčena</MenuItem>
            {Object.entries(paymentMethods).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            name="note"
            label="Poznámka k objednávce"
            multiline
            defaultValue={order.note}
          />
          <p>
            Změna dopravy nebo platební metody zruší potvrzení; automatická cena dopravy se
            přepočítá. Ruční cena zůstane zachovaná.
          </p>
          <Button type="submit" variant="outlined">
            Uložit údaje objednávky
          </Button>
        </fieldset>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          const trackingNumber = formText(
            new FormData(event.currentTarget),
            "trackingNumber",
          ).trim();
          save(
            () => adminOrdersPartialUpdate(order.id, { trackingNumber }),
            "Sledovací číslo bylo uložené.",
          );
        }}
      >
        <fieldset disabled={disabled} className="checkout-fields">
          <legend>Sledování zásilky</legend>
          <TextField
            label="Sledovací číslo"
            name="trackingNumber"
            defaultValue={order.trackingNumber}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <Button type="submit">Uložit sledovací číslo</Button>
        </fieldset>
      </form>
    </>
  );
}
