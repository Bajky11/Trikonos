import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Paper, Typography } from "@mui/material";
import { ordersAccessRetrieve } from "../api/generated/api";
import { readAccessToken, readCheckout, rememberAccessToken } from "../checkout/session";
import { useShop } from "../components/ShopContext";
import { money } from "../data/catalog";
import { useTitle } from "../useTitle";

const statuses: Record<string, string> = {
  QUOTE_REQUESTED: "Čeká na nacenění",
  NEW: "Nová",
  PAID: "Zaplacená",
  PROCESSING: "Ve výrobě",
  SHIPPED: "Odeslaná",
  DELIVERED: "Doručená",
  CANCELLED: "Zrušená",
  REFUNDED: "Vrácená platba",
};
export function OrderReceiptPage() {
  useTitle("Potvrzení objednávky — Trikonoš");
  const shop = useShop();
  const [record] = useState(readCheckout);
  const navigate = useNavigate();
  const location = useLocation();
  const hashParams = new URLSearchParams(location.hash.slice(1));
  const hasHashToken = hashParams.has("pristup");
  const hashToken = hashParams.get("pristup") ?? "";
  const receipt = record?.kind === "receipt" ? record : null;
  const [savedToken, setSavedToken] = useState(
    () =>
      (record?.kind === "pending" ? "" : readAccessToken()) || receipt?.response.accessToken || "",
  );
  const token = hasHashToken ? hashToken : savedToken;
  useEffect(() => {
    if (!hasHashToken || !window.location.hash) return;
    rememberAccessToken(hashToken);
    setSavedToken(hashToken);
    void navigate("/objednavka", { replace: true });
  }, [hasHashToken, hashToken, navigate]);
  const detail = useQuery({
    queryKey: ["order-receipt", token],
    queryFn: ({ signal }) =>
      ordersAccessRetrieve(encodeURIComponent(token), {
        signal,
        cache: "no-store",
        referrerPolicy: "no-referrer",
      }),
    enabled: !!token,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (!token)
    return (
      <main className="shell page-main">
        <Typography variant="h1">Potvrzení objednávky</Typography>
        <p>
          V této kartě není uložené potvrzení. Zkontrolujte potvrzovací e-mail; při nejistém
          odeslání dokončete původní pokus.
        </p>
        <Button component={Link} to="/pokladna">
          Zpět do pokladny
        </Button>
      </main>
    );
  const current =
    detail.data ?? (receipt?.response.accessToken === token ? receipt.response : undefined);
  if (!current)
    return (
      <main className="shell page-main">
        <Typography variant="h1">Detail objednávky</Typography>
        {detail.isError ? (
          <div role="alert">
            <p>Odkaz je neplatný, prošlý, nebo se detail nepodařilo načíst.</p>
            <Button onClick={() => void detail.refetch()}>Zkusit znovu</Button>
          </div>
        ) : (
          <p role="status">Načítání objednávky…</p>
        )}
      </main>
    );
  const quoted = current.status === "QUOTE_REQUESTED";
  const instructions = detail.data?.paymentInstructions;
  return (
    <main className="shell page-main">
      <Typography variant="h1">Objednávka byla přijata</Typography>
      <Paper className="cart-line" variant="outlined">
        <h2>{current.orderNumber}</h2>
        <p>Stav: {statuses[current.status] ?? current.status}</p>
        {quoted && (
          <p>
            Celá objednávka čeká na nacenění administrátorem. Konečnou cenu obdržíte následně; nyní
            nic neplaťte.
          </p>
        )}
        {detail.isPending && <p role="status">Načítání aktuálního detailu…</p>}
        {detail.isError && (
          <div role="alert">
            <p>
              Objednávka byla přijata, ale její aktuální detail se nepodařilo načíst. Neodesílejte
              objednávku znovu.
            </p>
            <Button onClick={() => void detail.refetch()}>Znovu načíst detail</Button>
          </div>
        )}
        {current.items.map((item, index) => (
          <p key={index}>
            {item.itemLabel} · {item.quantity} ks ·{" "}
            {item.unitPrice === null ? "k nacenění" : money(item.unitPrice / 100) + " / kus"}
          </p>
        ))}
        <p>
          Doprava:{" "}
          {current.shippingCost === null ? "není stanovena" : money(current.shippingCost / 100)}
        </p>
        <p>
          Celkem:{" "}
          <strong>
            {current.total === null ? "bude stanoveno po nacenění" : money(current.total / 100)}
          </strong>
        </p>
        {detail.data && (
          <>
            <p>
              Doručení:{" "}
              {detail.data.deliveryType === "PERSONAL_PICKUP"
                ? "Osobní odběr"
                : (detail.data.carrierName ?? "Dopravce není uveden")}
            </p>
            <h3>Fakturační adresa</h3>
            <p>
              {detail.data.billing.fullName}
              <br />
              {detail.data.billing.companyName}
              <br />
              {detail.data.billing.street}
              <br />
              {detail.data.billing.zip} {detail.data.billing.city}
            </p>
            <h3>Doručovací adresa</h3>
            <p>
              {detail.data.shipping.fullName}
              <br />
              {detail.data.shipping.street}
              <br />
              {detail.data.shipping.zip} {detail.data.shipping.city}
            </p>
            {detail.data.paymentStatus === "PAID" && <p>Platba je evidovaná jako uhrazená.</p>}
            {!quoted &&
              detail.data.paymentStatus === "PENDING" &&
              !["CANCELLED", "REFUNDED"].includes(detail.data.status) && (
                <>
                  {detail.data.paymentMethod === "BANK_TRANSFER" ? (
                    instructions?.bankAccount.trim() ? (
                      <section aria-label="Platební instrukce">
                        <h3>Platba převodem</h3>
                        <p>Účet: {instructions.bankAccount}</p>
                        <p>Částka: {money(instructions.amount / 100)}</p>
                        <p>Variabilní symbol: {instructions.variableSymbol}</p>
                      </section>
                    ) : (
                      <p>
                        Platební instrukce zatím nejsou k dispozici. Nevymýšlejte číslo účtu;
                        vyčkejte na informace od obchodu.
                      </p>
                    )
                  ) : (
                    <p>Platba proběhne při převzetí. Žádná online platba nebyla provedena.</p>
                  )}
                </>
              )}
          </>
        )}
        {shop.items.length > 0 && (
          <p role="alert">
            Košík stále obsahuje položky. Mohl se změnit nebo se nepodařilo uložit jeho vyprázdnění.
            Před další objednávkou jej zkontrolujte.
          </p>
        )}
        {shop.locked && (
          <Button component={Link} to="/pokladna">
            Dokončit původní odeslání košíku
          </Button>
        )}
        <p>
          Podrobnosti vám obchod posílá e-mailem. Přístupový token není součástí adresy této
          stránky.
        </p>
        <Button component={Link} to="/tricka">
          Zpět do katalogu
        </Button>
      </Paper>
    </main>
  );
}

export function OrderAccessLinkPage() {
  const { accessToken = "" } = useParams();
  return <Navigate replace to={`/objednavka#pristup=${encodeURIComponent(accessToken)}`} />;
}
