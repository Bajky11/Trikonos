import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Pagination,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import {
  adminUsersCreate,
  adminUsersDestroy,
  adminUsersPartialUpdate,
  getAdminAuthMeRetrieveQueryKey,
  useAdminUsersList,
} from "../../api/generated/api";
import type { AdminUser } from "../../api/generated/models";
import { ApiError } from "../../api/http";
import { withCsrf } from "../../auth/csrf";
import { replaceSession, useSession } from "../../auth/session";
import { CatalogFeedback } from "../../components/Products";
import { catalogError, formText } from "../catalog/forms";
import { dateTime } from "../orders/labels";

export function UsersPanel() {
  const client = useQueryClient(),
    session = useSession();
  const [page, setPage] = useState(1),
    [editing, setEditing] = useState<{ user?: AdminUser } | null>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const active = useRef(false);
  const list = useAdminUsersList(
    { page, pageSize: 20 },
    { query: { retry: false, refetchOnWindowFocus: false }, request: { cache: "no-store" } },
  );
  const write = useMutation({
    mutationKey: ["admin-users-write"],
    gcTime: 0,
    retry: false,
    mutationFn: (request: () => Promise<unknown>) => withCsrf(request),
  });
  const run = (request: () => Promise<unknown>, success: string, deactivateSelf = false) => {
    if (active.current || uncertain) return;
    active.current = true;
    setError("");
    setMessage("");
    void write
      .mutateAsync(request)
      .then(async () => {
        setEditing(null);
        setMessage(success);
        if (deactivateSelf) await replaceSession(client, null);
        else {
          await client.invalidateQueries({
            predicate: (query) =>
              typeof query.queryKey[0] === "string" &&
              query.queryKey[0].startsWith("/api/v1/admin/users"),
          });
          await client.invalidateQueries({ queryKey: getAdminAuthMeRetrieveQueryKey() });
        }
      })
      .catch((error: unknown) => {
        const unknown = !(error instanceof ApiError) || error.status >= 500;
        setUncertain(unknown);
        setError(
          unknown
            ? "Výsledek není potvrzený. Nejprve obnovte seznam účtů, akci neopakujte naslepo."
            : error instanceof ApiError && error.code === "LAST_ADMIN"
              ? "Poslední aktivní účet administrace nelze deaktivovat ani smazat."
              : error instanceof ApiError && error.code === "EMAIL_TAKEN"
                ? "Účet s tímto e-mailem již existuje."
                : catalogError(error),
        );
      })
      .finally(() => {
        active.current = false;
        write.reset();
      });
  };
  const busy = write.isPending || uncertain;
  return (
    <Paper className="admin-panel" variant="outlined">
      <h2>Administrátorské účty</h2>
      <p>
        Všechny účty mají stejná administrátorská oprávnění. Nejde o zákaznické záznamy. Seznam je
        stránkovaný, API nemá filtr hledání.
      </p>
      <Button
        disabled={busy}
        onClick={() => {
          setError("");
          setEditing({});
        }}
      >
        Vytvořit účet
      </Button>
      <Button
        disabled={write.isPending}
        onClick={() => {
          void list.refetch().then((result) => {
            if (result.isSuccess) {
              setUncertain(false);
              setError("");
            }
          });
        }}
      >
        Obnovit účty
      </Button>
      <Button component={Link} to="/zapomenute-heslo">
        Vyžádat odkaz pro nastavení hesla
      </Button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <CatalogFeedback query={list} label="Administrátorské účty" />
      {list.isSuccess && (
        <>
          <Table aria-label="Administrátorské účty">
            <TableHead>
              <TableRow>
                {["E-mail", "Jméno", "Stav", "Akce"].map((label) => (
                  <TableCell key={label}>{label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.data.results.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    {user.email}
                    {user.id === session.data?.id && " (váš účet)"}
                  </TableCell>
                  <TableCell>
                    {user.name}
                    <br />
                    {dateTime(user.createdAt)}
                  </TableCell>
                  <TableCell>{user.isActive ? "Aktivní" : "Neaktivní"}</TableCell>
                  <TableCell>
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setEditing({ user });
                      }}
                    >
                      Upravit účet
                    </Button>
                    <Button
                      color="error"
                      disabled={busy || user.id === session.data?.id}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Nenávratně smazat účet ${user.email}? Bezpečnější možnost je deaktivace.`,
                          )
                        )
                          run(() => adminUsersDestroy(user.id), "Účet byl smazaný.");
                      }}
                    >
                      Smazat účet
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            count={Math.max(1, Math.ceil(list.data.count / 20))}
            onChange={(_, value) => setPage(value)}
          />
        </>
      )}
      <Dialog
        open={editing !== null}
        onClose={write.isPending ? undefined : () => setEditing(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{editing?.user ? "Upravit účet" : "Vytvořit účet"}</DialogTitle>
        <DialogContent>
          {editing && (
            <form
              key={editing.user?.id || "new"}
              onSubmit={(event) => {
                event.preventDefault();
                if (busy) return;
                const data = new FormData(event.currentTarget),
                  name = formText(data, "name").trim();
                if (editing.user) {
                  const isActive = data.get("isActive") === "on",
                    own = editing.user.id === session.data?.id;
                  if (
                    !isActive &&
                    !window.confirm(
                      `Deaktivovat ${editing.user.email}${own ? " a ukončit svůj přístup" : ""}?`,
                    )
                  )
                    return;
                  run(
                    () => adminUsersPartialUpdate(editing.user!.id, { name, isActive }),
                    "Účet byl uložený.",
                    own && !isActive,
                  );
                } else {
                  const email = formText(data, "email").trim();
                  run(
                    () => adminUsersCreate({ email, name }),
                    "Účet byl vytvořený a bylo vyvoláno odeslání odkazu pro nastavení hesla.",
                  );
                }
              }}
            >
              <fieldset className="checkout-fields" disabled={busy}>
                {editing.user ? (
                  <p>{editing.user.email}</p>
                ) : (
                  <TextField
                    name="email"
                    label="E-mail nového účtu"
                    type="email"
                    required
                    slotProps={{ htmlInput: { maxLength: 254 } }}
                  />
                )}
                <TextField
                  name="name"
                  label="Jméno administrátora"
                  required
                  defaultValue={editing.user?.name || ""}
                  slotProps={{ htmlInput: { maxLength: 255 } }}
                />
                {editing.user ? (
                  <FormControlLabel
                    label="Aktivní účet"
                    control={<Checkbox name="isActive" defaultChecked={editing.user.isActive} />}
                  />
                ) : (
                  <p>
                    Heslo se zde nezadává. Novému účtu backend odešle odkaz na jeho nastavení; musí
                    být funkční SMTP. Případné opětovné vyžádání odkazu je na stránce obnovy hesla.
                  </p>
                )}
                {error && <p role="alert">{error}</p>}
                <Button type="submit" variant="contained">
                  Uložit účet
                </Button>
              </fieldset>
            </form>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={write.isPending} onClick={() => setEditing(null)}>
            Zavřít
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
