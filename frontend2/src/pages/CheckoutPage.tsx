import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import {
  adminAuthCsrfRetrieve,
  cartValidateCreate,
  ordersCreate,
  useCatalogOptionsRetrieve,
  useConfigRetrieve,
} from "../api/generated/api";
import { DeliveryTypeEnum, PaymentMethodEnum } from "../api/generated/models";
import type { CartValidateResponse, OrderCreate } from "../api/generated/models";
import { ApiError } from "../api/http";
import { withCsrf } from "../auth/csrf";
import { validationLines, cartError } from "../cart/validation";
import { useShop } from "../components/ShopContext";
import { CatalogFeedback } from "../components/Products";
import { AddressFields, address, checkoutError, text } from "../checkout/forms";
import {
  clearCheckout,
  readCheckout,
  rememberReceipt,
  safeTermsUrl,
  saveAttempt,
} from "../checkout/session";
import type { Attempt } from "../checkout/session";
import { money } from "../data/catalog";
import { useTitle } from "../useTitle";

const priceKey = (result: CartValidateResponse) =>
  JSON.stringify([
    result.items,
    result.subtotal,
    result.shippingCost,
    result.total,
    result.requiresQuote,
  ]);

export function CheckoutPage() {
  useTitle("Pokladna — Trikonoš");
  const shop = useShop();
  const navigate = useNavigate();
  const client = useQueryClient();
  const config = useConfigRetrieve();
  const options = useCatalogOptionsRetrieve();
  const [record, setRecord] = useState(readCheckout);
  const [attempt, setAttempt] = useState<Attempt | null>(() => {
    const value = readCheckout();
    return value?.kind === "pending" ? { ...value, uncertain: true } : null;
  });
  const [delivery, setDelivery] = useState<DeliveryTypeEnum | "">("");
  const [payment, setPayment] = useState<PaymentMethodEnum | "">("");
  const [carrierId, setCarrierId] = useState("");
  const [sameAddress, setSameAddress] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const activeSend = useRef(false);
  const preparing = useRef(false);
  const cartKey = JSON.stringify(shop.items);
  const lines = validationLines(shop.items);
  const items = lines.flatMap((line) => (line.input ? [line.input] : []));
  const eligible = shop.items.length > 0 && items.length === shop.items.length;
  const termsUrl = safeTermsUrl(config.data?.termsUrl);
  const deliveryChoices = (config.data?.deliveryTypes ?? []).filter((choice) =>
    [DeliveryTypeEnum.PERSONAL_PICKUP, DeliveryTypeEnum.HOME_DELIVERY].some(
      (value) => value === choice.value,
    ),
  );
  const paymentChoices = (config.data?.paymentMethods ?? []).filter((choice) =>
    [PaymentMethodEnum.BANK_TRANSFER, PaymentMethodEnum.CASH_ON_DELIVERY].some(
      (value) => value === choice.value,
    ),
  );
  const carrierValid =
    delivery === DeliveryTypeEnum.PERSONAL_PICKUP ||
    !!options.data?.carriers.some((carrier) => carrier.id === carrierId);
  const request = {
    items,
    ...(delivery ? { deliveryType: delivery } : {}),
    ...(payment ? { paymentMethod: payment } : {}),
    ...(delivery === DeliveryTypeEnum.HOME_DELIVERY ? { carrierId } : {}),
  };
  const previewKey = ["checkout-preview", request];
  const preview = useQuery({
    queryKey: previewKey,
    queryFn: ({ signal }) => withCsrf(() => cartValidateCreate(request, { signal })),
    enabled: !attempt && eligible && !!delivery && !!payment && carrierValid,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const order = useMutation({
    mutationKey: ["checkout-order"],
    mutationFn: (body: OrderCreate) => ordersCreate(body, { referrerPolicy: "no-referrer" }),
    retry: false,
    gcTime: 0,
  });
  const busy = checking || order.isPending;
  const priced =
    preview.isSuccess &&
    !preview.isFetching &&
    preview.data.items.length === items.length &&
    preview.data.items.every((item) => item.valid) &&
    preview.data.shippingCost !== null &&
    (preview.data.requiresQuote || preview.data.total !== null);

  const send = async (current: Attempt) => {
    if (activeSend.current || !termsUrl) return;
    activeSend.current = true;
    setError("");
    shop.lockCheckout(true);
    let posted = false;
    try {
      await adminAuthCsrfRetrieve({ cache: "no-store" });
      posted = true;
      const response = await order.mutateAsync(current.body);
      if (!response.accessToken || !response.orderNumber) throw new Error("Invalid order response");
      rememberReceipt({
        kind: "receipt",
        response,
        cartKey: current.cartKey,
        createdAt: Date.now(),
      });
      shop.completeCheckout(current.cartKey);
      shop.lockCheckout(false);
      await navigate("/objednavka", { replace: true });
    } catch (error) {
      const uncertain =
        current.uncertain || (posted && (!(error instanceof ApiError) || error.status >= 500));
      if (uncertain) {
        const next = { ...current, uncertain: true };
        try {
          saveAttempt(next);
        } catch {
          /* Original immutable attempt is already saved. */
        }
        setAttempt(next);
      } else {
        try {
          clearCheckout();
          setAttempt(null);
          shop.lockCheckout(false);
        } catch {
          setAttempt({ ...current, uncertain: true });
        }
      }
      setError(checkoutError(error));
      if (error instanceof ApiError && error.code === "PRICE_CHANGED")
        void client.invalidateQueries({ queryKey: ["checkout-preview"] });
    } finally {
      activeSend.current = false;
      order.reset();
    }
  };

  if (attempt)
    return (
      <main className="shell page-main">
        <Typography variant="h1">Dokončení odeslání</Typography>
        <p>
          Výsledek původního odeslání není potvrzený. Košík je uzamčený, aby nevznikla jiná
          objednávka omylem. Dokončení zopakuje přesně stejný požadavek se stejným orderId.
        </p>
        <p>
          Nezavírejte tuto kartu, dokud výsledek neověříte. Obnova používá sessionStorage této
          karty.
        </p>
        <p>Kontakt z původního pokusu: {attempt.body.customer.email}</p>
        {error && <p role="alert">{error}</p>}
        {!termsUrl && (
          <p role="alert">Chybí URL schválených obchodních podmínek. Odeslání není povolené.</p>
        )}
        <Button variant="contained" disabled={busy || !termsUrl} onClick={() => void send(attempt)}>
          {busy ? "Dokončování…" : "Dokončit stejné odeslání"}
        </Button>
        <p>
          Pokud dokončení opakovaně selhává, kontaktujte obchod. Nevytvářejte nový pokus, dokud
          neověříte, zda původní objednávka existuje.
        </p>
        <p>Identifikátor původního pokusu: {attempt.body.orderId}</p>
      </main>
    );

  if (record?.kind === "receipt" && record.cartKey === cartKey)
    return (
      <main className="shell page-main">
        <Typography variant="h1">Tento košík už byl přijat</Typography>
        <p>Objednávka {record.response.orderNumber}. Nevytvářejte omylem druhou.</p>
        <Button component={Link} to="/objednavka">
          Zobrazit potvrzení
        </Button>
        <Button
          onClick={() => {
            if (
              window.confirm(
                "Opravdu chcete vytvořit další samostatnou objednávku se stejnými položkami?",
              )
            ) {
              try {
                clearCheckout();
                setRecord(null);
              } catch {
                setError(
                  "Nelze vymazat údaje předchozího pokusu. Zkontrolujte úložiště prohlížeče.",
                );
              }
            }
          }}
        >
          Začít novou samostatnou objednávku
        </Button>
        {error && <p role="alert">{error}</p>}
      </main>
    );

  return (
    <main className="shell page-main checkout-page">
      <Typography variant="h1">Pokladna</Typography>
      <CatalogFeedback query={config} label="Konfigurace objednání" />
      <CatalogFeedback query={options} label="Dopravci" />
      {!eligible ? (
        <>
          <p role="alert">
            Košík je prázdný nebo obsahuje neověřitelný návrh či prošlý podklad. Nejdříve jej
            opravte; žádná položka se při objednání potichu nevynechá.
          </p>
          <Button component={Link} to="/kosik">
            Zpět do košíku
          </Button>
        </>
      ) : (
        <>
          {!termsUrl && (
            <p role="alert">
              Objednání zatím není dostupné: chybí URL schválených obchodních podmínek.
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (
                preparing.current ||
                busy ||
                !priced ||
                !termsUrl ||
                !delivery ||
                !payment ||
                !carrierValid
              )
                return;
              const data = new FormData(event.currentTarget);
              if (data.get("termsAccepted") !== "on") return;
              preparing.current = true;
              setError("");
              setChecking(true);
              shop.lockCheckout(true);
              const expected = preview.data;
              void withCsrf(() => cartValidateCreate(request))
                .then(async (fresh) => {
                  if (
                    fresh.items.length !== items.length ||
                    !fresh.items.every((item) => item.valid) ||
                    fresh.shippingCost === null ||
                    priceKey(fresh) !== priceKey(expected)
                  ) {
                    client.setQueryData(previewKey, fresh);
                    shop.lockCheckout(false);
                    setError(
                      "Ceny nebo dostupnost se změnily. Zkontrolujte nové shrnutí a odešlete znovu.",
                    );
                    return;
                  }
                  const billing = address(data, "billing");
                  const firstName = text(data, "firstName"),
                    lastName = text(data, "lastName");
                  const body: OrderCreate = {
                    orderId: crypto.randomUUID(),
                    items,
                    termsAccepted: true,
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
                    shipping: sameAddress
                      ? { sameAsBilling: true }
                      : { sameAsBilling: false, ...address(data, "shipping") },
                    delivery: {
                      deliveryType: delivery,
                      ...(delivery === DeliveryTypeEnum.HOME_DELIVERY ? { carrierId } : {}),
                    },
                    paymentMethod: payment,
                    note: text(data, "note"),
                    expectedTotal: fresh.total,
                    expectedShippingCost: fresh.shippingCost,
                  };
                  const next: Attempt = {
                    kind: "pending",
                    body,
                    cartKey,
                    createdAt: Date.now(),
                    uncertain: false,
                  };
                  try {
                    saveAttempt(next);
                  } catch {
                    shop.lockCheckout(false);
                    setError(
                      "Pokus nelze bezpečně uložit pro opakování. Povolte sessionStorage; objednávka nebyla odeslána.",
                    );
                    return;
                  }
                  await send(next);
                })
                .catch((error: unknown) => {
                  shop.lockCheckout(false);
                  setError(cartError(error));
                })
                .finally(() => {
                  preparing.current = false;
                  setChecking(false);
                });
            }}
          >
            <fieldset disabled={busy} className="checkout-fields">
              <legend>Kontakt a fakturační údaje</legend>
              <TextField
                label="Jméno"
                name="firstName"
                required
                slotProps={{ htmlInput: { maxLength: 100, autoComplete: "given-name" } }}
              />
              <TextField
                label="Příjmení"
                name="lastName"
                required
                slotProps={{ htmlInput: { maxLength: 100, autoComplete: "family-name" } }}
              />
              <TextField
                label="E-mail"
                type="email"
                name="email"
                required
                slotProps={{ htmlInput: { maxLength: 254, autoComplete: "email" } }}
              />
              <TextField
                label="Telefon"
                type="tel"
                name="phone"
                required
                slotProps={{ htmlInput: { maxLength: 30, autoComplete: "tel" } }}
              />
              <AddressFields prefix="billing" company />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={sameAddress}
                    onChange={(event) => setSameAddress(event.target.checked)}
                  />
                }
                label="Doručovací adresa je stejná jako fakturační"
              />
              <fieldset
                hidden={sameAddress}
                disabled={sameAddress || busy}
                className="checkout-fields"
              >
                <legend>Doručovací adresa</legend>
                <AddressFields prefix="shipping" />
              </fieldset>
              <TextField
                label="Způsob doručení"
                select
                required
                value={delivery}
                onChange={(event) => {
                  setDelivery(
                    Object.values(DeliveryTypeEnum).find((value) => value === event.target.value) ??
                      "",
                  );
                  setError("");
                }}
              >
                <MenuItem value="">Vyberte doručení</MenuItem>
                {deliveryChoices.map((choice) => (
                  <MenuItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </MenuItem>
                ))}
              </TextField>
              {delivery === DeliveryTypeEnum.HOME_DELIVERY && (
                <TextField
                  label="Dopravce"
                  select
                  required
                  value={carrierId}
                  disabled={!options.isSuccess}
                  onChange={(event) => setCarrierId(event.target.value)}
                >
                  <MenuItem value="">Vyberte dopravce</MenuItem>
                  {(options.data?.carriers ?? []).map((carrier) => (
                    <MenuItem key={carrier.id} value={carrier.id}>
                      {carrier.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <TextField
                label="Způsob platby"
                select
                required
                value={payment}
                onChange={(event) => {
                  setPayment(
                    Object.values(PaymentMethodEnum).find(
                      (value) => value === event.target.value,
                    ) ?? "",
                  );
                  setError("");
                }}
              >
                <MenuItem value="">Vyberte platbu</MenuItem>
                {paymentChoices.map((choice) => (
                  <MenuItem key={choice.value} value={choice.value}>
                    {choice.value === PaymentMethodEnum.CASH_ON_DELIVERY &&
                    delivery === DeliveryTypeEnum.PERSONAL_PICKUP
                      ? "Při převzetí na prodejně"
                      : choice.label}
                  </MenuItem>
                ))}
              </TextField>
              <p>
                Výdejní místa, faktura se splatností a online platební brána nejsou v tomto kroku
                dostupné.
              </p>
              <TextField
                label="Poznámka (nepovinná)"
                name="note"
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 2000 } }}
              />
              <FormControlLabel
                control={<Checkbox name="marketingConsent" />}
                label="Chci dostávat novinky (nepovinné)"
              />
              {termsUrl && (
                <FormControlLabel
                  control={<Checkbox name="termsAccepted" required />}
                  label={
                    <span>
                      Souhlasím s{" "}
                      <a href={termsUrl} target="_blank" rel="noopener noreferrer">
                        obchodními podmínkami
                      </a>
                    </span>
                  }
                />
              )}
            </fieldset>
            <Paper
              variant="outlined"
              component="section"
              aria-label="Shrnutí objednávky"
              className="cart-line"
            >
              <h2>Shrnutí objednávky</h2>
              {shop.items.map((item, index) => (
                <p key={index}>
                  {item.name} · {item.quantity} ks ·{" "}
                  {preview.isSuccess && !preview.isFetching
                    ? preview.data.items[index]?.lineTotal === null
                      ? "k nacenění"
                      : preview.data.items[index]?.lineTotal !== undefined
                        ? money(preview.data.items[index]!.lineTotal! / 100)
                        : "neověřeno"
                    : "neověřeno"}
                </p>
              ))}
              {preview.isFetching && <p role="status">Ověřování cen a dopravy…</p>}
              {preview.isError && <p role="alert">{cartError(preview.error)}</p>}
              {preview.isSuccess && !preview.isFetching && (
                <>
                  {preview.data.items.flatMap((item, index) =>
                    item.errors.map((message, i) => (
                      <p role="alert" key={`${index}-${i}`}>
                        {shop.items[index]?.name}: {message}
                      </p>
                    )),
                  )}
                  <p>
                    Doprava včetně případné dobírky:{" "}
                    {preview.data.shippingCost === null
                      ? "cena není nastavená, zvolte jiný způsob"
                      : money(preview.data.shippingCost / 100)}
                  </p>
                  {preview.data.requiresQuote ? (
                    <p>
                      Celá objednávka půjde k nacenění. Konečnou cenu potvrdí administrátor; nyní
                      nic neplaťte.
                    </p>
                  ) : (
                    <p>
                      Celkem:{" "}
                      <strong>
                        {preview.data.total === null
                          ? "není stanoveno"
                          : money(preview.data.total / 100)}
                      </strong>
                    </p>
                  )}
                </>
              )}
              {error && <p role="alert">{error}</p>}
              <p>
                Při odeslání se požadavek dočasně uloží do sessionStorage této karty kvůli
                bezpečnému opakování. Po přijetí se kontaktní a adresní údaje z tohoto záznamu
                odstraní.
              </p>
              <Button
                type="button"
                disabled={busy || !eligible || !delivery || !payment || !carrierValid}
                onClick={() => void preview.refetch()}
              >
                Znovu ověřit shrnutí
              </Button>
              <Button type="submit" variant="contained" disabled={busy || !termsUrl || !priced}>
                {busy
                  ? "Odesílání…"
                  : preview.data?.requiresQuote
                    ? "Odeslat objednávku k nacenění"
                    : "Objednat s povinností platby"}
              </Button>
            </Paper>
          </form>
        </>
      )}
    </main>
  );
}
