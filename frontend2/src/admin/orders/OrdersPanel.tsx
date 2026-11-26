import { DataTable } from "../../components/DataTable";
import { useEffect, useId, useState } from "react";
import { AdminDateFilter } from "../AdminDateFilter";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Chip, MenuItem, Paper, TableCell, TableRow, TextField } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { AdminSectionHeader } from "../AdminSectionHeader";
import TuneIcon from "@mui/icons-material/Tune";
import { adminOrdersExportRetrieve, useAdminOrdersList } from "../../api/generated/api";
import { catalogError } from "../catalog/forms";
import { CatalogFeedback } from "../../components/Products";
import { money } from "../../data/catalog";
import { orderStatuses, paymentStatuses, paymentMethods, shipmentStatuses } from "./labels";
import { StatusBadge } from "./OrderStatusBadge";
import { OrdersLedger, ledgerColumns } from "./OrdersLedger";
import { OrderPeriodFilter } from "./OrderPeriodFilter";
import { selectedPeriod } from "./orderPeriod";
import "./orders.css";

type SelectFilter = [key: string, label: string, values: Record<string, string>];

const primaryFilters: SelectFilter[] = [["status", "Stav objednávky", orderStatuses]];
const advancedFilters: SelectFilter[] = [
  ["paymentStatus", "Stav platby", paymentStatuses],
  ["paymentMethod", "Platba", paymentMethods],
  ["shipmentStatus", "Stav zásilky", shipmentStatuses],
  ["hasCustom", "Vlastní potisk", { true: "S vlastním potiskem", false: "Bez vlastního potisku" }],
];
const dateFilters = [
  ["createdFrom", "Od data"],
  ["createdTo", "Do data"],
] as const;
const filterLabels: [string, string, Record<string, string>?][] = [
  ["q", "Hledání"],
  ...primaryFilters,
  ...advancedFilters,
  ...dateFilters.map(([key, label]): [string, string] => [key, label]),
  ["customer", "Zákazník"],
  ["carrier", "Dopravce"],
];

function withFilter(current: URLSearchParams, key: string, value: string) {
  const next = new URLSearchParams(current);
  next.delete("page");
  if (value) next.set(key, value);
  else next.delete(key);
  return next;
}

const defaultOrdering = "-createdAt";
const orderingFilter: SelectFilter = [
  "ordering",
  "Řazení",
  {
    [defaultOrdering]: "Nejnovější",
    createdAt: "Nejstarší",
    total: "Částka vzestupně",
    "-total": "Částka sestupně",
    orderNumber: "Číslo vzestupně",
    "-orderNumber": "Číslo sestupně",
  },
];
const date = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" });
const time = new Intl.DateTimeFormat("cs-CZ", { timeStyle: "short" });

function selectLabel(key: string, value: string, values: Record<string, string>) {
  return key === "status"
    ? value
        .split(",")
        .map((part) => values[part.trim()] ?? part.trim())
        .join(", ")
    : (values[value] ?? value);
}

function FilterSelect({
  filter: [key, label, values],
  value,
  onChange,
}: {
  filter: SelectFilter;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {key !== "ordering" && <MenuItem value="">Vše</MenuItem>}
      {value && !Object.hasOwn(values, value) && (
        <MenuItem value={value}>{selectLabel(key, value, values)}</MenuItem>
      )}
      {Object.entries(values).map(([option, title]) => (
        <MenuItem key={option} value={option}>
          {title}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function OrdersPanel({ overview = false }: { overview?: boolean }) {
  const [params, setParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const advancedId = useId();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const query = params.get("q") || "";
  const [search, setSearch] = useState({ applied: query, text: query });
  if (query !== search.applied) setSearch({ applied: query, text: query });
  const pendingQuery = search.text.trim();
  const searchPending = !overview && query !== pendingQuery;
  useEffect(() => {
    if (!searchPending || search.applied !== query) return;
    const timer = window.setTimeout(() => {
      setParams((current) => withFilter(current, "q", pendingQuery), { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [pendingQuery, query, search.applied, searchPending, setParams]);
  const update = (key: string, value: string) =>
    setParams((current) => withFilter(current, key, value));
  const clearFilters = () => {
    setSearch({ applied: query, text: "" });
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key] of filterLabels) next.delete(key);
      next.delete("page");
      return next;
    });
  };
  const calendarPeriod = selectedPeriod(
    params.get("createdFrom") || "",
    params.get("createdTo") || "",
  );
  const activeFilters = filterLabels.flatMap(([key, label, values]) => {
    if (calendarPeriod && (key === "createdFrom" || key === "createdTo")) return [];
    const value = params.get(key);
    if (!value) return [];
    const title = values ? selectLabel(key, value, values) : value;
    return [{ key, title: key === "customer" || key === "carrier" ? label : `${label}: ${title}` }];
  });
  const advancedCount = [
    ...primaryFilters,
    ...advancedFilters,
    ...(calendarPeriod ? [] : dateFilters),
  ].filter(([key]) => params.get(key)).length;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = overview ? 5 : 20;
  const filtersForRequest = {
    q: query || undefined,
    customer: params.get("customer") || undefined,
    status: params.get("status") || undefined,
    paymentStatus: params.get("paymentStatus") || undefined,
    paymentMethod: params.get("paymentMethod") || undefined,
    shipmentStatus: params.get("shipmentStatus") || undefined,
    hasCustom: params.get("hasCustom") || undefined,
    createdFrom: params.get("createdFrom") || undefined,
    createdTo: params.get("createdTo") || undefined,
    carrier: params.get("carrier") || undefined,
    ordering: params.get("ordering") || defaultOrdering,
  };
  const orders = useAdminOrdersList(
    { ...filtersForRequest, page, pageSize },
    { query: { retry: false, refetchOnWindowFocus: false }, request: { cache: "no-store" } },
  );
  return (
    <Paper className="admin-panel orders-panel" variant={overview ? "outlined" : "elevation"}>
      <AdminSectionHeader
        className={overview ? undefined : "orders-toolbar"}
        title={overview ? "Poslední objednávky" : undefined}
        search={
          overview
            ? undefined
            : {
                label: "Hledat v objednávkách",
                placeholder: "Číslo, jméno, e-mail nebo zásilka",
                value: search.text,
                onChange: (text) => setSearch({ applied: query, text }),
              }
        }
        actions={
          !overview && (
            <>
              <Button
                variant="outlined"
                startIcon={<DownloadOutlinedIcon />}
                disabled={exporting || searchPending || !orders.isSuccess}
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
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                component={Link}
                to="/admin/objednavky/nova"
              >
                Nová objednávka
              </Button>
            </>
          )
        }
      />
      {!overview && (
        <section className="orders-filters" aria-label="Filtry objednávek">
          <div className="orders-primary-filters">
            <OrderPeriodFilter
              from={params.get("createdFrom") || ""}
              to={params.get("createdTo") || ""}
              onChange={(from, to) =>
                setParams((current) =>
                  withFilter(withFilter(current, "createdFrom", from), "createdTo", to),
                )
              }
            />
            <Button
              variant="outlined"
              startIcon={<TuneIcon />}
              endIcon={<ExpandMoreIcon />}
              aria-expanded={showAdvanced}
              aria-controls={advancedId}
              onClick={() => setShowAdvanced((open) => !open)}
            >
              Další filtry{advancedCount > 0 ? ` (${advancedCount})` : ""}
            </Button>
          </div>
          <div id={advancedId} className="orders-advanced-filters" hidden={!showAdvanced}>
            {showAdvanced && (
              <>
                <FilterSelect
                  filter={orderingFilter}
                  value={filtersForRequest.ordering}
                  onChange={(value) => update("ordering", value === defaultOrdering ? "" : value)}
                />
                {[...primaryFilters, ...advancedFilters].map((filter) => (
                  <FilterSelect
                    key={filter[0]}
                    filter={filter}
                    value={params.get(filter[0]) || ""}
                    onChange={(value) => update(filter[0], value)}
                  />
                ))}
                {dateFilters.map(([key, label]) => (
                  <AdminDateFilter
                    key={key}
                    label={label}
                    value={params.get(key) || ""}
                    onChange={(value) => update(key, value)}
                  />
                ))}
              </>
            )}
          </div>
          {activeFilters.length > 0 && (
            <div className="orders-active-filters" role="group" aria-label="Aktivní filtry">
              {activeFilters.map(({ key, title }) => (
                <Chip
                  key={key}
                  size="small"
                  label={title}
                  aria-label={`Odebrat filtr ${title}`}
                  onDelete={() => {
                    if (key === "q") setSearch({ applied: query, text: "" });
                    update(key, "");
                  }}
                />
              ))}
              {params.get("customer") && (
                <Link to={`/admin/klienti/${encodeURIComponent(params.get("customer")!)}`}>
                  Profil zákazníka
                </Link>
              )}
              <Button size="small" onClick={clearFilters}>
                Vymazat filtry
              </Button>
            </div>
          )}
        </section>
      )}
      {exportError && (
        <p className="admin-empty" role="alert">
          {exportError}
        </p>
      )}
      {!orders.isSuccess && (
        <div className="orders-feedback">
          <CatalogFeedback query={orders} label="Objednávky" />
        </div>
      )}
      {orders.isSuccess && (
        <>
          <DataTable
            label="Objednávky"
            density="compact"
            columns={
              overview
                ? [
                    { label: "Číslo", compact: true },
                    { label: "Jméno", minWidth: 90 },
                    { label: "Příjmení", minWidth: 100 },
                    { label: "E-mail", minWidth: 155 },
                    { label: "Vytvořeno", compact: true },
                    { label: "Částka", align: "right", compact: true },
                    { label: "Stav objednávky", compact: true },
                    { label: "Platba", compact: true },
                    { label: "Zásilka", compact: true },
                  ]
                : ledgerColumns
            }
            page={overview ? undefined : page}
            pageCount={Math.ceil(orders.data.count / pageSize)}
            alwaysShowPagination
            paginationLabel="Stránkování objednávek"
            paginationDisabled={searchPending}
            onPageChange={(value) =>
              setParams((current) => {
                const next = new URLSearchParams(current);
                next.set("page", String(value));
                return next;
              })
            }
            empty={
              !orders.data.results.length ? (
                activeFilters.length ? (
                  <>
                    <div>Žádná objednávka neodpovídá hledání.</div>
                    <Button size="small" onClick={clearFilters}>
                      Vymazat filtry
                    </Button>
                  </>
                ) : (
                  "Zatím tu nejsou žádné objednávky."
                )
              ) : undefined
            }
          >
            {!overview ? (
              <OrdersLedger orders={orders.data.results} params={params} />
            ) : (
              orders.data.results.map((order) => (
                <TableRow key={order.id}>
                  <TableCell component="th" scope="row">
                    <Link
                      className="data-table-nowrap"
                      to={`/admin/objednavky/${order.id}${params.size ? `?${params}` : ""}`}
                    >
                      {order.orderNumber}
                    </Link>
                    {order.hasCustom && (
                      <span className="data-table-secondary">Vlastní potisk</span>
                    )}
                  </TableCell>
                  <TableCell className="data-table-wrap">
                    {order.customerFirstName || "—"}
                  </TableCell>
                  <TableCell className="data-table-wrap">{order.customerLastName || "—"}</TableCell>
                  <TableCell className="data-table-wrap">{order.customerEmail || "—"}</TableCell>
                  <TableCell className="data-table-nowrap">
                    <time dateTime={order.createdAt}>
                      {date.format(new Date(order.createdAt))}
                      <span className="data-table-secondary">
                        {time.format(new Date(order.createdAt))}
                      </span>
                    </time>
                  </TableCell>
                  <TableCell align="right" className="data-table-nowrap">
                    {order.total == null ? "K nacenění" : money(order.total / 100)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={order.status} labels={orderStatuses} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={order.paymentStatus} labels={paymentStatuses} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={order.shipmentStatus} labels={shipmentStatuses} />
                  </TableCell>
                </TableRow>
              ))
            )}
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
