import { DataTable } from "../components/DataTable";
import { AdminSectionHeader } from "./AdminSectionHeader";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, MenuItem, Paper, TableCell, TableRow, TextField } from "@mui/material";
import { AdminDateFilter } from "./AdminDateFilter";
import {
  useAdminDashboardRetrieve,
  useAdminStatsRevenueList,
  useAdminStatsTopMotifsList,
} from "../api/generated/api";
import {
  AdminStatsRevenueListInterval,
  AdminStatsTopMotifsListMetric,
} from "../api/generated/models";
import { CatalogFeedback } from "../components/Products";
import { money } from "../data/catalog";
import { dateTime, orderStatuses } from "./orders/labels";

const options = { query: { retry: false }, request: { cache: "no-store" as const } };

export function Dashboard() {
  const dashboard = useAdminDashboardRetrieve(options);
  const [createdFrom, setFrom] = useState("");
  const [createdTo, setTo] = useState("");
  const [interval, setInterval] = useState<AdminStatsRevenueListInterval>("DAY");
  const [metric, setMetric] = useState<AdminStatsTopMotifsListMetric>("QUANTITY");
  const dates = { createdFrom: createdFrom || undefined, createdTo: createdTo || undefined };
  const valid = !createdFrom || !createdTo || createdFrom <= createdTo;
  const statsOptions = { ...options, query: { ...options.query, enabled: valid } };
  const revenue = useAdminStatsRevenueList({ ...dates, interval }, statsOptions);
  const motifs = useAdminStatsTopMotifsList({ ...dates, metric }, statsOptions);
  const data = dashboard.data;
  const cards = data && [
    ["Objednávky dnes", data.ordersToday, `Včera: ${data.ordersYesterday}`],
    [
      "Hodnota objednávek dnes",
      money(data.revenueToday / 100),
      `Včera: ${money(data.revenueYesterday / 100)}`,
    ],
    ["Noví klienti", data.newCustomers7d, "Za posledních 7 dní"],
    ["Čekající poptávky", data.pendingQuotes, ""],
    ["Objednávky k vyřízení", data.ordersToProcess, ""],
    ["Nezaplacené převody a faktury", data.unpaidInvoices, ""],
  ];
  return (
    <>
      <CatalogFeedback query={dashboard} label="Přehled" />
      {data && cards && (
        <>
          <section className="admin-stats" aria-label="Souhrn obchodu">
            {cards.map(([label, value, hint]) => (
              <Paper component="article" className="stat-card" key={label} variant="outlined">
                <h2>{label}</h2>
                <strong>{value}</strong>
                {hint && <p>{hint}</p>}
              </Paper>
            ))}
          </section>
          <Paper className="admin-panel admin-section" variant="outlined">
            <AdminSectionHeader
              title="Poslední objednávky"
              actions={
                <Button variant="outlined" component={Link} to="/admin/objednavky">
                  Všechny objednávky
                </Button>
              }
            />
            <DataTable
              label="Poslední objednávky"
              columns={[
                { label: "Číslo", compact: true },
                { label: "Zákazník", minWidth: 128 },
                { label: "Datum", compact: true },
                { label: "Částka", align: "right", compact: true },
                { label: "Stav", compact: true },
              ]}
              empty={!data.recentOrders.length ? "Zatím žádné objednávky." : undefined}
            >
              {data.recentOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell component="th" scope="row" className="data-table-nowrap">
                    <Link to={`/admin/objednavky/${order.id}`}>{order.orderNumber}</Link>
                  </TableCell>
                  <TableCell className="data-table-wrap">{order.customerName || "—"}</TableCell>
                  <TableCell className="data-table-nowrap">{dateTime(order.createdAt)}</TableCell>
                  <TableCell align="right" className="data-table-nowrap">
                    {order.total === null ? "K nacenění" : money(order.total / 100)}
                  </TableCell>
                  <TableCell>{orderStatuses[order.status] ?? order.status}</TableCell>
                </TableRow>
              ))}
            </DataTable>
          </Paper>
        </>
      )}
      <Paper className="admin-panel admin-section" variant="outlined">
        <AdminSectionHeader title="Statistiky objednávek" />
        <div className="admin-catalog-toolbar dictionary-toolbar">
          <AdminDateFilter label="Statistiky od" value={createdFrom} onChange={setFrom} />
          <AdminDateFilter label="Statistiky do" value={createdTo} onChange={setTo} />
          <TextField
            select
            label="Seskupit podle"
            value={interval}
            onChange={(e) => setInterval(e.target.value as AdminStatsRevenueListInterval)}
          >
            <MenuItem value="DAY">Den</MenuItem>
            <MenuItem value="WEEK">Týden</MenuItem>
            <MenuItem value="MONTH">Měsíc</MenuItem>
          </TextField>
          <TextField
            select
            label="Řadit motivy podle"
            value={metric}
            onChange={(e) => setMetric(e.target.value as AdminStatsTopMotifsListMetric)}
          >
            <MenuItem value="QUANTITY">Počet kusů</MenuItem>
            <MenuItem value="REVENUE">Hodnota položek</MenuItem>
          </TextField>
        </div>
        <div className="admin-panel-body">
          <p>
            Výchozí období: posledních 30 dní. Dny se počítají podle českého času. Částky nezahrnují
            storna a refundace a nepředstavují přijaté platby.
          </p>
          {!valid ? (
            <p role="alert">Počáteční datum musí být nejpozději v koncový den.</p>
          ) : (
            <>
              <h3>Hodnota objednávek v čase</h3>
              <CatalogFeedback query={revenue} label="Hodnota objednávek" />
              {revenue.data?.length === 0 && <p>Ve zvoleném období nejsou žádné výsledky.</p>}
              {revenue.data?.length ? (
                <DataTable
                  label="Hodnota objednávek v čase"
                  columns={[
                    { label: "Začátek období" },
                    { label: "Hodnota", align: "right", width: "30%" },
                    { label: "Objednávky", align: "right", width: "25%" },
                  ]}
                >
                  {revenue.data.map((row) => (
                    <TableRow key={row.period}>
                      <TableCell component="th" scope="row" className="data-table-nowrap">
                        {row.period}
                      </TableCell>
                      <TableCell align="right" className="data-table-nowrap">
                        {money(row.revenue / 100)}
                      </TableCell>
                      <TableCell align="right">{row.ordersCount}</TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              ) : null}
              <h3>Nejprodávanější katalogové motivy</h3>
              <CatalogFeedback query={motifs} label="Motivy" />
              {motifs.data?.length === 0 && <p>Ve zvoleném období nejsou žádné výsledky.</p>}
              {motifs.data?.length ? (
                <DataTable
                  label="Nejprodávanější katalogové motivy"
                  columns={[
                    { label: "Motiv", minWidth: 108 },
                    { label: "Kusy", align: "right", width: "25%" },
                    { label: "Hodnota položek", align: "right", width: "30%" },
                  ]}
                >
                  {motifs.data.map((row) => (
                    <TableRow key={row.motifId}>
                      <TableCell component="th" scope="row" className="data-table-wrap">
                        {row.motifName}
                      </TableCell>
                      <TableCell align="right">{row.quantity}</TableCell>
                      <TableCell align="right" className="data-table-nowrap">
                        {money(row.revenue / 100)}
                      </TableCell>
                    </TableRow>
                  ))}
                </DataTable>
              ) : null}
            </>
          )}
        </div>
      </Paper>
    </>
  );
}
