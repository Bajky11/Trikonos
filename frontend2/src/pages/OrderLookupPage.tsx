import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Button, TextField, Typography } from "@mui/material";
import { ordersLookupCreate } from "../api/generated/api";
import { publicFormError } from "../api/publicFormError";
import { withCsrf } from "../auth/csrf";
import { text } from "../checkout/forms";
import { useTitle } from "../useTitle";

export function OrderLookupPage() {
  useTitle("Stav objednávky — Trikonoš");
  const navigate = useNavigate();
  const active = useRef(false);
  const [error, setError] = useState("");
  const lookup = useMutation({
    mutationFn: (body: Parameters<typeof ordersLookupCreate>[0]) =>
      withCsrf(() =>
        ordersLookupCreate(body, { cache: "no-store", referrerPolicy: "no-referrer" }),
      ),
    retry: false,
    gcTime: 0,
  });
  return (
    <main className="shell page-main">
      <Typography variant="h1">Stav objednávky</Typography>
      <p>
        Zadejte číslo objednávky z potvrzovacího e-mailu a e-mail použitý při objednání. Údaje se
        neposílají v adrese stránky.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (active.current) return;
          const form = event.currentTarget;
          const data = new FormData(form);
          active.current = true;
          setError("");
          void lookup
            .mutateAsync({ orderNumber: text(data, "orderNumber"), email: text(data, "email") })
            .then(async (result) => {
              if (!result.accessToken) throw new Error("Missing access token");
              form.reset();
              await navigate(`/objednavka#pristup=${encodeURIComponent(result.accessToken)}`, {
                replace: true,
              });
            })
            .catch((error: unknown) => setError(publicFormError(error, "lookup")))
            .finally(() => {
              active.current = false;
              lookup.reset();
            });
        }}
      >
        <fieldset className="checkout-fields" disabled={lookup.isPending}>
          <legend>Dohledání objednávky</legend>
          <TextField
            name="orderNumber"
            label="Číslo objednávky"
            required
            slotProps={{ htmlInput: { maxLength: 50 } }}
          />
          <TextField
            name="email"
            label="E-mail objednávky"
            type="email"
            required
            slotProps={{ htmlInput: { maxLength: 254, autoComplete: "email" } }}
          />
          {error && <p role="alert">{error}</p>}
          <Button variant="contained" type="submit">
            {lookup.isPending ? "Dohledávání…" : "Dohledat objednávku"}
          </Button>
        </fieldset>
      </form>
      <p>
        Máte-li rozpracované odeslání v této kartě, dohledání je nenahrazuje ani neodemyká košík.
      </p>
      <Button component={Link} to="/pokladna">
        Přejít do pokladny
      </Button>
    </main>
  );
}
