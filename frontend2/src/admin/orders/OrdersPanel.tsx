import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Button,
  MenuItem,
  Pagination,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { useAdminOrdersList } from "../../api/generated/api";
import { CatalogFeedback } from "../../components/Products";
import { money } from "../../data/catalog";
import {
  dateTime,
  orderStatuses,
  paymentStatuses,
  paymentMethods,
  shipmentStatuses,
} from "./labels";

const filters: [string, string, Record<string, string>][] = [
  ["status", "Stav objednávky", orderStatuses],
  ["paymentStatus", "Stav platby", paymentStatuses],
  ["paymentMethod", "Platba", paymentMethods],
  ["shipmentStatus", "Stav zásilky", shipmentStatuses],
  ["hasCustom", "Vlastní potisk", { true: "S vlastním potiskem", false: "Bez vlastního potisku" }],
  [
    "ordering",
    "Řazení",
    {
      "-createdAt": "Nejnovější",
      createdAt: "Nejstarší",
      total: "Částka vzestupně",
      "-total": "Částka sestupně",
      orderNumber: "Číslo vzestupně",
    },
  ],
];

export function OrdersPanel({ search, overview = false }: { search: string; overview?: boolean }) {
  const [params, setParams] = useSearchParams();
  const previousSearch = useRef(search);
  useEffect(() => {
    if (previousSearch.current === search) return;
    const timer = window.setTimeout(() => {
      previousSearch.current = search;
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("page");
          if (search.trim()) next.set("q", search.trim());
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, setParams]);
  const update = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("page");
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = overview ? 5 : 20;
  const orders = useAdminOrdersList(
    {
      page,
      pageSize,
      q: params.get("q") || undefined,
      customer: params.get("customer") || undefined,
      status: params.get("status") || undefined,
      paymentStatus: params.get("paymentStatus") || undefined,
      paymentMethod: params.get("paymentMethod") || undefined,
      shipmentStatus: params.get("shipmentStatus") || undefined,
      hasCustom: params.get("hasCustom") || undefined,
      createdFrom: params.get("createdFrom") || undefined,
      createdTo: params.get("createdTo") || undefined,
      ordering: params.get("ordering") || "-createdAt",
    },
    { query: { retry: false, refetchOnWindowFocus: false }, request: { cache: "no-store" } },
  );
  return (
    <Paper className="admin-panel" variant="outlined">
      <h2>{overview ? "Poslední objednávky" : "Objednávky"}</h2>
      {!overview && (
        <Button component={Link} to="/admin/objednavky/nova">
          Ručně založit objednávku
        </Button>
      )}
      {params.get("customer") && (
        <p>
          Aktivní filtr zákazníka.{" "}
          <Link to={`/admin/klienti/${encodeURIComponent(params.get("customer")!)}`}>
            Profil zákazníka
          </Link>{" "}
          <Button onClick={() => update("customer", "")}>Zrušit filtr zákazníka</Button>
        </p>
      )}
      {!overview && (
        <div className="admin-catalog-toolbar">
          {filters.map(([key, label, values]) => (
            <TextField
              key={String(key)}
              select
              label={String(label)}
              value={params.get(String(key)) || (key === "ordering" ? "-createdAt" : "")}
              onChange={(event) => update(key, event.target.value)}
            >
              <MenuItem value="">Vše</MenuItem>
              {Object.entries(values).map(([value, title]) => (
                <MenuItem key={value} value={value}>
                  {title}
                </MenuItem>
              ))}
            </TextField>
          ))}
          <TextField
            label="Od data"
            type="date"
            value={params.get("createdFrom") || ""}
            onChange={(event) => update("createdFrom", event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Do data"
            type="date"
            value={params.get("createdTo") || ""}
            onChange={(event) => update("createdTo", event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Hledání objednávek"
            type="search"
            value={params.get("q") || ""}
            onChange={(event) => update("q", event.target.value)}
          />
        </div>
      )}
      <CatalogFeedback query={orders} label="Objednávky" />
      {orders.isSuccess && (
        <>
          <TableContainer>
            <Table aria-label="Objednávky">
              <TableHead>
                <TableRow>
                  {["Číslo", "Zákazník", "Datum", "Částka", "Stav", "Platba"].map((label) => (
                    <TableCell key={label}>{label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.data.results.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link to={`/admin/objednavky/${order.id}${params.size ? `?${params}` : ""}`}>
                        {order.orderNumber}
                      </Link>
                      {order.hasCustom && <p>Vlastní potisk</p>}
                    </TableCell>
                    <TableCell>
                      {order.customerName}
                      <br />
                      {order.customerEmail}
                    </TableCell>
                    <TableCell>{dateTime(order.createdAt)}</TableCell>
                    <TableCell>
                      {order.total == null ? "K nacenění" : money(order.total / 100)}
                    </TableCell>
                    <TableCell>{orderStatuses[order.status ?? ""] ?? order.status}</TableCell>
                    <TableCell>
                      {paymentStatuses[order.paymentStatus ?? ""] ?? order.paymentStatus}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {!orders.data.results.length && <p role="status">Žádná objednávka neodpovídá hledání.</p>}
          {!overview && orders.data.count > pageSize && (
            <Pagination
              aria-label="Stránkování objednávek"
              count={Math.ceil(orders.data.count / pageSize)}
              page={page}
              onChange={(_, value) =>
                setParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set("page", String(value));
                  return next;
                })
              }
            />
          )}
          {overview && (
            <Button component={Link} to="/admin/objednavky">
              Všechny objednávky
            </Button>
          )}
        </>
      )}
    </Paper>
  );
}
