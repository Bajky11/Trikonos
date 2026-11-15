import { useEffect, useState } from "react";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Pagination,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
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
import { catalogMutationKey, useAdminCategories, useCatalogMutation } from "./api";
import { catalogError } from "./forms";
import { MotifForm } from "./MotifForm";
import { VariantsPanel } from "./VariantsPanel";

type Editor = { mode: "motif"; id?: string } | { mode: "variants"; id: string; name: string };

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

export function ProductsPanel({ search }: { search: string }) {
  const client = useQueryClient();
  const [q, setQ] = useState(search.trim());
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [active, setActive] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
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
        <div className="admin-catalog-toolbar">
          <h2>Motivy</h2>
          <Button
            variant="contained"
            disabled={!categories.isSuccess || !categories.data.length}
            onClick={() => edit()}
          >
            Přidat motiv
          </Button>
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
            <TableContainer>
              <Table aria-label="Motivy">
                <TableHead>
                  <TableRow>
                    {["Název", "Kategorie", "Cena motivu", "Stav", "Akce"].map((label) => (
                      <TableCell key={label}>{label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {products.data.results.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell component="th" scope="row">
                        {product.name}
                      </TableCell>
                      <TableCell>{product.category.name}</TableCell>
                      <TableCell>{money(product.price / 100)}</TableCell>
                      <TableCell>{product.isActive ? "Zveřejněný" : "Koncept"}</TableCell>
                      <TableCell>
                        <Button disabled={!categories.isSuccess} onClick={() => edit(product.id)}>
                          Upravit
                        </Button>
                        <Button
                          onClick={() =>
                            setEditor({ mode: "variants", id: product.id, name: product.name })
                          }
                        >
                          Varianty
                        </Button>
                        <Button
                          color="error"
                          onClick={() => {
                            setError("");
                            setDeleting(product);
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
            {!products.data.count && (
              <p role="status" className="admin-empty">
                Žádné motivy neodpovídají výběru.
              </p>
            )}
            <Pagination
              count={Math.max(1, Math.ceil(products.data.count / 20))}
              page={page}
              onChange={(_, value) => setPage(value)}
            />
          </>
        )}
      </Paper>
      <Dialog
        open={editor !== null}
        onClose={busy ? undefined : () => setEditor(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {editor?.mode === "variants"
            ? `Varianty: ${editor.name}`
            : editor?.id
              ? "Upravit motiv"
              : "Nový motiv"}
        </DialogTitle>
        <DialogContent>
          {editor?.mode === "variants" ? (
            <VariantsPanel key={editor.id} motifId={editor.id} />
          ) : (
            editor && (
              <EditMotif
                key={editor.id ?? "new"}
                id={editor.id}
                onSaved={() => {
                  setEditor(null);
                  setMessage("Motiv byl uložen.");
                  setPage(1);
                }}
              />
            )
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setEditor(null)}>
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
