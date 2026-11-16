import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Button, TextField } from "@mui/material";
import { ApiError } from "../api/http";
import { useLogin, useSession } from "./session";

function destination(state: unknown) {
  const from = state && typeof state === "object" && "from" in state ? state.from : undefined;
  return typeof from === "string" && /^\/admin(?:[/?#]|$)/.test(from) ? from : "/admin";
}

export function LoginForm() {
  const session = useSession();
  const login = useLogin();
  const location = useLocation();
  const [error, setError] = useState("");
  const target = destination(location.state);
  if (session.data) return <Navigate to={target} replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (login.isPending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = data.get("email");
    const password = data.get("password");
    if (typeof email !== "string" || typeof password !== "string") return;
    setError("");
    try {
      await login.mutateAsync({
        email: email.trim(),
        password,
      });
    } catch (error) {
      setError(
        error instanceof ApiError && error.status === 401
          ? "Nesprávný e-mail nebo heslo."
          : error instanceof ApiError && error.status === 429
            ? "Příliš mnoho pokusů. Zkuste přihlášení později."
            : "Přihlášení se nezdařilo. Zkontrolujte spojení a zkuste to znovu.",
      );
    } finally {
      // Do not retain credentials in the mutation cache after the request.
      login.reset();
      const password = form.elements.namedItem("password");
      if (password instanceof HTMLInputElement) password.value = "";
    }
  };

  return (
    <form className="dialog-form" onSubmit={(event) => void submit(event)}>
      <TextField
        label="E-mail"
        name="email"
        type="email"
        autoComplete="username"
        required
        autoFocus
        disabled={login.isPending}
      />
      <TextField
        label="Heslo"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        disabled={login.isPending}
      />
      {error && <p role="alert">{error}</p>}
      <Button variant="contained" type="submit" disabled={login.isPending}>
        {login.isPending ? "Přihlašování…" : "Přihlásit se →"}
      </Button>
      <Link to="/zapomenute-heslo">Zapomenuté heslo</Link>
    </form>
  );
}
