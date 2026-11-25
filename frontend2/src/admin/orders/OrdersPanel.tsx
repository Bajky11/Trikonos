import { DataTable } from "../../components/DataTable";
import { useState } from "react";
import { AdminDateFilter } from "../AdminDateFilter";
import { Link, useSearchParams } from "react-router-dom";
import { Button, MenuItem, Paper, TableCell, TableRow, TextField } from "@mui/material";
import { adminOrdersExportRetrieve, useAdminOrdersList } from "../../api/generated/api";
import { catalogError } from "../catalog/forms";
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

export function OrdersPanel({ overview = false }: { overview?: boolean }) {
  const [params, setParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const update = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("page");
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: key === "q" },
    );
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = overview ? 5 : 20;
  const filtersForRequest = {
    q: params.get("q") || undefined,
    customer: params.get("customer") || undefined,
    status: params.get("status") || undefined,
    paymentStatus: params.get("paymentStatus") || undefined,
    paymentMethod: params.get("paymentMethod") || undefined,
    shipmentStatus: params.get("shipmentStatus") || undefined,
    hasCustom: params.get("hasCustom") || undefined,
    createdFrom: params.get("createdFrom") || undefined,
    createdTo: params.get("createdTo") || undefined,
    carrier: params.get("carrier") || undefined,
    ordering: params.get("ordering") || "-createdAt",
  };
  const orders = useAdminOrdersList(
    { ...filtersForRequest, page, pageSize },
    { query: { retry: false, refetchOnWindowFocus: false }, request: { cache: "no-store" } },
  );
  return (
    <Paper className="admin-panel" variant="outlined">
      <div className="admin-catalog-toolbar dictionary-toolbar">
        <h2>{overview ? "Poslední objednávky" : "Objednávky"}</h2>
        {!overview && (
          <>
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
            <AdminDateFilter
              label="Od data"
              value={params.get("createdFrom") || ""}
              onChange={(value) => update("createdFrom", value)}
            />
            <AdminDateFilter
              label="Do data"
              value={params.get("createdTo") || ""}
              onChange={(value) => update("createdTo", value)}
            />
            <TextField
              label="Hledat v objednávkách"
              type="search"
              value={params.get("q") || ""}
              onChange={(event) => update("q", event.target.value)}
            />
            <div className="account-actions">
              <Button
                variant="outlined"
                disabled={exporting || !orders.isSuccess}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Stáhnout všechny objednávky odpovídající filtrům? Soubor obsahuje osobní údaje.",
                    )
                  )
                    return;
                  setExporting(true);
                  setExportError("");
                  void adminOrdersExportRetrieve(filtersForRequest, {
                    cache: "no-store",
                    headers: { Accept: "*/*" },
                  })
                    .then((blob) => {
                      if (
                        !(blob instanceof Blob) ||
                        blob.type !==
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      )
                        throw new Error("Server nevrátil soubor Excel.");
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = "objednavky.xlsx";
                      link.click();
                      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                    })
                    .catch((error: unknown) => setExportError(catalogError(error)))
                    .finally(() => setExporting(false));
                }}
              >
                Exportovat do Excelu
              </Button>
              <Button variant="contained" component={Link} to="/admin/objednavky/nova">
                Ručně založit objednávku
              </Button>
            </div>
          </>
        )}
      </div>
      {exportError && (
        <p className="admin-empty" role="alert">
          {exportError}
        </p>
      )}
      {params.get("customer") && (
        <p className="admin-empty">
          Aktivní filtr zákazníka.{" "}
          <Link to={`/admin/klienti/${encodeURIComponent(params.get("customer")!)}`}>
            Profil zákazníka
          </Link>{" "}
          <Button onClick={() => update("customer", "")}>Zrušit filtr zákazníka</Button>
        </p>
      )}
      <CatalogFeedback query={orders} label="Objednávky" />
      {orders.isSuccess && (
        <>
          <DataTable
            label="Objednávky"
            columns={[
              { label: "Číslo" },
              { label: "Zákazník" },
              { label: "Datum" },
              { label: "Částka" },
              { label: "Stav" },
              { label: "Platba" },
            ]}
            page={!overview && orders.data.count > pageSize ? page : undefined}
            pageCount={Math.ceil(orders.data.count / pageSize)}
            paginationLabel="Stránkování objednávek"
            onPageChange={(value) =>
              setParams((current) => {
                const next = new URLSearchParams(current);
                next.set("page", String(value));
                return next;
              })
            }
            empty={!orders.data.results.length ? "Žádná objednávka neodpovídá hledání." : undefined}
          >
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
          </DataTable>
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
