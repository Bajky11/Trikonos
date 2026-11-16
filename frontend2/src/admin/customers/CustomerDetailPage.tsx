import { useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import {
  adminCustomersPartialUpdate,
  getAdminAuthMeRetrieveQueryKey,
  getAdminCustomersRetrieveQueryKey,
  useAdminCustomersRetrieve,
} from "../../api/generated/api";
import type { PatchedAdminCustomerUpdate } from "../../api/generated/models";
import { ApiError } from "../../api/http";
import { withCsrf } from "../../auth/csrf";
import { CatalogFeedback } from "../../components/Products";
import { money } from "../../data/catalog";
import { dateTime, orderStatuses } from "../orders/labels";
import { CustomerForm } from "./CustomerForm";
import { customerError, sessionRequired, useCustomerReadError } from "./api";

export function CustomerDetailPage() {
  const { customerId = "" } = useParams();
  return <CustomerDetail key={customerId} id={customerId} />;
}

function CustomerDetail({ id }: { id: string }) {
  const location = useLocation();
  const client = useQueryClient();
  const active = useRef(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const detail = useAdminCustomersRetrieve(id, {
    query: { retry: false, refetchOnWindowFocus: false, staleTime: 0 },
    request: { cache: "no-store" },
  });
  useCustomerReadError(detail.error);
  const writing = useIsMutating({ mutationKey: ["admin-customer-write", id] }) > 0;
  const write = useMutation({
    mutationKey: ["admin-customer-write", id],
    mutationFn: (body: PatchedAdminCustomerUpdate) =>
      withCsrf(() => adminCustomersPartialUpdate(id, body)),
    retry: false,
    gcTime: 0,
  });
  const save = (body: PatchedAdminCustomerUpdate) => {
    if (active.current || writing || uncertain || detail.isFetching || detail.isError) return;
    active.current = true;
    setError("");
    setMessage("");
    void write
      .mutateAsync(body)
      .then(async (updated) => {
        if (!client.getQueryData(getAdminAuthMeRetrieveQueryKey())) return;
        await client.cancelQueries({
          queryKey: getAdminCustomersRetrieveQueryKey(id),
          exact: true,
        });
        client.setQueryData(getAdminCustomersRetrieveQueryKey(id), updated);
        setRevision((value) => value + 1);
        setMessage("Zákazník byl uložený.");
        await client.invalidateQueries({
          predicate: (query) =>
            typeof query.queryKey[0] === "string" &&
            (query.queryKey[0] === "/api/v1/admin/customers" ||
              query.queryKey[0].startsWith("/api/v1/admin/orders")),
        });
      })
      .catch((error: unknown) => {
        if (sessionRequired(error))
          void client.invalidateQueries({ queryKey: getAdminAuthMeRetrieveQueryKey() });
        const unknownResult = !(error instanceof ApiError) || error.status >= 500;
        setUncertain(unknownResult);
        setError(
          unknownResult
            ? "Výsledek uložení není potvrzený. Nejprve načtěte aktuální stav zákazníka, změnu neopakujte naslepo."
            : customerError(error),
        );
      })
      .finally(() => {
        active.current = false;
        write.reset();
      });
  };
  const back = (
    <Button component={Link} to={`/admin/klienti${location.search}`}>
      Zpět na zákazníky
    </Button>
  );
  if (!detail.data)
    return (
      <>
        {back}
        <CatalogFeedback query={detail} label="Detail zákazníka" />
      </>
    );
  const customer = detail.data;
  return (
    <Paper className="admin-panel" variant="outlined">
      {back}
      <h2>Zákazník {customer.email}</h2>
      <p>
        Vytvořeno: {dateTime(customer.createdAt)} · Objednávek: {customer.ordersCount} · Součet
        známých cen:{" "}
        {customer.totalSpent == null ? "Není stanoveno" : money(customer.totalSpent / 100)}
      </p>
      <p>
        Součet zahrnuje i nezaplacené a zrušené objednávky, nejde o součet úhrad. API souhlasu vrací
        jen aktuální stav, ne historii, čas či verzi souhlasu.
      </p>
      <CatalogFeedback query={detail} label="Detail zákazníka" />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <Button
        disabled={writing || detail.isFetching}
        onClick={() => {
          if (!window.confirm("Načíst aktuální stav zákazníka? Neuložené úpravy budou ztracené."))
            return;
          void detail.refetch().then((result) => {
            if (result.isSuccess) {
              setUncertain(false);
              setError("");
              setMessage("Aktuální stav byl načtený.");
              setRevision((value) => value + 1);
            }
          });
        }}
      >
        Načíst aktuálního zákazníka
      </Button>
      <CustomerForm
        key={revision}
        customer={customer}
        disabled={writing || uncertain || detail.isFetching || detail.isError}
        save={save}
      />
      <section aria-label="Historie objednávek zákazníka">
        <h3>Historie objednávek</h3>
        <p>
          Posledních nejvýše 10 z historie vrácené API. Kompletní seznam lze otevřít se
          stránkováním.
        </p>
        <Button component={Link} to={`/admin/objednavky?customer=${encodeURIComponent(id)}`}>
          Všechny objednávky zákazníka
        </Button>
        <TableContainer>
          <Table aria-label="Historie objednávek zákazníka">
            <TableHead>
              <TableRow>
                {["Číslo", "Datum", "Stav", "Částka"].map((label) => (
                  <TableCell key={label}>{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {customer.orders.slice(0, 10).map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link to={`/admin/objednavky/${order.id}?customer=${encodeURIComponent(id)}`}>
                      {order.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{dateTime(order.createdAt)}</TableCell>
                  <TableCell>{orderStatuses[order.status] ?? order.status}</TableCell>
                  <TableCell>
                    {order.total == null
                      ? "K nacenění"
                      : `${(order.total / 100).toLocaleString("cs-CZ")} ${order.currency}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!customer.orders.length && <p role="status">Zákazník zatím nemá žádnou objednávku.</p>}
      </section>
    </Paper>
  );
}
