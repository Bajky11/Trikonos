import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import LockOutlined from "@mui/icons-material/LockOutlined";
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
import { PurchaseSteps } from "../checkout/PurchaseSteps";
import { OrderRadioGroup } from "../checkout/OrderRadioGroup";
import { PacketaAddressPicker } from "../checkout/PacketaAddressPicker";
import type { DeliveryLocation } from "../checkout/PacketaAddressPicker";
import { PacketaPickupPicker } from "../checkout/PacketaPickupPicker";
import type { PickupPoint } from "../checkout/PacketaPickupPicker";
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

const deliveryLabels: Partial<Record<DeliveryTypeEnum, string>> = {
  HOME_DELIVERY: "Doručení na adresu",
  PICKUP_POINT: "Z-BOX nebo výdejní místo",
  PERSONAL_PICKUP: "Osobní odběr",
};
const paymentLabels: Partial<Record<PaymentMethodEnum, string>> = {
  BANK_TRANSFER: "Bankovní převod",
  CASH_ON_DELIVERY: "Dobírkou",
};

export function CheckoutPage() {
  useTitle("Údaje a doprava — Trikonoš");
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
  const [selectedCarrier, setSelectedCarrier] = useState("");
  const [differentAddress, setDifferentAddress] = useState(false);
  const [pickupPoint, setPickupPoint] = useState<PickupPoint | null>(null);
  const [shippingLocation, setShippingLocation] = useState<DeliveryLocation>({
    street: "",
    city: "",
    zip: "",
  });
  const [pickedByPacketa, setPickedByPacketa] = useState(false);
  const [showBillingDetails, setShowBillingDetails] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const activeSend = useRef(false);
  const preparing = useRef(false);
  const cartKey = JSON.stringify(shop.items);
  const lines = validationLines(shop.items);
  const items = lines.flatMap((line) => (line.input ? [line.input] : []));
  const eligible = shop.items.length > 0 && items.length === shop.items.length;
  const termsUrl = safeTermsUrl(config.data?.termsUrl);
  const carriers = options.data?.carriers ?? [];
  const packetaCarrier = carriers.find((option) => option.code === "PACKETA");
  const widgetConfig = config.data?.packetaHomeDelivery;
  const isPickup = delivery === DeliveryTypeEnum.PICKUP_POINT;
  const deliveryChoices = (config.data?.deliveryTypes ?? []).filter(
    (choice) =>
      choice.value === DeliveryTypeEnum.PERSONAL_PICKUP ||
      choice.value === DeliveryTypeEnum.HOME_DELIVERY ||
      (choice.value === DeliveryTypeEnum.PICKUP_POINT && !!packetaCarrier && !!widgetConfig),
  );
  const paymentChoices = (config.data?.paymentMethods ?? []).filter((choice) =>
    [PaymentMethodEnum.BANK_TRANSFER, PaymentMethodEnum.CASH_ON_DELIVERY].some(
      (value) => value === choice.value,
    ),
  );
  const paymentLabel = (value: PaymentMethodEnum) =>
    value === PaymentMethodEnum.CASH_ON_DELIVERY && delivery === DeliveryTypeEnum.PERSONAL_PICKUP
      ? "Při převzetí na prodejně"
      : paymentLabels[value];
  const carrierId = isPickup
    ? (packetaCarrier?.id ?? "")
    : carriers.length === 1
      ? carriers[0]!.id
      : selectedCarrier;
  const carrier = carriers.find((option) => option.id === carrierId);
  const packetaWidget = carrier?.code === "PACKETA" ? widgetConfig : undefined;
  const sameAddress = delivery !== DeliveryTypeEnum.HOME_DELIVERY || !differentAddress;
  const carrierValid =
    delivery === DeliveryTypeEnum.PERSONAL_PICKUP || (!!carrier && (!isPickup || !!widgetConfig));
  const pickupReady = !isPickup || !!pickupPoint;
  const request = {
    items,
    ...(delivery ? { deliveryType: delivery } : {}),
    ...(payment ? { paymentMethod: payment } : {}),
    ...(delivery && delivery !== DeliveryTypeEnum.PERSONAL_PICKUP ? { carrierId } : {}),
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
      setError(
        posted || current.uncertain
          ? checkoutError(error)
          : "Nepodařilo se navázat spojení. Objednávka nebyla odeslána; zkuste to znovu.",
      );
      if (error instanceof ApiError && error.code === "PRICE_CHANGED")
        void client.invalidateQueries({ queryKey: ["checkout-preview"] });
    } finally {
      activeSend.current = false;
      order.reset();
    }
  };

  if (attempt)
    return (
      <main className="shell page-main purchase-page">
        <PurchaseSteps current={2} linkBack={false} />
        <header className="purchase-heading">
          <Typography variant="h1">Dokončení odeslání</Typography>
        </header>
        <Paper variant="outlined" className="cart-line purchase-recovery">
          <p>
            Výsledek původního odeslání není potvrzený. Košík je uzamčený, aby nevznikla jiná
            objednávka omylem. Opakováním dokončíte stejnou objednávku.
          </p>
          <p>Nezavírejte tuto kartu, dokud výsledek neověříte.</p>
          <p>Kontakt z původního pokusu: {attempt.body.customer.email}</p>
          {error && <p role="alert">{error}</p>}
          {!termsUrl && (
            <p role="alert">Chybí URL schválených obchodních podmínek. Odeslání není povolené.</p>
          )}
          <Button
            variant="contained"
            disabled={busy || !termsUrl}
            onClick={() => void send(attempt)}
          >
            {busy ? "Dokončování…" : "Dokončit stejné odeslání"}
          </Button>
          <p>
            Pokud dokončení opakovaně selhává, kontaktujte obchod. Nevytvářejte nový pokus, dokud
            neověříte, zda původní objednávka existuje.
          </p>
          <p>Identifikátor původního pokusu: {attempt.body.orderId}</p>
        </Paper>
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
    <main className="shell page-main purchase-page checkout-page">
      <PurchaseSteps current={2} linkBack={!busy} />
      <header className="purchase-heading">
        <Typography variant="h1">Údaje a doprava</Typography>
        <p>Vyplňte kontaktní údaje a vyberte doručení a platbu.</p>
      </header>
      <CatalogFeedback query={config} label="Konfigurace objednání" />
      {delivery === DeliveryTypeEnum.HOME_DELIVERY && (
        <CatalogFeedback query={options} label="Dopravci" />
      )}
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
          {config.isSuccess && !termsUrl && (
            <Alert severity="warning" className="checkout-notice">
              Objednání zatím není dostupné: chybí URL schválených obchodních podmínek.
            </Alert>
          )}
          <form
            className="purchase-layout"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                preparing.current ||
                busy ||
                !priced ||
                !termsUrl ||
                !delivery ||
                !payment ||
                !carrierValid ||
                !pickupReady
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
                  const shipping = address(data, "shipping");
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
                      : {
                          ...shipping,
                          sameAsBilling: false,
                          fullName: shipping.fullName || `${firstName} ${lastName}`,
                          companyName: shipping.fullName
                            ? shipping.companyName
                            : billing.companyName,
                        },
                    delivery: {
                      deliveryType: delivery,
                      ...(delivery !== DeliveryTypeEnum.PERSONAL_PICKUP ? { carrierId } : {}),
                      ...(isPickup && pickupPoint
                        ? { pickupPointId: pickupPoint.id, pickupPointName: pickupPoint.name }
                        : {}),
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
            <div className="checkout-sections">
              <Paper
                variant="orderSection"
                component="fieldset"
                disabled={busy}
                aria-labelledby="contact-title"
              >
                <Typography variant="h4" component="h2" id="contact-title">
                  Kontaktní údaje
                </Typography>
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
              </Paper>
              <Paper
                variant="orderSection"
                component="fieldset"
                disabled={busy}
                aria-labelledby="billing-title"
              >
                <Typography variant="h4" component="h2" id="billing-title">
                  Fakturační adresa
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showBillingDetails}
                      onChange={(_, checked) => setShowBillingDetails(checked)}
                    />
                  }
                  label="Přidat firemní nebo jiné fakturační údaje"
                />
                <AddressFields prefix="billing" company hideOptional={!showBillingDetails} />
              </Paper>
              <Paper
                variant="orderSection"
                component="fieldset"
                disabled={busy}
                aria-labelledby="delivery-title"
              >
                <Typography variant="h4" component="h2" id="delivery-title">
                  Doručení a platba
                </Typography>
                <OrderRadioGroup
                  label="Způsob doručení"
                  name="delivery-choice"
                  value={delivery}
                  disabled={busy}
                  onChange={(value) => {
                    setDelivery(value as DeliveryTypeEnum);
                    if (value !== DeliveryTypeEnum.PICKUP_POINT) setPickupPoint(null);
                    setError("");
                  }}
                  choices={deliveryChoices.map((choice) => ({
                    value: choice.value,
                    label: deliveryLabels[choice.value as DeliveryTypeEnum] ?? choice.label,
                  }))}
                />
                {isPickup && widgetConfig && (
                  <PacketaPickupPicker
                    apiKey={widgetConfig.apiKey}
                    point={pickupPoint}
                    disabled={busy}
                    onSelect={(point) => {
                      setPickupPoint(point);
                      setError("");
                    }}
                  />
                )}
                {delivery === DeliveryTypeEnum.HOME_DELIVERY && (
                  <>
                    {carriers.length > 1 ? (
                      <OrderRadioGroup
                        label="Dopravce"
                        name="carrier-choice"
                        value={carrierId}
                        disabled={busy}
                        onChange={setSelectedCarrier}
                        choices={carriers.map(({ id, name }) => ({ value: id, label: name }))}
                      />
                    ) : carriers.length === 1 ? (
                      <Typography variant="body2">
                        Dopravce: <strong>{carriers[0]!.name}</strong>
                      </Typography>
                    ) : options.isSuccess ? (
                      <Alert severity="warning">
                        Doručení na adresu není dostupné. Zvolte jiný způsob.
                      </Alert>
                    ) : null}
                    {packetaWidget && (
                      <PacketaAddressPicker
                        config={packetaWidget}
                        disabled={busy}
                        onSelect={(location) => {
                          setShippingLocation(location);
                          setPickedByPacketa(true);
                          setDifferentAddress(true);
                        }}
                      />
                    )}
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={differentAddress}
                          onChange={(_, checked) => {
                            setDifferentAddress(checked);
                            if (!checked) {
                              setShippingLocation({ street: "", city: "", zip: "" });
                              setPickedByPacketa(false);
                            }
                          }}
                        />
                      }
                      label="Doručit na jinou adresu"
                    />
                    {!sameAddress && (
                      <fieldset className="checkout-fields checkout-address">
                        <legend>Doručovací adresa</legend>
                        <AddressFields
                          prefix="shipping"
                          hideOptional
                          location={shippingLocation}
                          onLocationChange={setShippingLocation}
                          recipientOptional={pickedByPacketa}
                        />
                      </fieldset>
                    )}
                  </>
                )}
                <OrderRadioGroup
                  label="Způsob platby"
                  name="payment-choice"
                  value={payment}
                  disabled={busy}
                  onChange={(value) => {
                    setPayment(value as PaymentMethodEnum);
                    setError("");
                  }}
                  choices={paymentChoices.map((choice) => ({
                    value: choice.value,
                    label: paymentLabel(choice.value as PaymentMethodEnum) ?? choice.label,
                  }))}
                />
              </Paper>
              <Paper
                variant="orderSection"
                component="fieldset"
                disabled={busy}
                aria-labelledby="optional-title"
                data-optional="true"
              >
                <Typography variant="h4" component="h2" id="optional-title">
                  Volitelné údaje
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox checked={showNote} onChange={(_, checked) => setShowNote(checked)} />
                  }
                  label="Přidat poznámku k objednávce"
                />
                {showNote && (
                  <TextField
                    label="Poznámka (nepovinná)"
                    name="note"
                    multiline
                    minRows={2}
                    slotProps={{ htmlInput: { maxLength: 2000 } }}
                  />
                )}
                <FormControlLabel
                  control={<Checkbox name="marketingConsent" />}
                  label="Chci dostávat novinky (nepovinné)"
                />
              </Paper>
            </div>
            <Paper
              variant="outlined"
              component="section"
              aria-label="Shrnutí objednávky"
              className="cart-line purchase-summary"
            >
              <h2>Shrnutí objednávky</h2>
              {shop.items.map((item, index) => (
                <p key={index} className="purchase-summary-row">
                  <span>
                    {item.name}
                    <small>{item.quantity} ks</small>
                  </span>
                  {preview.isSuccess && !preview.isFetching && (
                    <strong>
                      {preview.data.items[index]?.lineTotal === null
                        ? "k nacenění"
                        : preview.data.items[index]?.lineTotal !== undefined
                          ? money(preview.data.items[index]!.lineTotal! / 100)
                          : "neověřeno"}
                    </strong>
                  )}
                </p>
              ))}
              {delivery && (
                <p className="purchase-summary-row">
                  <span>Doručení</span>
                  <strong>
                    {deliveryLabels[delivery]}
                    {delivery === DeliveryTypeEnum.HOME_DELIVERY && <small>{carrier?.name}</small>}
                    {isPickup && <small>{pickupPoint?.name ?? "Místo zatím není vybrané"}</small>}
                  </strong>
                </p>
              )}
              {payment && (
                <p className="purchase-summary-row">
                  <span>Platba</span>
                  <strong>{paymentLabel(payment)}</strong>
                </p>
              )}
              {preview.isFetching && <p role="status">Ověřování cen a dopravy…</p>}
              {preview.fetchStatus === "paused" && (
                <p role="status">Ověření čeká na připojení k internetu.</p>
              )}
              {!delivery || !payment || !carrierValid ? (
                <p className="muted">Celkovou cenu zobrazíme po výběru dopravy a platby.</p>
              ) : null}
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
                  <p className="purchase-summary-row">
                    <span>Doprava včetně případné dobírky</span>
                    <strong>
                      {preview.data.shippingCost === null
                        ? "cena není nastavená, zvolte jiný způsob"
                        : money(preview.data.shippingCost / 100)}
                    </strong>
                  </p>
                  {preview.data.requiresQuote ? (
                    <Alert severity="info" role="status">
                      Konečnou cenu potvrdíme po nacenění. Zatím nic neplaťte.
                    </Alert>
                  ) : (
                    <p className="purchase-summary-row purchase-total">
                      <span>Celkem</span>
                      <strong>
                        {preview.data.total === null
                          ? "není stanoveno"
                          : money(preview.data.total / 100)}
                      </strong>
                    </p>
                  )}
                </>
              )}
              {error && <Alert severity="error">{error}</Alert>}
              {termsUrl && (
                <FormControlLabel
                  className="checkout-terms"
                  control={<Checkbox name="termsAccepted" required disabled={busy} />}
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
              <Button
                type="submit"
                variant="contained"
                startIcon={<LockOutlined />}
                disabled={busy || !termsUrl || !priced || !pickupReady}
              >
                {busy
                  ? "Odesílání…"
                  : preview.data?.requiresQuote
                    ? "Odeslat objednávku k nacenění"
                    : "Objednat s povinností platby"}
              </Button>
              {!busy && (
                <Button component={Link} to="/kosik" startIcon={<ArrowBackRounded />}>
                  Zpět do košíku
                </Button>
              )}
              {(preview.isError || (preview.isSuccess && !priced)) && (
                <Button
                  type="button"
                  disabled={busy || !eligible || !delivery || !payment || !carrierValid}
                  onClick={() => void preview.refetch()}
                >
                  Znovu ověřit shrnutí
                </Button>
              )}
            </Paper>
          </form>
        </>
      )}
    </main>
  );
}
