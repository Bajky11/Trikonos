import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Paper, TextField } from "@mui/material";
import {
  adminOrdersConfirmCreate,
  adminOrdersPaymentStatusPartialUpdate,
  adminOrdersStatusCreate,
  getAdminAuthMeRetrieveQueryKey,
  getAdminOrdersRetrieveQueryKey,
  useAdminOrdersRetrieve,
} from "../../api/generated/api";
import type { AdminOrderDetail } from "../../api/generated/models";
import { ApiError } from "../../api/http";
import { withCsrf } from "../../auth/csrf";
import { CatalogFeedback } from "../../components/Products";
import { catalogError, formText } from "../catalog/forms";
import { OrderEditor } from "./OrderEditor";
import { OrderPricing, amount } from "./OrderPricing";
import {
  dateTime,
  orderStatuses,
  paymentStatuses,
  paymentMethods,
  shipmentStatuses,
} from "./labels";

const paymentTargets: Record<string, string[]> = {
  PENDING: ["PAID", "FAILED"],
  FAILED: ["PENDING", "PAID"],
  PAID: ["REFUNDED"],
};
const needsSession = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === 401 || (error.status === 403 && error.code === "AUTHENTICATION_REQUIRED"));

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  return <OrderDetail key={orderId} orderId={orderId} />;
}

function OrderDetail({ orderId }: { orderId: string }) {
  const location = useLocation();
  const client = useQueryClient();
  const active = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const detail = useAdminOrdersRetrieve(orderId, {
    query: { retry: false, staleTime: 0, refetchOnWindowFocus: false },
    request: { cache: "no-store" },
  });
  useEffect(() => {
    if (needsSession(detail.error))
      void client.invalidateQueries({ queryKey: getAdminAuthMeRetrieveQueryKey() });
  }, [client, detail.error]);
  const writing = useIsMutating({ mutationKey: ["admin-orders-write", orderId] }) > 0;
  const write = useMutation({
    mutationKey: ["admin-orders-write", orderId],
    mutationFn: (request: () => Promise<AdminOrderDetail>) => withCsrf(request),
    retry: false,
    gcTime: 0,
  });
  const save = (request: () => Promise<AdminOrderDetail>, success: string) => {
    if (active.current || writing || uncertain || detail.isFetching) return;
    active.current = true;
    setError("");
    setMessage("");
    void write
      .mutateAsync(request)
      .then(async (updated) => {
        if (!client.getQueryData(getAdminAuthMeRetrieveQueryKey())) return;
        await client.cancelQueries({
          queryKey: getAdminOrdersRetrieveQueryKey(orderId),
          exact: true,
        });
        client.setQueryData(getAdminOrdersRetrieveQueryKey(orderId), updated);
        setMessage(success);
        await client.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === "/api/v1/admin/orders" || query.queryKey[0] === "order-receipt",
        });
      })
      .catch((error: unknown) => {
        if (needsSession(error))
          void client.invalidateQueries({ queryKey: getAdminAuthMeRetrieveQueryKey() });
        const unknownResult = !(error instanceof ApiError) || error.status >= 500;
        setUncertain(unknownResult);
        setError(
          unknownResult
            ? "Výsledek změny není potvrzený. Akce už mohla proběhnout. Neopakujte ji naslepo; nejprve načtěte aktuální stav."
            : catalogError(error),
        );
        if (!unknownResult) void detail.refetch();
      })
      .finally(() => {
        active.current = false;
        write.reset();
      });
  };
  if (!detail.isSuccess)
    return (
      <>
        <Button component={Link} to={`/admin/objednavky${location.search}`}>
          Zpět na objednávky
        </Button>
        <CatalogFeedback query={detail} label="Detail objednávky" />
      </>
    );
  const order = detail.data;
  const disabled = writing || uncertain || detail.isFetching;
  const canConfirm = !order.isLocked && order.total != null;
  const payments = ["CANCELLED", "REFUNDED"].includes(order.status ?? "")
    ? []
    : (paymentTargets[order.paymentStatus ?? ""] ?? []).filter(
        (target) => target !== "PAID" || order.total != null,
      );
  return (
    <Paper className="admin-panel" variant="outlined">
      <Button component={Link} to={`/admin/objednavky${location.search}`}>
        Zpět na objednávky
      </Button>
      <h2>Objednávka {order.orderNumber}</h2>
      <p>
        {order.customer.firstName} {order.customer.lastName} · {order.customer.email} ·{" "}
        {order.customer.phone}
      </p>
      <p>
        Vytvořeno: {dateTime(order.createdAt)} · Stav:{" "}
        <strong>{orderStatuses[order.status ?? ""] ?? order.status}</strong>
      </p>
      <p>
        Platba: {paymentMethods[order.paymentMethod ?? ""] ?? "Neurčena"} ·{" "}
        {paymentStatuses[order.paymentStatus ?? ""] ?? order.paymentStatus} · Zásilka:{" "}
        {shipmentStatuses[order.shipmentStatus ?? ""] ?? order.shipmentStatus}
      </p>
      <p>
        Potvrzení:{" "}
        {order.confirmedAt
          ? dateTime(order.confirmedAt)
          : "Nepotvrzeno / cena se od potvrzení změnila"}
      </p>
      {order.isLocked && (
        <p role="status">
          Objednávka je uzamčená. Ceny, množství, adresy a dopravu nelze měnit; sledovací číslo lze
          opravit.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <Button
        disabled={writing || detail.isFetching}
        onClick={() => {
          if (!window.confirm("Načíst aktuální stav? Neuložené úpravy mohou být ztraceny.")) return;
          void detail.refetch().then((result) => {
            if (result.isSuccess) {
              setUncertain(false);
              setError("");
              setMessage("Aktuální stav byl načtený.");
            }
          });
        }}
      >
        Načíst aktuální stav
      </Button>
      <OrderPricing order={order} disabled={disabled} save={save} />
      <section aria-label="Potvrzení a stavy">
        <h2>Potvrzení a stavy</h2>
        <p>
          Potvrzení odešle zákazníkovi aktuální cenu a platební instrukce. Nejde o zákazníkův
          souhlas s nabídkou.
        </p>
        <form
          key={`confirm-${order.updatedAt}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (disabled || !canConfirm) return;
            const message = formText(new FormData(event.currentTarget), "message");
            if (
              window.confirm(
                `Potvrdit objednávku ${order.orderNumber} za ${amount(order.total)} a odeslat zákazníkovi e-mail${order.confirmedAt ? " znovu" : ""}?`,
              )
            )
              save(
                () => adminOrdersConfirmCreate(order.id, { message }),
                "Objednávka byla potvrzená a byla vyvolána e-mailová notifikace.",
              );
          }}
        >
          <fieldset disabled={disabled || !canConfirm} className="checkout-fields">
            <legend>Potvrzení objednávky</legend>
            <TextField label="Zpráva zákazníkovi (nepovinná)" name="message" multiline />
            <Button type="submit" variant="contained">
              {order.confirmedAt ? "Znovu potvrdit a odeslat e-mail" : "Potvrdit a odeslat cenu"}
            </Button>
          </fieldset>
        </form>
        <h3>Stav objednávky</h3>
        <p>
          Volby vrací backend podle aktuálně povolených přechodů. Zrušení a odeslání mohou vyvolat
          e-mail.
        </p>
        {order.allowedTransitions.map((status) => (
          <Button
            key={status}
            disabled={disabled}
            onClick={() => {
              const label =
                status === "PAID" && order.paymentMethod === "CASH_ON_DELIVERY"
                  ? "Ve výrobě (dobírka zůstane neuhrazená)"
                  : (orderStatuses[status] ?? status);
              if (
                window.confirm(
                  `Změnit stav objednávky na „${label}“?${status === "REFUNDED" ? " Tato akce pouze eviduje vrácení, neprovádí bankovní refundaci." : ""}`,
                )
              )
                save(
                  () => adminOrdersStatusCreate(order.id, { status }),
                  "Stav objednávky byl změněný.",
                );
            }}
          >
            {status === "PAID" && order.paymentMethod === "CASH_ON_DELIVERY"
              ? "Předat do výroby (dobírka)"
              : (orderStatuses[status] ?? status)}
          </Button>
        ))}
        {!order.allowedTransitions.length && <p>Žádný přechod nyní není povolený.</p>}
        <h3>Evidence platby</h3>
        <p>Mění pouze platební stav, nikoli stav objednávky. Neprovádí platbu ani vrácení peněz.</p>
        {payments.map((paymentStatus) => (
          <Button
            key={paymentStatus}
            disabled={disabled}
            onClick={() => {
              if (
                window.confirm(
                  `Evidovat platbu jako „${paymentStatuses[paymentStatus]}“? Ověřte skutečný pohyb peněz; tato akce jej neprovádí.`,
                )
              )
                save(
                  () => adminOrdersPaymentStatusPartialUpdate(order.id, { paymentStatus }),
                  "Platební stav byl uložený; stav objednávky se nezměnil.",
                );
            }}
          >
            {paymentStatuses[paymentStatus]}
          </Button>
        ))}
      </section>
      <OrderEditor
        key={`${order.id}-${order.updatedAt}`}
        order={order}
        disabled={disabled}
        save={save}
      />
    </Paper>
  );
}
