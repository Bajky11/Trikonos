import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Checkbox, FormControlLabel, MenuItem, Paper, TextField } from "@mui/material";
import {
  adminOrdersCreate,
  getAdminAuthMeRetrieveQueryKey,
  getAdminOrdersRetrieveQueryKey,
  useCatalogOptionsRetrieve,
} from "../../api/generated/api";
import { DeliveryTypeEnum, PaymentMethodEnum } from "../../api/generated/models";
import type { Me, OrderCreate } from "../../api/generated/models";
import { ApiError } from "../../api/http";
import { withCsrf } from "../../auth/csrf";
import { useSession } from "../../auth/session";
import { AddressFields, address, text } from "../../checkout/forms";
import { catalogError, parsePrice } from "../catalog/forms";
import { deliveryTypes, paymentMethods } from "./labels";
import { ManualItemForm } from "./ManualItemForm";
import type { ManualLine } from "./ManualItemForm";
import { clearManual, readManual, storeManual } from "./manualSession";
import type { ManualRecord } from "./manualSession";

export function ManualOrderPage() {
  const session = useSession(),
    options = useCatalogOptionsRetrieve(),
    navigate = useNavigate(),
    client = useQueryClient();
  const [record, setRecord] = useState<ManualRecord | null>(readManual),
    [items, setItems] = useState<ManualLine[]>([]);
  const [same, setSame] = useState(true),
    [delivery, setDelivery] = useState<DeliveryTypeEnum>(DeliveryTypeEnum.PERSONAL_PICKUP),
    [payment, setPayment] = useState<PaymentMethodEnum>(PaymentMethodEnum.BANK_TRANSFER),
    [error, setError] = useState("");
  const active = useRef(false);
  const create = useMutation({
    mutationKey: ["admin-manual-order"],
    mutationFn: (body: OrderCreate) => withCsrf(() => adminOrdersCreate(body)),
    retry: false,
    gcTime: 0,
  });
  const send = (attempt: Extract<ManualRecord, { kind: "pending" }>) => {
    if (active.current || attempt.actorId !== session.data?.id) return;
    active.current = true;
    setError("");
    void create
      .mutateAsync(attempt.body)
      .then(async (result) => {
        if (!result.id || result.id !== attempt.body.orderId)
          throw new Error("Invalid order response");
        const received: ManualRecord = { kind: "created", actorId: attempt.actorId, id: result.id };
        try {
          storeManual(received);
        } catch {
          /* Old pending body can safely replay this same orderId. */
        }
        setRecord(received);
        if (
          client.getQueryData<Me | null>(getAdminAuthMeRetrieveQueryKey())?.id !== attempt.actorId
        )
          return;
        client.setQueryData(getAdminOrdersRetrieveQueryKey(result.id), result);
        await client.invalidateQueries({ queryKey: ["/api/v1/admin/orders"] });
        await navigate(`/admin/objednavky/${result.id}`, { replace: true });
      })
      .catch((error: unknown) => {
        const uncertain = attempt.uncertain || !(error instanceof ApiError) || error.status >= 500;
        if (!uncertain) {
          try {
            clearManual();
            setRecord(null);
          } catch {
            /* Keep the immutable attempt on disk. */
          }
        } else {
          setRecord(attempt);
        }
        setError(
          uncertain
            ? `Výsledek založení není potvrzený. Dokončete tentýž pokus se stejným orderId; nevytvářejte nový. ${catalogError(error)}`
            : catalogError(error),
        );
      })
      .finally(() => {
        active.current = false;
        create.reset();
      });
  };
  if (record && record.actorId !== session.data?.id)
    return (
      <Paper className="admin-panel admin-panel-body">
        <h2>Rozpracovaná ruční objednávka</h2>
        <p role="alert">
          Tato karta má záznam jiného administrátora. Přihlaste původní účet; jeho údaje zde
          nezobrazujeme.
        </p>
      </Paper>
    );
  if (record?.kind === "created")
    return (
      <Paper className="admin-panel admin-panel-body">
        <h2>Objednávka již byla založená</h2>
        <Button component={Link} to={`/admin/objednavky/${record.id}`}>
          Otevřít založenou objednávku
        </Button>
        <Button
          onClick={() => {
            try {
              clearManual();
              setRecord(null);
              setItems([]);
            } catch {
              setError("Záznam nelze vymazat z úložiště.");
            }
          }}
        >
          Začít další ruční objednávku
        </Button>
        {error && <p role="alert">{error}</p>}
      </Paper>
    );
  if (record?.kind === "pending")
    return (
      <Paper className="admin-panel admin-panel-body">
        <h2>Dokončit ruční založení</h2>
        <p>
          Pokus pro {record.body.customer.email} zůstává neměnný i po reloadu. Nezavírejte tuto
          kartu před ověřením výsledku.
        </p>
        {error && <p role="alert">{error}</p>}
        <Button disabled={create.isPending} onClick={() => send({ ...record, uncertain: true })}>
          Dokončit stejné založení
        </Button>
      </Paper>
    );
  return (
    <Paper className="admin-panel admin-panel-body admin-detail" variant="outlined">
      <h2>Ruční objednávka</h2>
      <p>
        Samostatný návrh bez zásahu do zákaznického košíku. Založení může vyvolat e-mail o přijetí.
        Cenu je pak nutné zkontrolovat a potvrdit v detailu. Formulář je pro adresy v ČR.
      </p>
      <ManualItemForm
        disabled={create.isPending || items.length >= 100}
        add={(item) => setItems((current) => [...current, item])}
      />
      <section aria-label="Položky ruční objednávky">
        <h3>Přidané položky</h3>
        {items.map((item, index) => (
          <p key={index}>
            {item.label} · {item.input.quantity} ks ·{" "}
            {item.input.unitPrice == null
              ? "cena ze serveru / k nacenění"
              : `${item.input.unitPrice / 100} Kč za kus`}{" "}
            <Button
              disabled={create.isPending}
              onClick={() => setItems((current) => current.filter((_, row) => row !== index))}
            >
              Odebrat položku {index + 1}
            </Button>
          </p>
        ))}
      </section>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (active.current || !session.data || !items.length) return;
          const data = new FormData(event.currentTarget),
            shippingText = text(data, "shippingCost"),
            shippingCost = shippingText ? parsePrice(shippingText) : null;
          if (shippingText && shippingCost === null) {
            setError("Neplatná ruční cena dopravy.");
            return;
          }
          if (
            !window.confirm(
              `Založit objednávku pro ${text(data, "email")} s ${items.length} položkami? Cena a dostupnost se ověří na serveru; nejde ještě o potvrzení nabídky.`,
            )
          )
            return;
          const firstName = text(data, "firstName"),
            lastName = text(data, "lastName"),
            billing = address(data, "billing");
          const body: OrderCreate = {
            orderId: crypto.randomUUID(),
            customer: {
              email: text(data, "email"),
              phone: text(data, "phone"),
              firstName,
              lastName,
              companyName: billing.companyName,
              marketingConsent: data.get("marketingConsent") === "on",
            },
            billing: {
              ...billing,
              fullName: billing.fullName || `${firstName} ${lastName}`,
              ico: text(data, "billing.ico"),
              dic: text(data, "billing.dic"),
            },
            shipping: same
              ? { sameAsBilling: true }
              : { sameAsBilling: false, ...address(data, "shipping") },
            delivery: {
              deliveryType: delivery,
              ...(delivery !== "PERSONAL_PICKUP" ? { carrierId: text(data, "carrierId") } : {}),
              ...(delivery === "PICKUP_POINT"
                ? {
                    pickupPointId: text(data, "pickupPointId"),
                    pickupPointName: text(data, "pickupPointName"),
                  }
                : {}),
            },
            paymentMethod: payment,
            note: text(data, "note"),
            items: items.map((item) => item.input),
            ...(shippingCost !== null ? { shippingCost } : {}),
          };
          const attempt: ManualRecord = { kind: "pending", actorId: session.data.id, body };
          try {
            storeManual(attempt);
          } catch {
            setError("Pokus nelze bezpečně uložit do sessionStorage. Objednávka nebyla odeslaná.");
            return;
          }
          send(attempt);
        }}
      >
        <fieldset className="checkout-fields" disabled={create.isPending}>
          <legend>Kontakt a doručení ruční objednávky</legend>
          <TextField
            label="Jméno zákazníka"
            name="firstName"
            required
            slotProps={{ htmlInput: { maxLength: 255 } }}
          />
          <TextField
            label="Příjmení zákazníka"
            name="lastName"
            required
            slotProps={{ htmlInput: { maxLength: 255 } }}
          />
          <TextField label="E-mail zákazníka" name="email" type="email" required />
          <TextField
            label="Telefon zákazníka"
            name="phone"
            type="tel"
            slotProps={{ htmlInput: { maxLength: 30 } }}
          />
          <AddressFields prefix="billing" company />
          <FormControlLabel
            label="Doručovací adresa stejná jako fakturační"
            control={
              <Checkbox checked={same} onChange={(event) => setSame(event.target.checked)} />
            }
          />
          {!same && <AddressFields prefix="shipping" />}
          <TextField
            select
            label="Doručení ruční objednávky"
            value={delivery}
            onChange={(event) =>
              setDelivery(
                Object.values(DeliveryTypeEnum).find((value) => value === event.target.value) ??
                  DeliveryTypeEnum.PERSONAL_PICKUP,
              )
            }
          >
            {Object.entries(deliveryTypes).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          {delivery !== "PERSONAL_PICKUP" && (
            <TextField
              select
              label="Dopravce ruční objednávky"
              name="carrierId"
              defaultValue=""
              required
            >
              <MenuItem value="">Vyberte dopravce</MenuItem>
              {options.data?.carriers.map((carrier) => (
                <MenuItem key={carrier.id} value={carrier.id}>
                  {carrier.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {delivery === "PICKUP_POINT" && (
            <>
              <TextField name="pickupPointId" label="ID výdejního místa" required />
              <TextField name="pickupPointName" label="Název výdejního místa" required />
            </>
          )}
          <TextField
            select
            label="Platba ruční objednávky"
            value={payment}
            onChange={(event) =>
              setPayment(
                Object.values(PaymentMethodEnum).find((value) => value === event.target.value) ??
                  PaymentMethodEnum.BANK_TRANSFER,
              )
            }
          >
            {Object.entries(paymentMethods).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Ruční doprava (Kč)"
            name="shippingCost"
            helperText="Prázdné = automatický ceník; při zvoleném dopravci backend vyžaduje sazbu i před ručním override."
          />
          <TextField label="Poznámka ruční objednávky" name="note" multiline />
          <FormControlLabel
            label="Marketingový souhlas zákazníka (jen pokud byl skutečně udělen)"
            control={<Checkbox name="marketingConsent" />}
          />
          {error && <p role="alert">{error}</p>}
          <Button
            type="submit"
            variant="contained"
            disabled={!items.length || create.isPending || !session.data}
          >
            Založit ruční objednávku
          </Button>
        </fieldset>
      </form>
    </Paper>
  );
}
