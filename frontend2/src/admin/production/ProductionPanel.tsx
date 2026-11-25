import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  ListItemText,
  MenuItem,
  Paper,
  TableCell,
  TableRow,
  TextField,
} from "@mui/material";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useAdminProductionSummaryList } from "../../api/generated/api";
import { DataTable } from "../../components/DataTable";
import { AdminSectionHeader } from "../AdminSectionHeader";
import { CatalogFeedback } from "../../components/Products";
import { AdminDateFilter } from "../AdminDateFilter";
import { orderStatuses } from "../orders/labels";
import { ProductionOrders, useProductionOrders } from "./ProductionOrders";
import "./production.css";

const defaultStatuses = "PAID,PROCESSING";
const number = new Intl.NumberFormat("cs-CZ");
const dateLabel = (value: string) => value.split("-").reverse().map(Number).join(". ");

function validDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function ProductionPanel() {
  const [params, setParams] = useSearchParams();
  const statuses = (params.get("status") ?? defaultStatuses).split(",").filter(Boolean);
  const createdFrom = params.get("createdFrom") || "";
  const createdTo = params.get("createdTo") || "";
  const validStatuses =
    statuses.length > 0 && statuses.every((status) => Object.hasOwn(orderStatuses, status));
  const validDates =
    validDate(createdFrom) &&
    validDate(createdTo) &&
    (!createdFrom || !createdTo || createdFrom <= createdTo);
  const valid = validStatuses && validDates;
  const filter = {
    status: statuses.join(","),
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
  };
  const summary = useAdminProductionSummaryList(filter, {
    query: { enabled: valid, retry: false, refetchOnWindowFocus: false, staleTime: 0 },
    request: { cache: "no-store" },
  });
  const orders = useProductionOrders(filter, valid);
  const update = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value || key === "status") next.set(key, value);
      else next.delete(key);
      return next;
    });
  const reset = () =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      ["status", "createdFrom", "createdTo"].forEach((key) => next.delete(key));
      return next;
    });
  const fetching = summary.isFetching || orders.isFetching;
  const customFilter = filter.status !== defaultStatuses || Boolean(createdFrom || createdTo);
  const period =
    createdFrom && createdTo
      ? `${dateLabel(createdFrom)} – ${dateLabel(createdTo)}`
      : createdFrom
        ? `od ${dateLabel(createdFrom)}`
        : createdTo
          ? `do ${dateLabel(createdTo)}`
          : "bez omezení";
  return (
    <div className="production-page">
      <section className="production-toolbar print-controls" aria-label="Nástroje výroby">
        <div id="production-filters" className="production-filters">
          <AdminSectionHeader
            className="production-filter-heading"
            title="Filtry"
            actions={
              <>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  disabled={!valid || fetching}
                  onClick={() => {
                    void summary.refetch();
                    void orders.refetch();
                  }}
                >
                  Obnovit data
                </Button>
                <Button
                  variant="contained"
                  startIcon={<PrintOutlinedIcon />}
                  disabled={!valid || !summary.isSuccess || !orders.isSuccess || fetching}
                  onClick={() => window.print()}
                >
                  Tisk přehledu
                </Button>
              </>
            }
          />
          <TextField
            select
            label="Stav objednávky"
            value={statuses}
            error={!validStatuses}
            slotProps={{
              select: {
                multiple: true,
                renderValue: (selected) =>
                  (selected as string[])
                    .map((status) => orderStatuses[status] ?? status)
                    .join(", "),
              },
            }}
            onChange={(event) => {
              const value = event.target.value;
              update("status", typeof value === "string" ? value : (value as string[]).join(","));
            }}
          >
            {Object.entries(orderStatuses).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                <Checkbox checked={statuses.includes(value)} tabIndex={-1} disableRipple />
                <ListItemText primary={label} />
              </MenuItem>
            ))}
          </TextField>
          <AdminDateFilter
            label="Vytvořeno od"
            value={createdFrom}
            onChange={(value) => update("createdFrom", value)}
          />
          <AdminDateFilter
            label="Vytvořeno do"
            value={createdTo}
            onChange={(value) => update("createdTo", value)}
          />
          <Button className="production-reset-filters" onClick={reset} disabled={!customFilter}>
            Výchozí filtry
          </Button>
        </div>
      </section>
      {!valid ? (
        <Alert severity="warning">
          {!validStatuses
            ? "Vyberte alespoň jeden platný stav objednávky."
            : "Zkontrolujte období: data musí být platná a datum od nesmí být po datu do."}
        </Alert>
      ) : (
        <>
          <header className="production-print-title">
            <h2>Výrobní přehled</h2>
            <p>
              Stav objednávky: {statuses.map((status) => orderStatuses[status]).join(", ")} ·
              Vytvořeno: {period}
            </p>
          </header>
          <Paper
            component="section"
            variant="outlined"
            id="potrebny-material"
            className="production-material"
            aria-labelledby="production-material-title"
          >
            <div className="production-section-heading">
              <div>
                <h2 id="production-material-title">
                  <Inventory2OutlinedIcon fontSize="small" /> Potřebný materiál
                </h2>
                <p>
                  Textil pro vybrané objednávky včetně hotových položek, bez odečtu skladových
                  zásob.
                </p>
              </div>
              {summary.isSuccess && summary.data.length > 0 && (
                <span className="production-material-total">
                  <strong>
                    {number.format(summary.data.reduce((total, row) => total + row.quantity, 0))}
                  </strong>{" "}
                  ks celkem
                </span>
              )}
            </div>
            <CatalogFeedback query={summary} label="Souhrn výroby" />
            {summary.isSuccess &&
              (summary.data.length ? (
                <DataTable
                  label="Souhrn výroby"
                  columns={[
                    { label: "Typ", width: "30%" },
                    { label: "Střih", width: "24%" },
                    { label: "Barva", width: "24%" },
                    { label: "Velikost", align: "center", compact: true },
                    { label: "Kusů", align: "right", compact: true },
                  ]}
                >
                  {summary.data.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell>{row.productType}</TableCell>
                      <TableCell>{row.cut}</TableCell>
                      <TableCell>{row.color}</TableCell>
                      <TableCell align="center" className="data-table-nowrap">
                        {row.size}
                      </TableCell>
                      <TableCell align="right">
                        <strong>{number.format(row.quantity)}</strong>
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              ) : (
                <p className="production-empty" role="status">
                  Pro vybrané filtry není potřeba žádný textil.
                </p>
              ))}
          </Paper>
          <ProductionOrders query={orders} />
        </>
      )}
    </div>
  );
}
