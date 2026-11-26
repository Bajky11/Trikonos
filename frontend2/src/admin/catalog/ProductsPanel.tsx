import { DataTable } from "../../components/DataTable";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  ButtonBase,
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
import { GarmentPreview } from "../../components/GarmentPreview";
import { money } from "../../data/catalog";
import { AdminSectionHeader } from "../AdminSectionHeader";
import { catalogMutationKey, useAdminCategories, useCatalogMutation } from "./api";
import { catalogError } from "./forms";
import { MotifForm } from "./MotifForm";
import { ImagesPanel } from "./ImagesPanel";

type Editor = { id?: string; duplicate?: boolean };

function EditMotif({
  id,
  duplicate,
  busy,
  onDuplicate,
  onClose,
  onSaved,
}: {
  id?: string;
  duplicate?: boolean;
  busy: boolean;
  onDuplicate: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const categories = useAdminCategories();
  const detail = useAdminMotifsRetrieve(id ?? "", {
    query: { enabled: !!id, refetchOnWindowFocus: false },
  });
  if (!categories.data || (id && !detail.data)) {
    return (
      <>
        <DialogContent>
          {!categories.data && <CatalogFeedback query={categories} label="Kategorie" />}
          {id && !detail.data && <CatalogFeedback query={detail} label="Detail motivu" />}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Zavřít</Button>
        </DialogActions>
      </>
    );
  }
  return (
    <MotifForm
      initial={id ? detail.data : undefined}
      categories={categories.data}
      duplicate={duplicate}
      busy={busy}
      onDuplicate={id && !duplicate ? onDuplicate : undefined}
      onClose={onClose}
      onSaved={onSaved}
    >
      {id && !duplicate && (
        <section className="motif-editor-section" aria-labelledby="motif-photos-heading">
          <h3 id="motif-photos-heading">Fotografie hotového produktu (volitelné)</h3>
          <ImagesPanel motifId={id} busy={busy} />
        </section>
      )}
    </MotifForm>
  );
}

export function ProductsPanel() {
  const [preview, setPreview] = useState<AdminMotifList | null>(null);
  const [routeParams, setRouteParams] = useSearchParams();
  const motifId = routeParams.get("motiv");
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [active, setActive] = useState("true");
  const [editor, setEditor] = useState<Editor | null>(null);
  useEffect(() => {
    if (motifId) setEditor({ id: motifId });
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
    setEditor({ id });
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
                { label: "Náhled", width: 76, compact: true },
                { label: "Název", minWidth: 142 },
                { label: "Kategorie", width: "25%", minWidth: 108 },
                { label: "Cena motivu", align: "right", width: 120, compact: true },
                { label: "Stav", width: 124, compact: true },
                { label: "Akce", align: "right", compact: true },
              ]}
              page={page}
              pageCount={Math.ceil(products.data.count / 20)}
              onPageChange={setPage}
              empty={!products.data.count ? "Žádné motivy neodpovídají výběru." : undefined}
            >
              {products.data.results.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    {product.designImageUrl ? (
                      <ButtonBase
                        aria-label={`Zvětšit náhled: ${product.name}`}
                        onClick={() => setPreview(product)}
                        sx={{
                          display: "block",
                          width: 48,
                          height: 56,
                          borderRadius: 1,
                          "&:hover": { bgcolor: "action.hover" },
                          "&.Mui-focusVisible": {
                            outline: "2px solid",
                            outlineColor: "primary.main",
                          },
                        }}
                      >
                        <GarmentPreview design={product.designImageUrl} label="Motiv na tričku" />
                      </ButtonBase>
                    ) : (
                      <span aria-label="Náhled není k dispozici">—</span>
                    )}
                  </TableCell>
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
        open={preview !== null}
        onClose={() => setPreview(null)}
        aria-labelledby="motif-preview-title"
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle id="motif-preview-title">{preview?.name}</DialogTitle>
        <DialogContent dividers>
          {preview?.designImageUrl && (
            <div style={{ width: "100%", height: "min(52dvh, 440px)" }}>
              <GarmentPreview design={preview.designImageUrl} label={`${preview.name} na tričku`} />
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>Zavřít</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={editor !== null}
        onClose={busy ? undefined : closeEditor}
        maxWidth="sm"
        fullWidth
        className="motif-editor"
      >
        <DialogTitle>
          {editor?.duplicate ? "Duplikovat motiv" : editor?.id ? "Upravit motiv" : "Nový motiv"}
        </DialogTitle>
        {editor && (
          <EditMotif
            key={`${editor.id ?? "new"}:${editor.duplicate ? "copy" : "edit"}`}
            id={editor.id}
            duplicate={editor.duplicate}
            busy={busy}
            onDuplicate={() => setEditor({ id: editor.id, duplicate: true })}
            onClose={closeEditor}
            onSaved={() => {
              closeEditor();
              setMessage("Motiv byl uložen.");
              setPage(1);
            }}
          />
        )}
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
