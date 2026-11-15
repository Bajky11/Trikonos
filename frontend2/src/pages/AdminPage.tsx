import { useState } from "react";
import type { FormEvent } from "react";
import { Link, NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";
import {
  Avatar,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
} from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutlined";
import Close from "@mui/icons-material/Close";
import { defaultDictionaries, dictionaryTitles, orders } from "../data/content";
import type { Dictionaries, DictionaryItem, DictionaryKind } from "../data/content";
import { money } from "../data/catalog";
import { useTitle } from "../useTitle";
import { useLogout } from "../auth/session";
import type { Me } from "../api/generated/models";
import { ProductsPanel } from "../admin/catalog/ProductsPanel";

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
                    section === "produkty" ? "Hledat v motivech" : "Hledat v objednávkách",
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
const dictionaryKey = "trikonos-react-dictionaries-v1";
export function validDictionaries(value: unknown): value is Dictionaries {
  if (!value || typeof value !== "object") return false;
  return (Object.keys(dictionaryTitles) as DictionaryKind[]).every((kind) => {
    const entries: unknown = (value as Dictionaries)[kind];
    if (!Array.isArray(entries) || entries.length > 2000) return false;
    const ids = new Set(),
      names = new Set();
    return entries.every((item: DictionaryItem) => {
      if (
        !item ||
        typeof item.id !== "string" ||
        !item.id ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.length > 80 ||
        ids.has(item.id) ||
        names.has(item.name.toLocaleLowerCase("cs")) ||
        (kind === "colors" && !/^#[0-9a-f]{6}$/i.test(item.hex || ""))
      )
        return false;
      ids.add(item.id);
      names.add(item.name.toLocaleLowerCase("cs"));
      return true;
    });
  });
}
function readDictionaries(): Dictionaries {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(dictionaryKey) || "null");
    if (validDictionaries(stored)) return stored;
  } catch {
    /* Use demo defaults if storage is unavailable or damaged. */
  }
  return structuredClone(defaultDictionaries);
}
function DictionariesPanel() {
  const [data, setData] = useState(readDictionaries);
  const [kind, setKind] = useState<DictionaryKind>("colors");
  const [editing, setEditing] = useState<DictionaryItem | null>(null);
  const [deleting, setDeleting] = useState<DictionaryItem | null>(null);
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#0e584d");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const save = (items: DictionaryItem[]) => {
    const next = { ...data, [kind]: items };
    try {
      localStorage.setItem(dictionaryKey, JSON.stringify(next));
      setData(next);
      return true;
    } catch {
      setError("Změnu se nepodařilo uložit. Povolte místní úložiště prohlížeče.");
      return false;
    }
  };
  const open = (item: DictionaryItem) => {
    setEditing(item);
    setName(item.name);
    setHex(item.hex || "#0e584d");
    setError("");
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = name.trim().replace(/\s+/g, " ").normalize("NFC");
    if (!clean) {
      setError("Zadejte název.");
      return;
    }
    if (
      data[kind].some(
        (item) =>
          item.id !== editing?.id &&
          item.name.normalize("NFC").toLocaleLowerCase("cs") === clean.toLocaleLowerCase("cs"),
      )
    ) {
      setError("Položka s tímto názvem už existuje.");
      return;
    }
    const item = {
      id: editing?.id || crypto.randomUUID(),
      name: clean,
      ...(kind === "colors" ? { hex } : {}),
    };
    const next = editing?.id
      ? data[kind].map((old) => (old.id === item.id ? item : old))
      : [...data[kind], item];
    if (save(next)) {
      setEditing(null);
      setMessage("Položka byla uložena.");
    }
  };
  return (
    <>
      <Tabs
        value={kind}
        onChange={(_, value: DictionaryKind) => {
          setKind(value);
          setMessage("");
        }}
        aria-label="Vyberte číselník"
      >
        {(Object.keys(dictionaryTitles) as DictionaryKind[]).map((key) => (
          <Tab key={key} value={key} label={dictionaryTitles[key]} />
        ))}
      </Tabs>
      <Paper className="admin-panel dictionary-panel" variant="outlined">
        <div className="dictionary-heading">
          <h2>
            {dictionaryTitles[kind]} ({data[kind].length})
          </h2>
          <Button variant="contained" onClick={() => open({ id: "", name: "" })}>
            + Přidat
          </Button>
        </div>
        {message && (
          <p className="dictionary-message" role="status">
            {message}
          </p>
        )}
        <Table aria-label={dictionaryTitles[kind]} className="dictionary-table">
          <TableBody>
            {data[kind].map((item) => (
              <TableRow key={item.id}>
                <TableCell component="th" scope="row">
                  {item.hex && <i className="dictionary-swatch" style={{ background: item.hex }} />}
                  {item.name}
                </TableCell>
                <TableCell align="right">
                  <IconButton aria-label={`Upravit: ${item.name}`} onClick={() => open(item)}>
                    <EditOutlined fontSize="small" />
                  </IconButton>
                  <IconButton
                    className="danger-icon"
                    aria-label={`Smazat: ${item.name}`}
                    onClick={() => {
                      setDeleting(item);
                      setError("");
                    }}
                  >
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!data[kind].length && (
          <p className="admin-empty">Zatím žádné položky. Klikněte na „+ Přidat“.</p>
        )}
      </Paper>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          {editing?.id ? "Upravit položku" : "Přidat položku"}
          <IconButton className="dialog-close" onClick={() => setEditing(null)} aria-label="Zavřít">
            <Close />
          </IconButton>
        </DialogTitle>
        <form onSubmit={submit}>
          <DialogContent className="dialog-form">
            <TextField
              label="Název"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              slotProps={{ htmlInput: { maxLength: 80 } }}
            />
            {kind === "colors" && (
              <label>
                Barva
                <input
                  className="dictionary-color-input"
                  type="color"
                  value={hex}
                  onChange={(event) => setHex(event.target.value)}
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditing(null)}>Zrušit</Button>
            <Button type="submit" variant="contained">
              Uložit
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog open={deleting !== null} onClose={() => setDeleting(null)}>
        <DialogTitle>Smazat položku?</DialogTitle>
        <DialogContent>
          Opravdu chcete smazat „{deleting?.name}“?
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Zrušit</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (save(data[kind].filter((item) => item.id !== deleting?.id))) {
                setDeleting(null);
                setMessage("Položka byla smazána.");
              }
            }}
          >
            Smazat
          </Button>
        </DialogActions>
      </Dialog>
    </>
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
      {section === "ciselniky" && <DictionariesPanel />}
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
        Správa motivů, variant a fotografií používá backend. Přehled, objednávky a ostatní sekce
        jsou zatím ukázkové.
      </p>
    </>
  );
}
