import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, MenuItem, TextField } from "@mui/material";
import {
  adminOrdersRetrieve,
  adminOrdersShipmentCreate,
  adminOrdersShipmentLabelRetrieve,
  adminOrdersShipmentStatusRetrieve,
  adminOrdersShipmentStatusPartialUpdate,
  adminOrdersResendEmailCreate,
} from "../../api/generated/api";
import type { AdminOrderDetail, AdminResendEmail } from "../../api/generated/models";
import { ApiError } from "../../api/http";
import { formText } from "../catalog/forms";
import type { SaveOrder } from "./OrderEditor";
import { shipmentStatuses } from "./labels";
import {
  clearShipmentAttempt,
  hasShipmentAttempt,
  shipmentAttemptKey,
  startShipmentAttempt,
} from "./shipmentAttempt";
import { downloadLabel } from "./files";

function initialBlocked(id: string) {
  try {
    return hasShipmentAttempt(id);
  } catch {
    return true;
  }
}
const shipmentSequence = [
  "CREATED",
  "LABEL_PRINTED",
  "HANDED_OVER",
  "IN_TRANSIT",
  "DELIVERED",
  "RETURNED",
];
const emailTypes: [AdminResendEmail["type"], string][] = [
  ["ORDER_RECEIVED", "Přijetí objednávky"],
  ["ORDER_CONFIRMED", "Potvrzení ceny"],
  ["ORDER_SHIPPED", "Odeslání objednávky"],
  ["ORDER_CANCELLED", "Zrušení objednávky"],
];

export function OrderShipping({
  order,
  disabled,
  save,
}: {
  order: AdminOrderDetail;
  disabled: boolean;
  save: SaveOrder;
}) {
  const [blocked, setBlocked] = useState(() => initialBlocked(order.id));
  const [error, setError] = useState("");
  const [emailType, setEmailType] = useState("ORDER_RECEIVED");
  useEffect(() => {
    if (order.carrierShipmentId) {
      try {
        clearShipmentAttempt(order.id);
        setBlocked(false);
      } catch {
        /* Known carrier ID still prevents another creation. */
      }
    }
  }, [order.id, order.carrierShipmentId]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === shipmentAttemptKey(order.id) || event.key === null)
        setBlocked(initialBlocked(order.id));
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [order.id]);
  const hasShipment = !!order.carrierShipmentId;
  const packeta = order.carrier?.code === "PACKETA";
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("cs");
  const recipientCompatible =
    normalize(order.shipping.fullName) ===
      normalize(`${order.customer.firstName ?? ""} ${order.customer.lastName ?? ""}`) &&
    normalize(order.shipping.companyName ?? "") === normalize(order.customer.companyName ?? "");
  // Creating a carrier packet is only offered once the operator put the order into production.
  const canCreate =
    packeta &&
    recipientCompatible &&
    order.status === "PROCESSING" &&
    ["HOME_DELIVERY", "PICKUP_POINT"].includes(order.deliveryType || "") &&
    order.total != null;
  const rank = shipmentSequence.indexOf(order.shipmentStatus || "CREATED");
  const transitions = ["PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status || "")
    ? shipmentSequence.filter((value, index) => index > rank && (value !== "RETURNED" || rank >= 2))
    : [];
  const fresh = () => adminOrdersRetrieve(order.id, { cache: "no-store" });
  const availableEmails = emailTypes.filter(
    ([type]) =>
      type === "ORDER_RECEIVED" ||
      (type === "ORDER_CONFIRMED" && order.confirmedAt && order.total != null) ||
      (type === "ORDER_SHIPPED" && ["SHIPPED", "DELIVERED"].includes(order.status || "")) ||
      (type === "ORDER_CANCELLED" && order.status === "CANCELLED"),
  );
  const selectedEmail = availableEmails.some(([type]) => type === emailType)
    ? emailType
    : "ORDER_RECEIVED";
  return (
    <section aria-label="Expedice a e-maily">
      <h2>Expedice a e-maily</h2>
      <Button component={Link} to={`/admin/objednavky/${order.id}/tisk`}>
        Výrobní list
      </Button>
      <p>
        Zásilka: {shipmentStatuses[order.shipmentStatus || ""] ?? order.shipmentStatus} · Dopravce:{" "}
        {order.carrier?.name ?? "není nastaven"}
      </p>
      {hasShipment ? (
        <p>
          ID u dopravce: {order.carrierShipmentId} · Sledovací číslo:{" "}
          {order.trackingNumber || "není uvedeno"}
        </p>
      ) : (
        <>
          <p>
            Vytvoření přes API je dostupné jen pro Packetu, doručení na adresu/výdejní místo a
            oceněnou objednávku ve výrobě. Ostatní dopravce ani osobní odběr toto API nezakládá.
          </p>
          {!recipientCompatible && (
            <p role="alert">
              Příjemce nebo firma v doručovací adrese se liší od kontaktu zákazníka. Současný
              backend předává Packetě jméno a firmu zákazníka, nikoli odlišného příjemce. Vytvoření
              přes toto API je proto blokované; zásilku vyřešte přímo u dopravce.
            </p>
          )}
          {blocked && (
            <div role="alert">
              <p>
                Existuje neověřený pokus o vytvoření zásilky. I když objednávka zatím nemá ID
                zásilky, u Packety už mohla vzniknout. Ověřte ji podle čísla objednávky v
                administraci Packety; pouhé načtení objednávky nestačí.
              </p>
              <Button
                disabled={disabled}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Ověřili jste přímo u Packety, že zásilka pro tuto objednávku NEVZNIKLA? Nový pokus může jinak vytvořit placený duplikát.",
                    )
                  )
                    return;
                  try {
                    clearShipmentAttempt(order.id);
                    setBlocked(false);
                    setError("");
                  } catch {
                    setError(
                      "Úložiště prohlížeče není dostupné; vytvoření zásilky zůstává blokované.",
                    );
                  }
                }}
              >
                Po ověření u Packety povolit nový pokus
              </Button>
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (disabled || !canCreate || blocked) return;
              const weight = formText(new FormData(event.currentTarget), "weight")
                .trim()
                .replace(",", ".");
              if (!/^\d{1,3}(?:\.\d{1,3})?$/.test(weight) || Number(weight) <= 0) {
                setError(
                  "Zadejte skutečnou hmotnost 0,001–999,999 kg, nejvýše na tři desetinná místa.",
                );
                return;
              }
              if (
                !window.confirm(
                  `Vytvořit zásilku u Packety pro ${order.orderNumber} (${weight} kg)? Ověřte adresu, telefon, cenu a případnou dobírku.`,
                )
              )
                return;
              try {
                startShipmentAttempt(order.id);
                setBlocked(true);
                setError("");
              } catch {
                setBlocked(true);
                setError(
                  "Pokus nelze bezpečně uložit nebo už existuje. Vytvoření je blokované; ověřte původní zásilku.",
                );
                return;
              }
              save(async () => {
                try {
                  const updated = await adminOrdersShipmentCreate(order.id, { weight });
                  if (!updated.carrierShipmentId) throw new Error("Missing carrier shipment ID");
                  try {
                    clearShipmentAttempt(order.id);
                  } catch {
                    /* Known ID prevents retry. */
                  }
                  return updated;
                } catch (error) {
                  // 5xx / network may follow a successful carrier call. Never unlock on refresh alone.
                  if (
                    error instanceof ApiError &&
                    [400, 401, 403, 404, 409, 422, 429].includes(error.status)
                  ) {
                    try {
                      clearShipmentAttempt(order.id);
                      setBlocked(false);
                    } catch {
                      /* Fail closed. */
                    }
                  }
                  throw error;
                }
              }, "Zásilka byla založená u dopravce. Stav objednávky se tím nemění.");
            }}
          >
            <fieldset className="checkout-fields" disabled={disabled || !canCreate || blocked}>
              <legend>Nová zásilka Packeta</legend>
              <TextField
                label="Hmotnost zásilky (kg)"
                name="weight"
                required
                helperText="Skutečná hmotnost po zabalení; žádný automatický odhad."
                slotProps={{ htmlInput: { inputMode: "decimal" } }}
              />
              <Button type="submit" variant="contained">
                Vytvořit zásilku u Packety
              </Button>
            </fieldset>
          </form>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <Button
        disabled={disabled || !hasShipment || !packeta}
        onClick={() =>
          save(async () => {
            const blob = await adminOrdersShipmentLabelRetrieve(order.id, {
              cache: "no-store",
              headers: { Accept: "application/pdf" },
            });
            downloadLabel(blob, order.orderNumber);
            return fresh();
          }, "PDF štítek byl předán ke stažení. Stav zásilky byl znovu načtený.")
        }
      >
        Stáhnout PDF štítek
      </Button>
      <Button
        disabled={disabled || !hasShipment || !packeta}
        onClick={() =>
          save(
            () => adminOrdersShipmentStatusRetrieve(order.id, { cache: "no-store" }),
            "Stav zásilky byl ověřený u Packety; hlavní stav objednávky se tím nemění.",
          )
        }
      >
        Ověřit stav u Packety
      </Button>
      <p>
        Stažení štítku může označit štítek jako vytištěný. Synchronizace mění jen stav zásilky,
        nikoli stav objednávky či platby. Dokončení objednávky proveďte samostatnou stavovou akcí.
      </p>
      <div>
        <h3>Ruční evidence zásilky</h3>
        {transitions.map((shipmentStatus) => (
          <Button
            key={shipmentStatus}
            disabled={disabled}
            onClick={() => {
              if (
                window.confirm(
                  `Evidovat zásilku jako „${shipmentStatuses[shipmentStatus]}“? Nevolá se tím dopravce ani neposílá e-mail.`,
                )
              )
                save(
                  () => adminOrdersShipmentStatusPartialUpdate(order.id, { shipmentStatus }),
                  "Stav zásilky byl uložený; stav objednávky se nezměnil.",
                );
            }}
          >
            {shipmentStatuses[shipmentStatus]}
          </Button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          const type = formText(new FormData(event.currentTarget), "emailType");
          const selected = availableEmails.find(([value]) => value === type);
          if (
            !selected ||
            !window.confirm(
              `Znovu vyvolat e-mail „${selected[1]}“ pro ${order.customer.email}? Použijí se aktuální data objednávky.`,
            )
          )
            return;
          save(async () => {
            await adminOrdersResendEmailCreate(order.id, { type: selected[0] });
            return fresh();
          }, "Bylo vyvoláno přeposlání e-mailu. Doručení závisí na nakonfigurovaném e-mailovém backendu.");
        }}
      >
        <fieldset className="checkout-fields" disabled={disabled}>
          <legend>Znovu odeslat e-mail</legend>
          <TextField
            select
            name="emailType"
            label="Typ e-mailu"
            value={selectedEmail}
            onChange={(event) => setEmailType(event.target.value)}
            disabled={disabled}
          >
            {availableEmails.map(([type, label]) => (
              <MenuItem key={type} value={type}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <Button type="submit">Znovu odeslat e-mail</Button>
        </fieldset>
      </form>
    </section>
  );
}
