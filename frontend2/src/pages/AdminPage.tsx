import { useState } from "react";
import { Link, NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";
import {
  Avatar,
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { orders } from "../data/content";
import { money } from "../data/catalog";
import { useTitle } from "../useTitle";
import { useLogout } from "../auth/session";
import type { Me } from "../api/generated/models";
import { ProductsPanel } from "../admin/catalog/ProductsPanel";
import { DictionariesPanel } from "../admin/lookups/DictionariesPanel";

const sections = [
  ["prehled", "Přehled"],
  ["objednavky", "Objednávky"],
  ["produkty", "Produkty"],
  ["sezony", "Sezóny"],
  ["klienti", "Klienti"],
  ["ciselniky", "Číselníky"],
];
export function AdminLayout() {
  const user = useOutletContext<Me>();
  const logout = useLogout();
  const { section = "prehled" } = useParams();
  const [search, setSearch] = useState("");
  const title = sections.find(([id]) => id === section)?.[1] || "Stránka nenalezena";
  useTitle(`${title} — admin`);
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/admin">
          Trikonoš <span>admin</span>
        </Link>
        <nav aria-label="Administrace">
          {sections.map(([id, label]) => (
            <NavLink
              key={id}
              to={id === "prehled" ? "/admin" : `/admin/${id}`}
              end={id === "prehled"}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <Link className="admin-back" to="/">
          ← Zpět na web
        </Link>
      </aside>
      <div className="admin-workspace">
        <header className="admin-header">
          <h1>{title}</h1>
          <div className="admin-tools">
            <TextField
              className="admin-search"
              placeholder="Hledat…"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              slotProps={{
                htmlInput: {
                  "aria-label":
                    section === "produkty"
                      ? "Hledat v motivech"
                      : section === "ciselniky"
                        ? "Hledat v číselníku"
                        : "Hledat v objednávkách",
                },
              }}
            />
            <Avatar className="admin-avatar" variant="square">
              {(user.name || user.email).slice(0, 2).toLocaleUpperCase("cs")}
            </Avatar>
            <span>{user.name || user.email}</span>
            <Button disabled={logout.isPending} onClick={() => logout.mutate()}>
              Odhlásit se
            </Button>
          </div>
        </header>
        <main className="admin-content">
          {logout.isError && <p role="alert">Odhlášení se nezdařilo. Zkuste to znovu.</p>}
          <Outlet context={{ search }} />
        </main>
      </div>
    </div>
  );
}
function OrderTable({ search, overview }: { search: string; overview: boolean }) {
  const normalized = search.toLocaleLowerCase("cs");
  const visible = orders.filter((order) =>
    [order.id, order.customer, order.date, money(order.amount), order.status]
      .join(" ")
      .toLocaleLowerCase("cs")
      .includes(normalized),
  );
  return (
    <Paper className="admin-panel" variant="outlined">
      <h2>{overview ? "Poslední objednávky" : "Objednávky"}</h2>
      <TableContainer>
        <Table aria-label="Objednávky">
          <TableHead>
            <TableRow>
              {["Číslo", "Zákazník", "Datum", "Částka", "Stav"].map((label) => (
                <TableCell key={label} align={label === "Částka" ? "right" : "left"}>
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((order) => (
              <TableRow key={order.id}>
                <TableCell component="th" scope="row">
                  <strong>{order.id}</strong>
                </TableCell>
                <TableCell>{order.customer}</TableCell>
                <TableCell className="muted">{order.date}</TableCell>
                <TableCell align="right">
                  <strong>{money(order.amount)}</strong>
                </TableCell>
                <TableCell>
                  <Chip className={`status-${order.tone}`} label={order.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!visible.length && (
        <p className="admin-empty" role="status">
          Žádná objednávka neodpovídá hledání.
        </p>
      )}
    </Paper>
  );
}
export function AdminPage({ section: explicitSection }: { section?: string }) {
  const params = useParams();
  const section = explicitSection || params.section || "prehled";
  const { search } = useOutletContext<{ search: string }>();
  return (
    <>
      {section === "prehled" && (
        <section className="admin-stats" aria-label="Souhrn obchodu">
          {[
            ["Objednávky dnes", "12", "+3 oproti včerejšku"],
            ["Tržby dnes", "18 940 Kč", "+9 %"],
            ["Noví klienti", "5", "tento týden"],
            ["Docházejí skladem", "3 produkty", "zkontrolovat"],
          ].map(([label, value, hint], index) => (
            <Paper component="article" className="stat-card" key={label} variant="outlined">
              <h2>{label}</h2>
              <strong>{value}</strong>
              {index === 3 ? (
                <Link to="/admin/produkty" className="warning">
                  {hint}
                </Link>
              ) : (
                <p className={index < 2 ? "positive" : ""}>{hint}</p>
              )}
            </Paper>
          ))}
        </section>
      )}
      {(section === "prehled" || section === "objednavky") && (
        <OrderTable search={search} overview={section === "prehled"} />
      )}
      {section === "ciselniky" && <DictionariesPanel search={search} />}
      {section === "sezony" && (
        <Paper className="admin-panel" variant="outlined">
          <h2>Sezóny do budoucna</h2>
          <p className="admin-empty">
            Valentýn, Velikonoce, Den matek, Den otců, Den dětí, léto, škola, Halloween, Vánoce,
            Silvestr.
          </p>
        </Paper>
      )}
      {section === "produkty" && <ProductsPanel search={search} />}
      {section === "klienti" && (
        <Paper className="admin-panel" variant="outlined">
          <h2>{sections.find(([id]) => id === section)?.[1]}</h2>
          <p className="admin-empty">Tuto část administrace připravujeme.</p>
        </Paper>
      )}
      {!sections.some(([id]) => id === section) && (
        <Paper className="admin-panel" variant="outlined">
          <h2>Stránka nenalezena</h2>
          <p className="admin-empty">
            <Link to="/admin">Zpět na přehled →</Link>
          </p>
        </Paper>
      )}
      <p className="admin-prototype">
        Správa katalogu a číselníků používá backend. Přehled, objednávky a ostatní sekce jsou zatím
        ukázkové.
      </p>
    </>
  );
}
