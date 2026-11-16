import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { useAdminSearchRetrieve } from "../api/generated/api";
import { CatalogFeedback } from "../components/Products";

export function GlobalSearch() {
  const [open, setOpen] = useState(false),
    [input, setInput] = useState(""),
    [q, setQ] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);
  const search = useAdminSearchRetrieve(
    { q },
    {
      query: {
        enabled: open && !!q,
        retry: false,
        refetchOnWindowFocus: false,
        gcTime: 0,
        staleTime: 0,
      },
      request: { cache: "no-store" },
    },
  );
  const close = () => {
    setOpen(false);
    setInput("");
    setQ("");
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>Globální hledání</Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <DialogTitle>Globální hledání</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Hledat objednávky, zákazníky a motivy"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <p>API vrací nejvýše 5 výsledků z každé oblasti. Úplné seznamy otevřete samostatně.</p>
          {q && <CatalogFeedback query={search} label="Globální hledání" />}
          {q === input.trim() && q && search.isSuccess && (
            <>
              <h3>Objednávky</h3>
              {search.data.orders.map((order) => (
                <p key={order.id}>
                  <Link onClick={close} to={`/admin/objednavky/${order.id}`}>
                    {order.orderNumber} · {order.customerEmail}
                  </Link>
                </p>
              ))}
              <h3>Zákazníci</h3>
              {search.data.customers.map((customer) => (
                <p key={customer.id}>
                  <Link onClick={close} to={`/admin/klienti/${customer.id}`}>
                    {customer.name} · {customer.email}
                  </Link>
                </p>
              ))}
              <h3>Motivy</h3>
              {search.data.motifs.map((motif) => (
                <p key={motif.id}>
                  <Link
                    onClick={close}
                    to={`/admin/produkty?motiv=${encodeURIComponent(motif.id)}`}
                  >
                    {motif.name}
                  </Link>
                </p>
              ))}
              {!search.data.orders.length &&
                !search.data.customers.length &&
                !search.data.motifs.length && <p role="status">Nic nenalezeno.</p>}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Zavřít hledání</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
