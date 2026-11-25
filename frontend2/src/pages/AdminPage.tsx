import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { Alert, Avatar, Button, Paper, ThemeProvider } from "@mui/material";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { csCZ } from "@mui/x-date-pickers/locales";
import "dayjs/locale/cs";
import { adminTheme } from "../theme";
import { useTitle } from "../useTitle";
import { useLogout } from "../auth/session";
import type { Me } from "../api/generated/models";
import { ProductsPanel } from "../admin/catalog/ProductsPanel";
import { DictionariesPanel } from "../admin/lookups/DictionariesPanel";
import { OrdersPanel } from "../admin/orders/OrdersPanel";
import { ProductionPanel } from "../admin/production/ProductionPanel";
import { CustomersPanel } from "../admin/customers/CustomersPanel";
import { UsersPanel } from "../admin/accounts/UsersPanel";
import { GlobalSearch } from "../admin/GlobalSearch";
import { Dashboard } from "../admin/Dashboard";
import { PacketaPage } from "../admin/shipping/PacketaPage";
import { AdminSectionHeader } from "../admin/AdminSectionHeader";

const sections = [
  ["prehled", "Přehled"],
  ["objednavky", "Objednávky"],
  ["vyroba", "Výroba"],
  ["svoz", "Svoz Packety"],
  ["produkty", "Produkty"],
  ["sezony", "Sezóny"],
  ["klienti", "Klienti"],
  ["uzivatele", "Účty"],
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
  const title = sections.find(([id]) => id === section)?.[1] || "Stránka nenalezena";
  useTitle(`${title} — admin`);
  return (
    <ThemeProvider theme={adminTheme}>
      <LocalizationProvider
        dateAdapter={AdapterDayjs}
        adapterLocale="cs"
        localeText={csCZ.components.MuiLocalizationProvider.defaultProps.localeText}
      >
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
            <AdminSectionHeader
              className="admin-header"
              title={title}
              level={1}
              actions={
                <>
                  <GlobalSearch />
                  <div className="admin-account">
                    <Avatar className="admin-avatar" variant="square" aria-hidden="true">
                      {(user.name || user.email).slice(0, 2).toLocaleUpperCase("cs")}
                    </Avatar>
                    <span>{user.name || user.email}</span>
                  </div>
                  <Button
                    variant="outlined"
                    disabled={logout.isPending}
                    onClick={() => logout.mutate()}
                  >
                    Odhlásit se
                  </Button>
                </>
              }
            />
            <main className="admin-content">
              {logout.isError && (
                <Alert severity="error">Odhlášení se nezdařilo. Zkuste to znovu.</Alert>
              )}
              <Outlet />
            </main>
          </div>
        </div>
      </LocalizationProvider>
    </ThemeProvider>
  );
}
export function AdminPage({ section: explicitSection }: { section?: string }) {
  const params = useParams();
  const section = explicitSection || params.section || "prehled";
  return (
    <>
      {section === "prehled" && <Dashboard />}
      {section === "objednavky" && <OrdersPanel />}
      {section === "svoz" && <PacketaPage />}
      {section === "ciselniky" && <DictionariesPanel />}
      {section === "vyroba" && <ProductionPanel />}
      {section === "sezony" && (
        <Paper className="admin-panel" variant="outlined">
          <AdminSectionHeader title="Sezóny do budoucna" />
          <p className="admin-empty">
            Valentýn, Velikonoce, Den matek, Den otců, Den dětí, léto, škola, Halloween, Vánoce,
            Silvestr.
          </p>
        </Paper>
      )}
      {section === "produkty" && <ProductsPanel />}
      {section === "klienti" && <CustomersPanel />}
      {section === "uzivatele" && <UsersPanel />}
      {section === "heslo" && <Navigate to="/admin/uzivatele#heslo" replace />}
      {section !== "heslo" && !sections.some(([id]) => id === section) && (
        <Paper className="admin-panel" variant="outlined">
          <AdminSectionHeader title="Stránka nenalezena" />
          <p className="admin-empty">
            <Link to="/admin">Zpět na přehled →</Link>
          </p>
        </Paper>
      )}
    </>
  );
}
