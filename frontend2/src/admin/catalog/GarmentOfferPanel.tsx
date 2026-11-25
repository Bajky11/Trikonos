import { useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper } from "@mui/material";
import { adminGarmentOfferUpdate, useAdminGarmentOfferRetrieve } from "../../api/generated/api";
import type { GarmentOffer } from "../../api/generated/models";
import { ApiError } from "../../api/http";
import { CatalogFeedback } from "../../components/Products";
import { AdminSectionHeader } from "../AdminSectionHeader";
import { useCatalogMutation, useVariantLookups } from "./api";
import { catalogError } from "./forms";
import {
  blocksFromVariants,
  OfferBlocks,
  validateBlocks,
  variantKey,
  variantsFromBlocks,
} from "./OfferBlocks";

function Editor({ initial, reload }: { initial: GarmentOffer; reload: () => Promise<void> }) {
  const lookups = useVariantLookups();
  const [base, setBase] = useState(initial);
  const [blocks, setBlocks] = useState(() => blocksFromVariants(initial.variants));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [conflict, setConflict] = useState(false);
  const write = useCatalogMutation("garment-offer", adminGarmentOfferUpdate);
  const desired = variantsFromBlocks(blocks);
  const old = new Set(base.variants.map(variantKey));
  const changed = desired.size !== old.size || [...desired.keys()].some((key) => !old.has(key));

  async function save() {
    try {
      const result = await write.mutateAsync({
        revision: base.revision,
        variants: [...desired.values()],
      });
      setBase(result);
      setBlocks(blocksFromVariants(result.variants));
      setMessage("Společná nabídka byla uložena.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "GARMENT_OFFER_CHANGED") {
        setConflict(true);
        setError("Nabídku mezitím někdo změnil. Načtěte ji znovu a zopakujte úpravy.");
      } else setError(catalogError(cause));
    } finally {
      setConfirm(false);
    }
  }

  return (
    <>
      <CatalogFeedback query={lookups} label="Číselníky" />
      {lookups.data && (
        <OfferBlocks
          blocks={blocks}
          onChange={setBlocks}
          lookups={lookups.data}
          disabled={write.isPending || conflict}
        />
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {conflict && <Button onClick={() => void reload()}>Načíst aktuální nabídku</Button>}
      <Button
        variant="contained"
        disabled={
          (!changed && !validateBlocks(blocks)) || !lookups.isSuccess || write.isPending || conflict
        }
        onClick={() => {
          const validation = validateBlocks(blocks);
          setError(validation);
          setMessage("");
          if (!validation) setConfirm(true);
        }}
      >
        Uložit nabídku
      </Button>
      <Dialog open={confirm} onClose={write.isPending ? undefined : () => setConfirm(false)}>
        <DialogTitle>Změnit společnou nabídku?</DialogTitle>
        <DialogContent>Změna platí pro nové objednávky z katalogu i vlastní potisk.</DialogContent>
        <DialogActions>
          <Button disabled={write.isPending} onClick={() => setConfirm(false)}>
            Zrušit
          </Button>
          <Button disabled={write.isPending} onClick={() => void save()}>
            Potvrdit změny
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export function GarmentOfferPanel() {
  const offer = useAdminGarmentOfferRetrieve();
  const [revision, setRevision] = useState(0);
  return (
    <Paper className="admin-panel garment-offer-panel" variant="outlined">
      <AdminSectionHeader title="Společná nabídka oblečení" />
      <p>
        Pro každý typ a střih vyberte barvy a velikosti. Velikosti platí pro všechny vybrané barvy.
      </p>
      <CatalogFeedback query={offer} label="Společná nabídka" />
      {offer.data && (
        <Editor
          key={revision}
          initial={offer.data}
          reload={async () => {
            const result = await offer.refetch();
            if (result.isSuccess) setRevision((value) => value + 1);
          }}
        />
      )}
    </Paper>
  );
}
