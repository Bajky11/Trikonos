import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, MenuItem, Paper, TableContainer, TextField } from "@mui/material";
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
            <h2>Poslední objednávky</h2>
            <TableContainer>
              <table className="report-table">
                <thead>
                  <tr>
                    {["Číslo", "Zákazník", "Datum", "Částka", "Stav"].map((label) => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link to={`/admin/objednavky/${order.id}`}>{order.orderNumber}</Link>
                      </td>
                      <td>{order.customerName || "—"}</td>
                      <td>{dateTime(order.createdAt)}</td>
                      <td>{order.total === null ? "K nacenění" : money(order.total / 100)}</td>
                      <td>{orderStatuses[order.status] ?? order.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableContainer>
            {!data.recentOrders.length && <p>Zatím žádné objednávky.</p>}
            <Button component={Link} to="/admin/objednavky">
              Všechny objednávky
            </Button>
          </Paper>
        </>
      )}
      <Paper className="admin-panel admin-section" variant="outlined">
        <h2>Statistiky objednávek</h2>
        <p>
          Výchozí období: posledních 30 dní. Dny se počítají podle českého času. Částky nezahrnují
          storna a refundace a nepředstavují přijaté platby.
        </p>
        <div className="admin-catalog-toolbar">
          <TextField
            type="date"
            label="Statistiky od"
            slotProps={{ inputLabel: { shrink: true } }}
            value={createdFrom}
            onChange={(e) => setFrom(e.target.value)}
          />
          <TextField
            type="date"
            label="Statistiky do"
            slotProps={{ inputLabel: { shrink: true } }}
            value={createdTo}
            onChange={(e) => setTo(e.target.value)}
          />
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
        {!valid ? (
          <p role="alert">Počáteční datum musí být nejpozději v koncový den.</p>
        ) : (
          <>
            <h3>Hodnota objednávek v čase</h3>
            <CatalogFeedback query={revenue} label="Hodnota objednávek" />
            {revenue.data?.length === 0 && <p>Ve zvoleném období nejsou žádné výsledky.</p>}
            {revenue.data?.length ? (
              <TableContainer>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">Začátek období</th>
                      <th scope="col">Hodnota</th>
                      <th scope="col">Objednávky</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenue.data.map((row) => (
                      <tr key={row.period}>
                        <td>{row.period}</td>
                        <td>{money(row.revenue / 100)}</td>
                        <td>{row.ordersCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableContainer>
            ) : null}
            <h3>Nejprodávanější katalogové motivy</h3>
            <CatalogFeedback query={motifs} label="Motivy" />
            {motifs.data?.length === 0 && <p>Ve zvoleném období nejsou žádné výsledky.</p>}
            {motifs.data?.length ? (
              <TableContainer>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">Motiv</th>
                      <th scope="col">Kusy</th>
                      <th scope="col">Hodnota položek</th>
                    </tr>
                  </thead>
                  <tbody>
                    {motifs.data.map((row) => (
                      <tr key={row.motifId}>
                        <td>{row.motifName}</td>
                        <td>{row.quantity}</td>
                        <td>{money(row.revenue / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableContainer>
            ) : null}
          </>
        )}
      </Paper>
    </>
  );
}
