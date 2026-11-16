import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, TextField, Typography } from "@mui/material";
import { contactCreate, useConfigRetrieve } from "../api/generated/api";
import { publicFormError } from "../api/publicFormError";
import { withCsrf } from "../auth/csrf";
import { text } from "../checkout/forms";
import { useTitle } from "../useTitle";

export function ContactPage() {
  useTitle("Kontakt a poptávka — Trikonoš");
  const active = useRef(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const config = useConfigRetrieve();
  const contact = useMutation({
    mutationFn: (body: Parameters<typeof contactCreate>[0]) => withCsrf(() => contactCreate(body)),
    retry: false,
    gcTime: 0,
  });
  return (
    <main className="shell page-main">
      <Typography variant="h1">Kontakt a poptávka</Typography>
      <p>
        Napište nám dotaz nebo poptávku pro tým. Formulář nevytváří objednávku; nepřikládejte
        citlivé údaje ani přístupové odkazy.
      </p>
      {config.data?.contactEmail && (
        <p>
          <a href={`mailto:${config.data.contactEmail}`}>{config.data.contactEmail}</a>
        </p>
      )}
      {config.data?.contactPhone && (
        <p>
          <a href={`tel:${config.data.contactPhone}`}>{config.data.contactPhone}</a>
        </p>
      )}
      {sent ? (
        <section aria-label="Potvrzení zprávy">
          <p role="status">
            Zpráva byla předána k odeslání. Děkujeme, ozveme se vám na uvedený e-mail.
          </p>
          <Button onClick={() => setSent(false)}>Napsat další zprávu</Button>
        </section>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (active.current) return;
            const form = event.currentTarget;
            const data = new FormData(form);
            active.current = true;
            setError("");
            void contact
              .mutateAsync({
                name: text(data, "name"),
                email: text(data, "email"),
                phone: text(data, "phone"),
                company: text(data, "company"),
                message: text(data, "message"),
                website: text(data, "website"),
              })
              .then(() => {
                form.reset();
                setSent(true);
              })
              .catch((error: unknown) => setError(publicFormError(error, "contact")))
              .finally(() => {
                active.current = false;
                contact.reset();
              });
          }}
        >
          <fieldset className="checkout-fields" disabled={contact.isPending}>
            <legend>Kontaktní formulář</legend>
            <TextField
              name="name"
              label="Jméno"
              required
              slotProps={{ htmlInput: { maxLength: 255, autoComplete: "name" } }}
            />
            <TextField
              name="email"
              label="E-mail"
              type="email"
              required
              slotProps={{ htmlInput: { maxLength: 254, autoComplete: "email" } }}
            />
            <TextField
              name="phone"
              label="Telefon (nepovinný)"
              type="tel"
              slotProps={{ htmlInput: { maxLength: 30, autoComplete: "tel" } }}
            />
            <TextField
              name="company"
              label="Firma nebo tým (nepovinné)"
              slotProps={{ htmlInput: { maxLength: 255, autoComplete: "organization" } }}
            />
            <TextField
              name="message"
              label="Zpráva"
              multiline
              minRows={5}
              required
              slotProps={{ htmlInput: { maxLength: 10000 } }}
            />
            <div hidden aria-hidden="true">
              <label>
                Web
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            {error && <p role="alert">{error}</p>}
            <Button variant="contained" type="submit">
              {contact.isPending ? "Odesílání…" : "Odeslat zprávu"}
            </Button>
          </fieldset>
        </form>
      )}
    </main>
  );
}
