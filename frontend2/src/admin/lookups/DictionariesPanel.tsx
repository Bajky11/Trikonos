import { useEffect, useState } from "react";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Pagination,
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
import { useCatalogOptionsRetrieve } from "../../api/generated/api";
import { ApiError } from "../../api/http";
import { CatalogFeedback } from "../../components/Products";
import { money } from "../../data/catalog";
import { catalogMutationKey, useCatalogMutation } from "../catalog/api";
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
  return (
    <>
      <Paper className="admin-panel dictionary-panel" variant="outlined">
        <div className="admin-catalog-toolbar">
          <h2>
            {lookupTitles[kind]}
            {list.data && ` (${list.data.count})`}
          </h2>
          <Button
            variant="contained"
            onClick={() => {
              setMessage("");
              setEditing({});
            }}
          >
            + Přidat
          </Button>
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
        </div>
        <CatalogFeedback query={list} label="Položky číselníku" />
        {kind === "print-areas" && <CatalogFeedback query={types} label="Typy oblečení" />}
        {message && (
          <p className="dictionary-message" role="status">
            {message}
          </p>
        )}
        {list.isError && page > 1 && <Button onClick={() => setPage(1)}>První stránka</Button>}
        {list.isSuccess && (
          <>
            <TableContainer>
              <Table aria-label={lookupTitles[kind]} className="dictionary-table">
                <TableHead>
                  <TableRow>
                    {[
                      "Název",
                      ...(kind === "print-areas" ? ["Typ oblečení"] : []),
                      "Údaje",
                      "Pořadí",
                      "Stav",
                      "Akce",
                    ].map((label) => (
                      <TableCell key={label}>{label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {list.data.results.map((item) => (
                    <TableRow key={item.id}>
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
                      <TableCell>{item.position ?? 0}</TableCell>
                      <TableCell>{item.isActive ? "Aktivní" : "Neaktivní"}</TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {!list.data.count && (
              <p className="admin-empty" role="status">
                Žádné položky neodpovídají výběru.
              </p>
            )}
            <Pagination
              count={Math.max(1, Math.ceil(list.data.count / 20))}
              page={page}
              onChange={(_, value) => setPage(value)}
            />
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
    <Paper className="admin-panel" variant="outlined">
      <h2>Velikosti</h2>
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
