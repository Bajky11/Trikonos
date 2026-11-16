import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Dialog, DialogContent, DialogTitle } from "@mui/material";
import { CatalogFeedback } from "../../components/Products";
import { allPages, useCatalogMutation } from "../catalog/api";
import { catalogError } from "../catalog/forms";
import { lookupApis, lookupTitles } from "./api";
import type { LookupKind, LookupItem } from "./api";

function ReorderForm({
  kind,
  initial,
  close,
}: {
  kind: LookupKind;
  initial: LookupItem[];
  close: () => void;
}) {
  const [items, setItems] = useState(initial),
    [error, setError] = useState("");
  const mutation = useCatalogMutation(kind, (ids: string[]) => lookupApis[kind].reorder({ ids }));
  const move = (index: number, offset: number) =>
    setItems((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
      return next;
    });
  return (
    <>
      <p>
        Pořadí všech položek včetně neaktivních, napříč stránkami. Filtry předchozího seznamu se
        neuplatňují. Server nastaví pozice 10, 20, 30…
      </p>
      <ol>
        {items.map((item, index) => (
          <li key={item.id}>
            {item.name}
            {!item.isActive && " (neaktivní)"}
            <Button
              aria-label={`Výš: ${item.name}`}
              disabled={mutation.isPending || index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </Button>
            <Button
              aria-label={`Níže: ${item.name}`}
              disabled={mutation.isPending || index === items.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </Button>
          </li>
        ))}
      </ol>
      {error && <p role="alert">{error}</p>}
      <Button
        disabled={mutation.isPending || !items.length}
        onClick={() => {
          if (new Set(items.map((item) => item.id)).size !== items.length) {
            setError("Seznam obsahuje duplicitní ID. Zavřete jej a načtěte znovu.");
            return;
          }
          void mutation
            .mutateAsync(items.map((item) => item.id))
            .then(close)
            .catch((error: unknown) => setError(catalogError(error)));
        }}
      >
        Uložit pořadí
      </Button>
      <Button disabled={mutation.isPending} onClick={close}>
        Zavřít pořadí
      </Button>
    </>
  );
}
export function ReorderDialog({ kind, close }: { kind: LookupKind; close: () => void }) {
  const all = useQuery({
    queryKey: [`/api/v1/admin/${kind}`, "reorder-all"],
    queryFn: ({ signal }) =>
      allPages((page) => lookupApis[kind].list({ page, pageSize: 100 }, { signal })),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 0,
  });
  return (
    <Dialog open fullWidth maxWidth="sm">
      <DialogTitle>Pořadí — {lookupTitles[kind]}</DialogTitle>
      <DialogContent>
        <CatalogFeedback query={all} label="Úplný číselník" />
        {all.isSuccess ? (
          <ReorderForm kind={kind} initial={all.data} close={close} />
        ) : (
          <Button onClick={close}>Zavřít pořadí</Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
