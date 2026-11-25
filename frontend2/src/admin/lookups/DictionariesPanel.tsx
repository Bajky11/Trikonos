import { useEffect, useState } from "react";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Tab,
  TableCell,
  TableRow,
  Tabs,
  TextField,
} from "@mui/material";
import { useCatalogOptionsRetrieve } from "../../api/generated/api";
import { ApiError } from "../../api/http";
import { CatalogFeedback } from "../../components/Products";
import { DataTable } from "../../components/DataTable";
import { money } from "../../data/catalog";
import { allPages, catalogMutationKey, useCatalogMutation } from "../catalog/api";
import { catalogError } from "../catalog/forms";
import { deleteWarning, lookupApis, lookupTitles, useProductTypes } from "./api";
import type { LookupItem, LookupKind } from "./api";
import { LookupForm } from "./LookupForm";

function LookupTable({ kind, search }: { kind: LookupKind; search: string }) {
  const [q, setQ] = useState(search.trim());
  const [page, setPage] = useState(1);
  const [active, setActive] = useState("");
  const [productType, setProductType] = useState("");
  const types = useProductTypes(kind === "print-areas");
  const [editing, setEditing] = useState<{ item?: LookupItem } | null>(null);
  const [deleting, setDeleting] = useState<LookupItem | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const filtered = !!(q || search.trim() || active || productType);
  useEffect(() => {
    const next = search.trim();
    if (q === next) return;
    const timeout = window.setTimeout(() => {
      setQ(next);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search, q]);
  const params = {
    q: q || undefined,
    isActive: active ? active === "true" : undefined,
    page,
    pageSize: 20,
    ...(kind === "print-areas" && productType ? { productType } : {}),
  };
  const list = useQuery({
    queryKey: [`/api/v1/admin/${kind}`, params],
    queryFn: ({ signal }) => lookupApis[kind].list(params, { signal }),
  });
  const busy = useIsMutating({ mutationKey: catalogMutationKey }) > 0;
  const remove = useCatalogMutation(kind, (id: string) => lookupApis[kind].remove(id));
  const reorder = useCatalogMutation(kind, (ids: string[]) => lookupApis[kind].reorder({ ids }));
  const move = async (id: string, target: string | number) => {
    if (busy || moving || filtered) return;
    setMoving(true);
    setMessage("");
    setError("");
    try {
      const items = await allPages((page) => lookupApis[kind].list({ page, pageSize: 100 }));
      const from = items.findIndex((item) => item.id === id);
      const to =
        typeof target === "number" ? from + target : items.findIndex((item) => item.id === target);
      if (from < 0 || to < 0 || to >= items.length || from === to) return;
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item!);
      await reorder.mutateAsync(items.map((entry) => entry.id));
      setMessage("Pořadí bylo uloženo.");
    } catch (error) {
      setError(catalogError(error));
    } finally {
      setMoving(false);
      setDragged(null);
      setDropTarget(null);
    }
  };
  return (
    <>
      <Paper className="admin-panel dictionary-panel" variant="outlined">
        <div className="admin-catalog-toolbar dictionary-toolbar">
          <h2>
            {lookupTitles[kind]}
            {list.data && ` (${list.data.count})`}
          </h2>
          <TextField
            label="Stav"
            select
            value={active}
            onChange={(event) => {
              setActive(event.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="">Všechny položky</MenuItem>
            <MenuItem value="true">Aktivní</MenuItem>
            <MenuItem value="false">Neaktivní</MenuItem>
          </TextField>
          {kind === "print-areas" && (
            <TextField
              label="Typ oblečení"
              select
              value={productType}
              disabled={!types.isSuccess}
              onChange={(event) => {
                setProductType(event.target.value);
                setPage(1);
              }}
            >
              <MenuItem value="">Všechny typy</MenuItem>
              {(types.data ?? []).map((type) => (
                <MenuItem key={type.id} value={type.id}>
                  {type.name}
                  {!type.isActive && " (neaktivní)"}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Button
            variant="contained"
            onClick={() => {
              setMessage("");
              setEditing({});
            }}
          >
            + Přidat
          </Button>
        </div>
        <CatalogFeedback query={list} label="Položky číselníku" />
        {kind === "print-areas" && <CatalogFeedback query={types} label="Typy oblečení" />}
        {filtered && <p>Pro změnu pořadí zrušte hledání a filtry.</p>}
        {error && !deleting && <p role="alert">{error}</p>}
        {message && (
          <p className="dictionary-message" role="status">
            {message}
          </p>
        )}
        {list.isError && page > 1 && <Button onClick={() => setPage(1)}>První stránka</Button>}
        {list.isSuccess && (
          <>
            <DataTable
              label={lookupTitles[kind]}
              columns={[
                { label: "", compact: true, minWidth: 56 },
                { label: "Název" },
                ...(kind === "print-areas" ? [{ label: "Typ oblečení", compact: true }] : []),
                { label: "Údaje", compact: true },
                { label: "Stav", compact: true },
                { label: "Pořadí", align: "center", compact: true },
                { label: "Akce", align: "center", compact: true },
              ]}
              page={page}
              pageCount={Math.ceil(list.data.count / 20)}
              onPageChange={setPage}
              empty={!list.data.count ? "Žádné položky neodpovídají výběru." : undefined}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  setDropTarget(null);
              }}
            >
              {list.data.results.map((item, index) => (
                <TableRow
                  key={item.id}
                  className={[
                    dragged === item.id ? "dictionary-row-dragging" : "",
                    dropTarget === item.id && dragged !== item.id
                      ? `dictionary-drop-${list.data.results.findIndex((entry) => entry.id === dragged) < index ? "after" : "before"}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onDragOver={(event) => {
                    if (dragged && !filtered && !busy && !moving) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTarget(item.id);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragged) void move(dragged, item.id);
                  }}
                >
                  <TableCell align="center">
                    {filtered ? "—" : (page - 1) * 20 + index + 1}
                  </TableCell>
                  <TableCell component="th" scope="row">
                    {"hexValue" in item && (
                      <i className="dictionary-swatch" style={{ background: item.hexValue }} />
                    )}
                    {item.name}
                  </TableCell>
                  {"productType" in item && (
                    <TableCell>
                      {types.data?.find((type) => type.id === item.productType)?.name ??
                        item.productType}
                    </TableCell>
                  )}
                  <TableCell>
                    {"hexValue" in item
                      ? item.hexValue
                      : "slug" in item
                        ? item.slug
                        : "price" in item
                          ? money((item.price ?? 0) / 100)
                          : "widthMm" in item
                            ? `${item.widthMm} × ${item.heightMm} mm`
                            : "—"}
                  </TableCell>
                  <TableCell>{item.isActive ? "Aktivní" : "Neaktivní"}</TableCell>
                  <TableCell align="right">
                    <div
                      className="dictionary-reorder"
                      role="group"
                      aria-label={`Změna pořadí: ${item.name}`}
                    >
                      <IconButton
                        size="small"
                        aria-label={`Výš: ${item.name}`}
                        title="Posunout výš"
                        disabled={filtered || busy || moving || (page === 1 && index === 0)}
                        onClick={() => void move(item.id, -1)}
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        className="dictionary-drag-handle"
                        aria-label={`Táhnout: ${item.name}`}
                        title="Podržte a přetáhněte"
                        disabled={filtered || busy || moving}
                        draggable={!filtered && !busy && !moving}
                        onDragStart={(event) => {
                          setDragged(item.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", item.id);
                        }}
                        onDragEnd={() => {
                          setDragged(null);
                          setDropTarget(null);
                        }}
                      >
                        <DragIndicatorIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={`Níže: ${item.name}`}
                        title="Posunout níž"
                        disabled={
                          filtered ||
                          busy ||
                          moving ||
                          (page - 1) * 20 + index === list.data.count - 1
                        }
                        onClick={() => void move(item.id, 1)}
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                    </div>
                  </TableCell>
                  <TableCell align="right">
                    <div className="dictionary-actions">
                      <Button
                        aria-label={`Upravit: ${item.name}`}
                        onClick={() => {
                          setMessage("");
                          setEditing({ item });
                        }}
                      >
                        Upravit
                      </Button>
                      <Button
                        color="error"
                        aria-label={`Smazat: ${item.name}`}
                        onClick={() => {
                          setError("");
                          setDeleting(item);
                        }}
                      >
                        Smazat
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </DataTable>
          </>
        )}
      </Paper>
      <Dialog
        open={editing !== null}
        onClose={busy ? undefined : () => setEditing(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{editing?.item ? "Upravit položku" : "Přidat položku"}</DialogTitle>
        <DialogContent>
          {editing && (
            <LookupForm
              key={editing.item?.id ?? "new"}
              kind={kind}
              initial={editing.item}
              onSaved={() => {
                setEditing(null);
                setMessage("Položka byla uložena.");
                setPage(1);
              }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setEditing(null)}>
            Zrušit
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={deleting !== null} onClose={busy ? undefined : () => setDeleting(null)}>
        <DialogTitle>Smazat položku?</DialogTitle>
        <DialogContent>
          <p>Opravdu chcete smazat „{deleting?.name}“?</p>
          <p>{deleteWarning(kind)}</p>
          {error && <p role="alert">{error}</p>}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setDeleting(null)}>
            Zrušit
          </Button>
          <Button
            disabled={busy}
            color="error"
            onClick={() => {
              if (deleting)
                void remove
                  .mutateAsync(deleting.id)
                  .then(() => {
                    setDeleting(null);
                    setMessage("Položka byla smazána.");
                    setPage(1);
                  })
                  .catch((error: unknown) =>
                    setError(
                      error instanceof ApiError && error.code === "IN_USE"
                        ? "Položka se používá. Místo smazání ji deaktivujte."
                        : catalogError(error),
                    ),
                  );
            }}
          >
            Smazat
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function Sizes() {
  const options = useCatalogOptionsRetrieve();
  return (
    <Paper className="admin-panel dictionary-panel" variant="outlined">
      <div className="admin-catalog-toolbar dictionary-toolbar">
        <h2>Velikosti</h2>
      </div>
      <div className="admin-panel-body">
        <p>
          Velikosti jsou pevný seznam backendu, nikoli upravitelný číselník. Pro konkrétní motiv je
          povolíte v jeho variantách.
        </p>
        <CatalogFeedback query={options} label="Velikosti" />
        {options.data && (
          <ul>
            {options.data.sizes.map((size) => (
              <li key={size.value}>{size.label}</li>
            ))}
          </ul>
        )}
      </div>
    </Paper>
  );
}

export function DictionariesPanel({ search }: { search: string }) {
  const [kind, setKind] = useState<LookupKind | "sizes">("colors");
  const busy = useIsMutating({ mutationKey: catalogMutationKey }) > 0;
  return (
    <>
      <Tabs
        value={kind}
        onChange={(_, value: LookupKind | "sizes") => setKind(value)}
        aria-label="Vyberte číselník"
        variant="scrollable"
        scrollButtons="auto"
      >
        {(Object.keys(lookupTitles) as LookupKind[]).map((key) => (
          <Tab key={key} value={key} label={lookupTitles[key]} disabled={busy} />
        ))}
        <Tab value="sizes" label="Velikosti" disabled={busy} />
      </Tabs>
      {kind === "sizes" ? <Sizes /> : <LookupTable key={kind} kind={kind} search={search} />}
    </>
  );
}
