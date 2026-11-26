import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Divider, Paper, Stack, Typography } from "@mui/material";
import CheckCircleOutlineRounded from "@mui/icons-material/CheckCircleOutlineRounded";
import { ordersAccessRetrieve } from "../api/generated/api";
import { readAccessToken, readCheckout, rememberAccessToken } from "../checkout/session";
import { PurchaseSteps } from "../checkout/PurchaseSteps";
import { CardPayment } from "../checkout/CardPayment";
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
    () => readAccessToken() || receipt?.response.accessToken || "",
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
        <Paper variant="orderReceipt">
          <Typography variant="h1">Přijetí objednávky není ověřené</Typography>
          <Alert severity="info">
            V této kartě není uložené potvrzení. Stav ověřte v e-mailu nebo objednávku dohledejte.
          </Alert>
          {record?.kind === "pending" && (
            <Button component={Link} to="/pokladna">
              Dokončit původní odeslání
            </Button>
          )}
          <Button component={Link} to="/stav-objednavky" variant="contained">
            Dohledat objednávku
          </Button>
        </Paper>
      </main>
    );
  const current =
    detail.data ?? (receipt?.response.accessToken === token ? receipt.response : undefined);
  if (!current)
    return (
      <main className="shell page-main">
        <Paper variant="orderReceipt">
          <Typography variant="h1">
            {detail.isError ? "Přijetí objednávky se nepodařilo ověřit" : "Ověřujeme objednávku"}
          </Typography>
          {detail.isError ? (
            <>
              <Alert severity="warning">
                Odkaz je neplatný, vypršel nebo se objednávku nepodařilo načíst. Než ji odešlete
                znovu, ověřte její stav.
              </Alert>
              <Button onClick={() => void detail.refetch()}>Zkusit znovu</Button>
              <Button component={Link} to="/stav-objednavky">
                Dohledat podle čísla a e-mailu
              </Button>
            </>
          ) : (
            <p role="status">Načítání objednávky…</p>
          )}
        </Paper>
      </main>
    );
  const quoted = current.status === "QUOTE_REQUESTED";
  const instructions = detail.data?.paymentInstructions;
  const inactive = ["CANCELLED", "REFUNDED"].includes(current.status);
  return (
    <main className="shell page-main purchase-page">
      <PurchaseSteps current={3} linkBack={false} />
      <Paper variant="orderReceipt" component="section" aria-label="Detail objednávky">
        {!inactive && <CheckCircleOutlineRounded aria-hidden="true" />}
        <Typography variant="h1">
          {current.status === "CANCELLED"
            ? "Objednávka byla zrušena"
            : current.status === "REFUNDED"
              ? "Platba byla vrácena"
              : "Objednávka byla přijata"}
        </Typography>
        <Divider />
        <Stack>
          <Typography variant="overline" color="text.secondary">
            Číslo objednávky
          </Typography>
          <Typography variant="h3" component="h2">
            {current.orderNumber}
          </Typography>
        </Stack>
        {!["NEW", "QUOTE_REQUESTED", "CANCELLED", "REFUNDED"].includes(current.status) && (
          <Typography>Stav: {statuses[current.status] ?? current.status}</Typography>
        )}
        {quoted && (
          <Alert severity="info" role="status">
            Celá objednávka čeká na nacenění. Zatím nic neplaťte.
          </Alert>
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
        {current.total !== null && (
          <Typography>
            Celkem: <strong>{money(current.total / 100)}</strong>
          </Typography>
        )}
        {detail.data && (
          <>
            <Typography>
              Doručení:{" "}
              {detail.data.deliveryType === "PERSONAL_PICKUP"
                ? "Osobní odběr"
                : detail.data.deliveryType === "PICKUP_POINT"
                  ? `${detail.data.carrierName ?? "Výdejní místo"} · ${detail.data.pickupPointName}`
                  : `${detail.data.carrierName ?? "Na adresu"} · ${detail.data.shipping.street}, ${detail.data.shipping.city}`}
            </Typography>
            {detail.data.paymentStatus === "PAID" && <p>Platba je evidovaná jako uhrazená.</p>}
            {!quoted &&
              detail.data.paymentStatus === "PENDING" &&
              !["CANCELLED", "REFUNDED"].includes(detail.data.status) && (
                <>
                  {detail.data.paymentMethod === "BANK_TRANSFER" ? (
                    instructions?.bankAccount.trim() ? (
                      <Stack component="section" aria-label="Platební instrukce">
                        <Typography variant="h4" component="h2">
                          Platba převodem
                        </Typography>
                        <Typography>Účet: {instructions.bankAccount}</Typography>
                        <Typography>Částka: {money(instructions.amount / 100)}</Typography>
                        <Typography>Variabilní symbol: {instructions.variableSymbol}</Typography>
                      </Stack>
                    ) : (
                      <p>
                        Platební instrukce zatím nejsou k dispozici. S platbou vyčkejte, než vám
                        pošleme údaje.
                      </p>
                    )
                  ) : detail.data.paymentMethod === "CARD_ONLINE" ? (
                    <CardPayment key={token} token={token} />
                  ) : detail.data.paymentMethod === "CASH_ON_DELIVERY" ? (
                    <Typography>Zaplatíte při převzetí.</Typography>
                  ) : null}
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
        <Button component={Link} to="/tricka" variant="contained">
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
