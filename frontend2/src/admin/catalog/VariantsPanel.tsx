import { DataTable } from "../../components/DataTable";
import { useState } from "react";
import type { FormEvent } from "react";
import { useIsMutating } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  TableCell,
  TableRow,
  TextField,
} from "@mui/material";
import {
  adminMotifVariantsCreate,
  adminMotifVariantsDestroy,
  adminMotifVariantsPartialUpdate,
  useAdminMotifVariantsList,
} from "../../api/generated/api";
import type { AdminMotifVariantsCreateMutationBody } from "../../api/generated/api";
import { SizeEnum } from "../../api/generated/models";
import type { AdminMotifVariant } from "../../api/generated/models";
import { CatalogFeedback } from "../../components/Products";
import { catalogMutationKey, useCatalogMutation, useVariantLookups } from "./api";
import { catalogError, formText } from "./forms";

type Lookups = NonNullable<ReturnType<typeof useVariantLookups>["data"]>;

function lookupName(choices: { id: string; name: string; isActive?: boolean }[], id: string) {
  const item = choices.find((item) => item.id === id);
  return item ? `${item.name}${item.isActive ? "" : " (neaktivní)"}` : id;
}

function VariantForm({
  motifId,
  initial,
  lookups,
  onSaved,
  onCancel,
}: {
  motifId: string;
  initial: AdminMotifVariant | null;
  lookups: Lookups;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const choicesReady =
    lookups.productTypes.length > 0 && lookups.cuts.length > 0 && lookups.colors.length > 0;
  const save = useCatalogMutation("motif-variants", (data: AdminMotifVariantsCreateMutationBody) =>
    initial ? adminMotifVariantsPartialUpdate(initial.id, data) : adminMotifVariantsCreate(data),
  );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (save.isPending) return;
    const data = new FormData(event.currentTarget);
    const size = Object.values(SizeEnum).find((value) => value === formText(data, "size"));
    if (!size) return;
    setError("");
    setMessage("");
    try {
      await save.mutateAsync({
        motifId,
        productTypeId: formText(data, "productTypeId"),
        cutId: formText(data, "cutId"),
        colorId: formText(data, "colorId"),
        size,
        isActive: data.get("isActive") === "on",
      });
      setMessage("Varianta byla uložena.");
      onSaved();
    } catch (error) {
      setError(catalogError(error));
    }
  };
  return (
    <form
      className="dialog-form"
      onSubmit={(event) => void submit(event)}
      aria-label="Povolená varianta"
    >
      <h3>{initial ? "Upravit kombinaci" : "Přidat kombinaci"}</h3>
      {(
        [
          ["productTypeId", "Typ oblečení", lookups.productTypes, initial?.productTypeId],
          ["cutId", "Střih", lookups.cuts, initial?.cutId],
          ["colorId", "Barva", lookups.colors, initial?.colorId],
        ] as const
      ).map(([field, label, choices, value]) => (
        <TextField
          key={field}
          name={field}
          label={label}
          select
          required
          defaultValue={value ?? ""}
          disabled={save.isPending}
        >
          <MenuItem value="">Vyberte možnost</MenuItem>
          {choices.map((choice) => (
            <MenuItem key={choice.id} value={choice.id}>
              {choice.name}
              {!choice.isActive && " (neaktivní)"}
            </MenuItem>
          ))}
        </TextField>
      ))}
      <TextField
        name="size"
        label="Velikost"
        select
        required
        defaultValue={initial?.size ?? ""}
        disabled={save.isPending}
      >
        <MenuItem value="">Vyberte velikost</MenuItem>
        {Object.values(SizeEnum).map((value) => (
          <MenuItem key={value} value={value}>
            {value}
          </MenuItem>
        ))}
      </TextField>
      <FormControlLabel
        control={
          <Checkbox
            name="isActive"
            defaultChecked={initial?.isActive ?? true}
            disabled={save.isPending}
          />
        }
        label="Kombinace je povolená"
      />
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!choicesReady && (
        <p role="alert">Nejdříve doplňte typ oblečení, střih a barvu ve správě backendu.</p>
      )}
      <div>
        <Button variant="contained" type="submit" disabled={save.isPending || !choicesReady}>
          Uložit variantu
        </Button>
        {initial && (
          <Button disabled={save.isPending} onClick={onCancel}>
            Zrušit úpravu
          </Button>
        )}
      </div>
    </form>
  );
}

export function VariantsPanel({ motifId }: { motifId: string }) {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminMotifVariant | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const variants = useAdminMotifVariantsList({ motif: motifId, page, pageSize: 20 });
  const lookups = useVariantLookups();
  const busy = useIsMutating({ mutationKey: catalogMutationKey }) > 0;
  const remove = useCatalogMutation("motif-variants", (id: string) =>
    adminMotifVariantsDestroy(id),
  );
  return (
    <>
      <p>
        V katalogu jsou dostupné pouze povolené kombinace s aktivními číselníky u zveřejněného
        motivu.
      </p>
      <CatalogFeedback query={lookups} label="Číselníky" />
      <CatalogFeedback query={variants} label="Varianty" />
      {variants.isError && page > 1 && <Button onClick={() => setPage(1)}>První stránka</Button>}
      {lookups.isSuccess && (
        <>
          {variants.data && (
            <>
              <DataTable
                label="Povolené kombinace"
                columns={[
                  { label: "Typ oblečení", minWidth: 114 },
                  { label: "Střih", width: "16%", minWidth: 80 },
                  { label: "Barva", width: "16%", minWidth: 80 },
                  { label: "Velikost", align: "center", compact: true },
                  { label: "Povolena", align: "center", compact: true },
                  { label: "Akce", align: "right", width: 214, minWidth: 112 },
                ]}
                page={page}
                pageCount={Math.ceil(variants.data.count / 20)}
                onPageChange={setPage}
                paginationDisabled={busy}
                empty={!variants.data.count ? "Motiv zatím nemá žádné kombinace." : undefined}
              >
                {variants.data.results.map((variant) => (
                  <TableRow key={variant.id}>
                    <TableCell>
                      {lookupName(lookups.data.productTypes, variant.productTypeId)}
                    </TableCell>
                    <TableCell>{lookupName(lookups.data.cuts, variant.cutId)}</TableCell>
                    <TableCell>{lookupName(lookups.data.colors, variant.colorId)}</TableCell>
                    <TableCell align="center" className="data-table-nowrap">
                      {variant.size}
                    </TableCell>
                    <TableCell align="center">{variant.isActive ? "Ano" : "Ne"}</TableCell>
                    <TableCell align="right">
                      <div className="data-table-actions">
                        <Button
                          variant="outlined"
                          disabled={busy}
                          onClick={() => setEditing(variant)}
                        >
                          Upravit
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          disabled={busy}
                          onClick={() => {
                            setError("");
                            setDeleting(variant.id);
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
          <VariantForm
            key={editing?.id ?? "new"}
            motifId={motifId}
            initial={editing}
            lookups={lookups.data}
            onSaved={() => {
              setEditing(null);
              setPage(1);
            }}
            onCancel={() => setEditing(null)}
          />
        </>
      )}
      <Dialog
        open={deleting !== null}
        onClose={remove.isPending ? undefined : () => setDeleting(null)}
      >
        <DialogTitle>Smazat kombinaci?</DialogTitle>
        <DialogContent>
          <p>Odebráním kombinace ji zákazník přestane moci objednat.</p>
          {error && <p role="alert">{error}</p>}
        </DialogContent>
        <DialogActions>
          <Button disabled={remove.isPending} onClick={() => setDeleting(null)}>
            Zrušit
          </Button>
          <Button
            disabled={remove.isPending}
            color="error"
            onClick={() => {
              if (deleting)
                void remove
                  .mutateAsync(deleting)
                  .then(() => {
                    if (editing?.id === deleting) setEditing(null);
                    setDeleting(null);
                    setPage(1);
                  })
                  .catch((error: unknown) => setError(catalogError(error)));
            }}
          >
            Smazat kombinaci
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
