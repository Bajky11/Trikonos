import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Paper, TextField } from "@mui/material";
import {
  adminAuthPasswordCreate,
  adminAuthPasswordResetCreate,
  adminAuthPasswordResetConfirmCreate,
} from "../api/generated/api";
import { ApiError, clearCsrfToken } from "../api/http";
import { withCsrf } from "./csrf";
import { replaceSession } from "./session";
import { catalogError, formText } from "../admin/catalog/forms";
import { useTitle } from "../useTitle";
import { markPasswordChanged } from "./notice";

export function PasswordPage({ mode }: { mode: "request" | "confirm" | "change" }) {
  const location = useLocation(),
    navigate = useNavigate(),
    client = useQueryClient();
  const [link, setLink] = useState(() => {
    const params = new URLSearchParams(location.search);
    return { uid: params.get("uid") || "", token: params.get("token") || "" };
  });
  const [error, setError] = useState(""),
    [done, setDone] = useState(false);
  const active = useRef(false);
  const title =
    mode === "request" ? "Obnova hesla" : mode === "confirm" ? "Nastavení hesla" : "Změna hesla";
  useTitle(mode === "change" ? "Účty — admin" : `${title} — administrace`);
  useEffect(() => {
    if (mode === "confirm" && location.search) void navigate(location.pathname, { replace: true });
  }, [mode, location.pathname, location.search, navigate]);
  const mutation = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (request: () => Promise<unknown>) => withCsrf(request),
  });
  return (
    <Paper
      component={mode === "change" ? "section" : "main"}
      variant={mode === "change" ? "outlined" : undefined}
      elevation={0}
      square
      className={
        mode === "change" ? "admin-panel admin-panel-body admin-password" : "shell page-main"
      }
      sx={mode === "change" ? undefined : { background: "transparent" }}
    >
      {mode === "change" ? <h2>{title}</h2> : <h1>{title}</h1>}
      {done ? (
        <>
          <p role="status">
            {mode === "request"
              ? "Pokud účet existuje, bylo vyvoláno odeslání odkazu na jeho e-mail. Zkontrolujte také spam; doručení závisí na konfiguraci pošty."
              : "Heslo bylo nastavené. Přihlaste se novým heslem."}
          </p>
          <Button component={Link} to="/prihlaseni">
            Přejít na přihlášení
          </Button>
        </>
      ) : mode === "confirm" && (!link.uid || !link.token) ? (
        <>
          <p role="alert">
            Chybí přístupové údaje odkazu. Otevřete celý odkaz z e-mailu; po obnovení stránky jej
            může být potřeba otevřít znovu.
          </p>
          <Link to="/zapomenute-heslo">Vyžádat nový odkaz</Link>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (active.current) return;
            const form = event.currentTarget,
              data = new FormData(form),
              email = formText(data, "email").trim(),
              currentPassword = formText(data, "currentPassword"),
              newPassword = formText(data, "newPassword");
            if (mode !== "request" && newPassword !== formText(data, "repeatPassword")) {
              setError("Nové heslo a jeho zopakování se liší.");
              return;
            }
            form.reset();
            setError("");
            active.current = true;
            const request =
              mode === "request"
                ? () => adminAuthPasswordResetCreate({ email })
                : mode === "change"
                  ? () => adminAuthPasswordCreate({ currentPassword, newPassword })
                  : () => adminAuthPasswordResetConfirmCreate({ ...link, newPassword });
            void mutation
              .mutateAsync(request)
              .then(async () => {
                if (mode === "change") markPasswordChanged();
                if (mode !== "request") {
                  setLink({ uid: "", token: "" });
                  clearCsrfToken();
                  await replaceSession(client, null);
                }
                if (mode === "change")
                  await navigate("/prihlaseni", {
                    replace: true,
                    state: { passwordChanged: true },
                  });
                else setDone(true);
              })
              .catch((error: unknown) =>
                setError(
                  error instanceof ApiError && error.status === 429
                    ? "Příliš mnoho pokusů. Vyčkejte alespoň minutu."
                    : mode === "confirm" && error instanceof ApiError && error.status === 400
                      ? `Odkaz může být neplatný, prošlý nebo heslo nesplňuje pravidla. ${catalogError(error)}`
                      : catalogError(error),
                ),
              )
              .finally(() => {
                active.current = false;
                mutation.reset();
              });
          }}
        >
          <fieldset className="checkout-fields" disabled={mutation.isPending}>
            {mode === "request" ? (
              <TextField
                label="E-mail účtu"
                name="email"
                type="email"
                required
                autoComplete="email"
              />
            ) : (
              <>
                {mode === "change" && (
                  <TextField
                    label="Současné heslo"
                    name="currentPassword"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                )}
                <TextField
                  label="Nové heslo"
                  name="newPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                />
                <TextField
                  label="Zopakovat nové heslo"
                  name="repeatPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                />
                <p>
                  Heslo musí splnit validátory backendu. Po změně se přihlaste znovu. Hesla se
                  neukládají do úložiště prohlížeče.
                </p>
              </>
            )}
            {error && <p role="alert">{error}</p>}
            <Button type="submit" variant="contained">
              {mutation.isPending
                ? "Odesílání…"
                : mode === "request"
                  ? "Vyžádat odkaz"
                  : "Uložit nové heslo"}
            </Button>
            {mode === "confirm" && <Link to="/zapomenute-heslo">Vyžádat nový odkaz</Link>}
          </fieldset>
        </form>
      )}
    </Paper>
  );
}
