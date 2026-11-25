import { DataTable } from "../../components/DataTable";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  TableCell,
  TableRow,
  TextField,
} from "@mui/material";
import {
  adminMotifsDestroy,
  getAdminMotifsRetrieveQueryKey,
  useAdminMotifsList,
  useAdminMotifsRetrieve,
} from "../../api/generated/api";
import type { AdminMotifList } from "../../api/generated/models";
import { CatalogFeedback } from "../../components/Products";
import { money } from "../../data/catalog";
import { AdminSectionHeader } from "../AdminSectionHeader";
import { catalogMutationKey, useAdminCategories, useCatalogMutation } from "./api";
import { catalogError } from "./forms";
import { MotifForm } from "./MotifForm";
import { VariantsPanel } from "./VariantsPanel";
import { ImagesPanel } from "./ImagesPanel";

type Editor =
  | { mode: "motif"; id?: string }
  | { mode: "variants" | "images"; id: string; name: string };

function EditMotif({ id, onSaved }: { id?: string; onSaved: () => void }) {
  const categories = useAdminCategories();
  const detail = useAdminMotifsRetrieve(id ?? "", {
    query: { enabled: !!id, refetchOnWindowFocus: false },
  });
  if (!categories.isSuccess) return <CatalogFeedback query={categories} label="Kategorie" />;
  if (id && !detail.isSuccess) return <CatalogFeedback query={detail} label="Detail motivu" />;
  return (
    <MotifForm
      key={id ?? "new"}
      initial={id ? detail.data : undefined}
      categories={categories.data}
      onSaved={onSaved}
    />
  );
}

export function ProductsPanel() {
  const [routeParams, setRouteParams] = useSearchParams();
  const motifId = routeParams.get("motiv");
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [active, setActive] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  useEffect(() => {
    if (motifId) setEditor({ mode: "motif", id: motifId });
  }, [motifId]);
  const closeEditor = () => {
    setEditor(null);
    if (motifId)
      setRouteParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("motiv");
          return next;
        },
        { replace: true },
      );
  };
  const [deleting, setDeleting] = useState<AdminMotifList | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const next = search.trim();
    if (next === q) return;
    const timeout = window.setTimeout(() => {
      setQ(next);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search, q]);
  const products = useAdminMotifsList({
    q: q || undefined,
    category: category || undefined,
    isActive: active ? active === "true" : undefined,
    page,
    pageSize: 20,
  });
  const categories = useAdminCategories();
  const busy = useIsMutating({ mutationKey: catalogMutationKey }) > 0;
  const remove = useCatalogMutation("motifs", (id: string) => adminMotifsDestroy(id));
  const edit = (id?: string) => {
    setMessage("");
    if (id) client.removeQueries({ queryKey: getAdminMotifsRetrieveQueryKey(id), exact: true });
    setEditor({ mode: "motif", ...(id ? { id } : {}) });
  };
  return (
    <>
      <Paper className="admin-panel" variant="outlined">
        <AdminSectionHeader
          title="Motivy"
          search={{ label: "Hledat v motivech", value: search, onChange: setSearch }}
          actions={
            <Button
              variant="contained"
              disabled={!categories.isSuccess || !categories.data.length}
              onClick={() => edit()}
            >
              Přidat motiv
            </Button>
          }
        />
        <div className="admin-catalog-toolbar dictionary-toolbar">
          <TextField
            select
            label="Kategorie"
            value={category}
            disabled={!categories.isSuccess}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="">Všechny kategorie</MenuItem>
            {(categories.data ?? []).map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.name}
                {!item.isActive && " (neaktivní)"}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Stav"
            value={active}
            onChange={(event) => {
              setActive(event.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="">Všechny motivy</MenuItem>
            <MenuItem value="true">Zveřejněné</MenuItem>
            <MenuItem value="false">Koncepty</MenuItem>
          </TextField>
        </div>
        <CatalogFeedback query={categories} label="Kategorie" />
        {categories.isSuccess && !categories.data.length && (
          <p role="alert" className="admin-empty">
            Nejdříve založte kategorii ve stávající správě backendu.
          </p>
        )}
        <CatalogFeedback query={products} label="Motivy" />
        {message && (
          <p role="status" className="admin-empty">
            {message}
          </p>
        )}
        {products.isError && page > 1 && <Button onClick={() => setPage(1)}>První stránka</Button>}
        {products.isSuccess && (
          <>
            <DataTable
              label="Motivy"
              columns={[
                { label: "Název", minWidth: 142 },
                { label: "Kategorie", width: "18%", minWidth: 108 },
                { label: "Cena motivu", align: "right", compact: true },
                { label: "Stav", compact: true },
                { label: "Akce", align: "right", compact: true },
              ]}
              page={page}
              pageCount={Math.ceil(products.data.count / 20)}
              onPageChange={setPage}
              empty={!products.data.count ? "Žádné motivy neodpovídají výběru." : undefined}
            >
              {products.data.results.map((product) => (
                <TableRow key={product.id}>
                  <TableCell component="th" scope="row" className="data-table-wrap">
                    {product.name}
                  </TableCell>
                  <TableCell className="data-table-wrap">{product.category.name}</TableCell>
                  <TableCell align="right" className="data-table-nowrap">
                    {money(product.price / 100)}
                  </TableCell>
                  <TableCell>{product.isActive ? "Zveřejněný" : "Koncept"}</TableCell>
                  <TableCell align="right">
                    <div className="data-table-actions data-table-actions-nowrap">
                      <Button
                        variant="text"
                        disabled={!categories.isSuccess}
                        onClick={() => edit(product.id)}
                      >
                        Upravit
                      </Button>
                      <Button
                        variant="text"
                        onClick={() =>
                          setEditor({ mode: "variants", id: product.id, name: product.name })
                        }
                      >
                        Varianty
                      </Button>
                      <Button
                        variant="text"
                        onClick={() => {
                          client.removeQueries({
                            queryKey: getAdminMotifsRetrieveQueryKey(product.id),
                            exact: true,
                          });
                          setEditor({ mode: "images", id: product.id, name: product.name });
                        }}
                      >
                        Fotografie
                      </Button>
                      <Button
                        variant="text"
                        color="error"
                        onClick={() => {
                          setError("");
                          setDeleting(product);
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
        open={editor !== null}
        onClose={busy ? undefined : closeEditor}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {editor?.mode === "variants" || editor?.mode === "images"
            ? `${editor.mode === "variants" ? "Varianty" : "Fotografie"}: ${editor.name}`
            : editor?.id
              ? "Upravit motiv"
              : "Nový motiv"}
        </DialogTitle>
        <DialogContent>
          {editor?.mode === "variants" ? (
            <VariantsPanel key={editor.id} motifId={editor.id} />
          ) : editor?.mode === "images" ? (
            <ImagesPanel key={editor.id} motifId={editor.id} />
          ) : (
            editor && (
              <EditMotif
                key={editor.id ?? "new"}
                id={editor.id}
                onSaved={() => {
                  closeEditor();
                  setMessage("Motiv byl uložen.");
                  setPage(1);
                }}
              />
            )
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={closeEditor}>
            Zavřít
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={deleting !== null} onClose={busy ? undefined : () => setDeleting(null)}>
        <DialogTitle>Smazat motiv?</DialogTitle>
        <DialogContent>
          <p>
            Opravdu smazat „{deleting?.name}“? Smažou se také jeho fotografie. Motiv použitý v
            objednávce je nutné místo smazání deaktivovat.
          </p>
          {error && <p role="alert">{error}</p>}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setDeleting(null)}>
            Zrušit
          </Button>
          <Button
            color="error"
            disabled={busy}
            onClick={() => {
              if (deleting)
                void remove
                  .mutateAsync(deleting.id)
                  .then(() => {
                    setDeleting(null);
                    setMessage("Motiv byl smazán.");
                    setPage(1);
                  })
                  .catch((error: unknown) => setError(catalogError(error)));
            }}
          >
            Smazat motiv
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
