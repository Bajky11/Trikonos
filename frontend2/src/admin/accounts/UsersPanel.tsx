import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  TableCell,
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
import { DataTable } from "../../components/DataTable";
import { AdminSectionHeader } from "../AdminSectionHeader";
import { PasswordPage } from "../../auth/PasswordPage";
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
  const [showPassword, setShowPassword] = useState(useLocation().hash === "#heslo");
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
    <>
      <Paper
        className="admin-panel"
        variant="outlined"
        component="section"
        aria-labelledby="current-account-heading"
      >
        <AdminSectionHeader
          title="Váš účet"
          titleId="current-account-heading"
          actions={
            session.data && (
              <>
                <Button
                  variant="contained"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setEditing({ user: { ...session.data!, isActive: true, createdAt: "" } });
                  }}
                >
                  Upravit účet
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-expanded={showPassword}
                >
                  Změnit heslo
                </Button>
              </>
            )
          }
        />
        <div className="admin-panel-body">
          {session.data && (
            <p>
              <strong>{session.data.name}</strong>
              <br />
              {session.data.email}
            </p>
          )}
          {showPassword && <PasswordPage mode="change" />}
        </div>
      </Paper>
      <Paper className="admin-panel dictionary-panel" variant="outlined">
        <AdminSectionHeader
          title="Ostatní účty"
          actions={
            <>
              <Button
                variant="outlined"
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
              <Button variant="outlined" component={Link} to="/zapomenute-heslo">
                Vyžádat odkaz pro nastavení hesla
              </Button>
              <Button
                variant="contained"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setEditing({});
                }}
              >
                Vytvořit účet
              </Button>
            </>
          }
        />
        <div className="admin-panel-body">
          <p>
            Všechny účty mají stejná administrátorská oprávnění. Nejde o zákaznické záznamy. Seznam
            je stránkovaný, API nemá filtr hledání.
          </p>
          {error && <p role="alert">{error}</p>}
          {message && <p role="status">{message}</p>}
          <CatalogFeedback query={list} label="Administrátorské účty" />
        </div>
        {list.isSuccess && (
          <>
            <DataTable
              label="Administrátorské účty"
              columns={[
                { label: "E-mail", width: "35%", minWidth: 160 },
                { label: "Jméno", minWidth: 124 },
                { label: "Stav", compact: true },
                { label: "Akce", align: "right", width: 260, minWidth: 144 },
              ]}
              page={page}
              pageCount={Math.ceil(list.data.count / 20)}
              onPageChange={setPage}
              empty={
                list.data.results.filter((user) => user.id !== session.data?.id).length === 0
                  ? "Na této stránce nejsou žádné další účty."
                  : undefined
              }
            >
              {list.data.results
                .filter((user) => user.id !== session.data?.id)
                .map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="data-table-wrap">
                      {user.email}
                      {user.id === session.data?.id && " (váš účet)"}
                    </TableCell>
                    <TableCell className="data-table-wrap">
                      {user.name}
                      <span className="data-table-secondary">{dateTime(user.createdAt)}</span>
                    </TableCell>
                    <TableCell>{user.isActive ? "Aktivní" : "Neaktivní"}</TableCell>
                    <TableCell align="right">
                      <div className="data-table-actions">
                        <Button
                          variant="outlined"
                          disabled={busy}
                          onClick={() => {
                            setError("");
                            setEditing({ user });
                          }}
                        >
                          Upravit účet
                        </Button>
                        <Button
                          variant="outlined"
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </DataTable>
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
                      Heslo se zde nezadává. Novému účtu backend odešle odkaz na jeho nastavení;
                      musí být funkční SMTP. Případné opětovné vyžádání odkazu je na stránce obnovy
                      hesla.
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
    </>
  );
}
