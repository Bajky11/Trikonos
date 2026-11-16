import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useOutletContext, useParams } from "react-router-dom";
import { Avatar, Button, Paper, TextField } from "@mui/material";
import { useTitle } from "../useTitle";
import { useLogout } from "../auth/session";
import type { Me } from "../api/generated/models";
import { ProductsPanel } from "../admin/catalog/ProductsPanel";
import { DictionariesPanel } from "../admin/lookups/DictionariesPanel";
import { OrdersPanel } from "../admin/orders/OrdersPanel";
import { ProductionPanel } from "../admin/production/ProductionPanel";
import { CustomersPanel } from "../admin/customers/CustomersPanel";
import { UsersPanel } from "../admin/accounts/UsersPanel";
import { PasswordPage } from "../auth/PasswordPage";
import { GlobalSearch } from "../admin/GlobalSearch";

const sections = [
  ["prehled", "Přehled"],
  ["objednavky", "Objednávky"],
  ["vyroba", "Výroba"],
  ["produkty", "Produkty"],
  ["sezony", "Sezóny"],
  ["klienti", "Klienti"],
  ["uzivatele", "Účty"],
  ["heslo", "Heslo"],
  ["ciselniky", "Číselníky"],
];
export function AdminLayout() {
  const user = useOutletContext<Me>();
  const logout = useLogout();
  const { section: routeSection, orderId, customerId } = useParams();
  const location = useLocation();
  const manual = location.pathname === "/admin/objednavky/nova";
  const section =
    routeSection ?? (orderId || manual ? "objednavky" : customerId ? "klienti" : "prehled");
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
              placeholder={section === "vyroba" ? "Použijte filtry výroby" : "Hledat…"}
              disabled={
                ["vyroba", "uzivatele", "heslo"].includes(section) ||
                !!orderId ||
                !!customerId ||
                manual
              }
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
                        : section === "klienti"
                          ? "Hledat v zákaznících"
                          : "Hledat v objednávkách",
                },
              }}
            />
            <GlobalSearch />
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
        <OrdersPanel search={search} overview={section === "prehled"} />
      )}
      {section === "ciselniky" && <DictionariesPanel search={search} />}
      {section === "vyroba" && <ProductionPanel />}
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
      {section === "klienti" && <CustomersPanel search={search} />}
      {section === "uzivatele" && <UsersPanel />}
      {section === "heslo" && <PasswordPage key="change" mode="change" />}
      {!sections.some(([id]) => id === section) && (
        <Paper className="admin-panel" variant="outlined">
          <h2>Stránka nenalezena</h2>
          <p className="admin-empty">
            <Link to="/admin">Zpět na přehled →</Link>
          </p>
        </Paper>
      )}
      <p className="admin-prototype">
        Katalog, číselníky, objednávky a zákazníci používají backend. Statistiky přehledu a ostatní
        nepřipojené sekce jsou zatím ukázkové.
      </p>
    </>
  );
}
