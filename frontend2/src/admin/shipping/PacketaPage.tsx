import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Checkbox, FormControlLabel, Pagination, Paper, TextField } from "@mui/material";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import type { Dayjs } from "dayjs";
import {
  adminCourierPickupsCreate,
  adminPacketaConfigUpdate,
  useAdminCourierPickupsList,
  useAdminOrdersList,
  useAdminPacketaConfigRetrieve,
} from "../../api/generated/api";
import type { AdminPacketaConfig } from "../../api/generated/models";
import { ApiError } from "../../api/http";
import { withCsrf } from "../../auth/csrf";
import { CatalogFeedback } from "../../components/Products";
import { catalogError, formText } from "../catalog/forms";
import { dateTime } from "../orders/labels";

const options = { query: { retry: false }, request: { cache: "no-store" as const } };
const fields = [
  ["eshop", "Označení odesílatele", "text"],
  ["homeDeliveryAddressId", "ID dopravce pro doručení na adresu", "text"],
  ["labelFormat", "Formát štítku", "text"],
  ["pickupAddressId", "ID místa svozu", "text"],
  ["pickupCompanyName", "Firma pro svoz", "text"],
  ["pickupContactName", "Jméno kontaktní osoby", "text"],
  ["pickupContactSurname", "Příjmení kontaktní osoby", "text"],
  ["pickupEmail", "Kontaktní e-mail", "email"],
  ["pickupPhone", "Kontaktní telefon", "tel"],
  ["pickupStreet", "Ulice", "text"],
  ["pickupHouseNumber", "Číslo domu", "text"],
  ["pickupCity", "Město", "text"],
  ["pickupZip", "PSČ", "text"],
] as const;

function PacketaSettings({ config, refresh }: { config: AdminPacketaConfig; refresh: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="dialog-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        const form = event.currentTarget;
        const values = new FormData(form);
        const password = formText(values, "apiPassword");
        const passwordInput = form.elements.namedItem("apiPassword");
        if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
        setSaving(true);
        setSaved(false);
        setError("");
        void withCsrf(() =>
          adminPacketaConfigUpdate({
            ...Object.fromEntries(fields.map(([key]) => [key, formText(values, key).trim()])),
            ...(password ? { apiPassword: password } : {}),
          }),
        )
          .then(() => {
            setSaved(true);
            refresh();
          })
          .catch((failure: unknown) => setError(catalogError(failure)))
          .finally(() => setSaving(false));
      }}
    >
      <p>
        API heslo: {config.apiPasswordSet ? "nastavené" : "nenastavené"}. Prázdné pole ponechá
        stávající heslo. Označení odesílatele není jeho číselné ID.
      </p>
      <div className="admin-catalog-toolbar">
        <TextField
          name="apiPassword"
          label="Nové API heslo"
          type="password"
          autoComplete="new-password"
        />
        {fields.map(([key, label, type]) => (
          <TextField
            key={key}
            name={key}
            label={label}
            type={type}
            defaultValue={config[key] ?? ""}
          />
        ))}
      </div>
      <Button type="submit" variant="contained" disabled={saving}>
        Uložit nastavení Packety
      </Button>
      {saved && <p role="status">Nastavení je uložené.</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function PacketaPage() {
  const config = useAdminPacketaConfigRetrieve(options);
  const history = useAdminCourierPickupsList(options);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sending, setSending] = useState(false);
  const [from, setFrom] = useState<Dayjs | null>(null);
  const [to, setTo] = useState<Dayjs | null>(null);
  const active = useRef(false);
  const orders = useAdminOrdersList(
    { q: q.trim() || undefined, page, pageSize: 20, pickupEligible: "true" },
    options,
  );
  const count = Object.keys(selected).length;
  return (
    <>
      <Paper className="admin-panel admin-section" variant="outlined">
        <div className="admin-catalog-toolbar dictionary-toolbar">
          <h2>Objednat svoz Packety</h2>{" "}
          <TextField
            label="Vyhledat zásilky"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="admin-panel-body">
          <p>
            Vyberte už založené zásilky. Výběr se zachová při změně stránky a hledání. Termín
            zadávejte v místním čase tohoto zařízení.
          </p>
          <CatalogFeedback query={orders} label="Zásilky ke svozu" />
          {orders.data?.count === 0 && <p>Žádné dostupné zásilky.</p>}
          <ul className="pickup-list">
            {orders.data?.results.map((order) => (
              <li key={order.id}>
                <FormControlLabel
                  label={`${order.orderNumber} — ${order.customerName}`}
                  control={
                    <Checkbox
                      checked={Object.hasOwn(selected, order.id)}
                      disabled={sending || (count >= 100 && !Object.hasOwn(selected, order.id))}
                      onChange={(_, checked) =>
                        setSelected((previous) => {
                          const next = { ...previous };
                          if (checked) next[order.id] = order.orderNumber;
                          else delete next[order.id];
                          return next;
                        })
                      }
                    />
                  }
                />
                <Link to={`/admin/objednavky/${order.id}`}>Detail</Link>
              </li>
            ))}
          </ul>
          {(orders.data?.count ?? 0) > 20 && (
            <div className="data-table-footer">
              <Pagination
                size="small"
                aria-label="Stránky zásilek"
                page={page}
                count={Math.ceil((orders.data?.count ?? 0) / 20)}
                onChange={(_, value) => setPage(value)}
              />
            </div>
          )}
          <p>
            Vybráno: {count}{" "}
            {count > 0 && (
              <Button disabled={sending} onClick={() => setSelected({})}>
                Zrušit výběr
              </Button>
            )}
          </p>
          {count > 0 && <p className="pickup-selection">{Object.values(selected).join(", ")}</p>}
          <form
            className="dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                active.current ||
                !count ||
                !config.data?.apiPasswordSet ||
                !config.data.pickupAddressId
              )
                return;
              const form = new FormData(event.currentTarget);
              setError("");
              setSuccess("");
              if (!from?.isValid() || !to?.isValid() || +from >= +to || +to <= Date.now()) {
                setError("Zadejte platný budoucí konec svozu po jeho začátku.");
                return;
              }
              if (!window.confirm(`Skutečně objednat svoz pro ${count} zásilek?`)) return;
              active.current = true;
              setSending(true);
              void withCsrf(() =>
                adminCourierPickupsCreate({
                  orderIds: Object.keys(selected),
                  pickupFrom: from.toISOString(),
                  pickupTo: to.toISOString(),
                  note: formText(form, "note"),
                }),
              )
                .then((result) => {
                  setSuccess(`Svoz potvrzen: ${result.pickupId} (${result.externalId}).`);
                  setSelected({});
                })
                .catch((failure: unknown) => {
                  if (
                    !(failure instanceof ApiError) ||
                    failure.status >= 500 ||
                    failure.status === 409
                  ) {
                    setError(
                      `${catalogError(failure)} Ověřte historii a stav přímo u Packety, svoz neopakujte.`,
                    );
                    setSelected({});
                  } else setError(catalogError(failure));
                })
                .finally(() => {
                  active.current = false;
                  setSending(false);
                  setPage(1);
                  void history.refetch();
                  if (page === 1) void orders.refetch();
                });
            }}
          >
            <div className="admin-catalog-toolbar">
              <DateTimePicker
                label="Svoz od"
                value={from}
                onChange={setFrom}
                disabled={sending}
                ampm={false}
                slotProps={{ textField: { required: true, size: "small" } }}
              />
              <DateTimePicker
                label="Svoz do"
                value={to}
                onChange={setTo}
                disabled={sending}
                ampm={false}
                slotProps={{ textField: { required: true, size: "small" } }}
              />
              <TextField
                name="note"
                label="Poznámka kurýrovi"
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
            </div>
            {!config.data?.apiPasswordSet || !config.data.pickupAddressId ? (
              <p>Nejprve vyplňte nastavení Packety níže.</p>
            ) : null}
            <Button
              type="submit"
              variant="contained"
              disabled={
                !count || sending || !config.data?.apiPasswordSet || !config.data.pickupAddressId
              }
            >
              Objednat svoz
            </Button>
          </form>
          {success && <p role="status">{success}</p>}
          {error && <p role="alert">{error}</p>}
        </div>
      </Paper>
      <Paper className="admin-panel admin-section" variant="outlined">
        <h2>Historie svozů</h2>
        <div className="admin-panel-body">
          <CatalogFeedback query={history} label="Historie svozů" />
          {history.data?.length === 0 && <p>Zatím žádné svozy.</p>}
          <ul>
            {history.data?.map((row) => (
              <li key={row.id}>
                {dateTime(row.pickupFrom)} – {dateTime(row.pickupTo)} · {row.orderIds.length}{" "}
                zásilek ·{" "}
                {row.pickupId
                  ? `${row.pickupId} (${row.externalId})`
                  : "Nepotvrzeno — ověřte přímo u Packety"}
              </li>
            ))}
          </ul>
        </div>
      </Paper>
      <Paper className="admin-panel admin-section" variant="outlined">
        <h2>Nastavení Packety</h2>
        <div className="admin-panel-body">
          <CatalogFeedback query={config} label="Nastavení Packety" />
          {config.data && (
            <PacketaSettings
              config={config.data}
              refresh={() => {
                void config.refetch();
              }}
            />
          )}
        </div>
      </Paper>
    </>
  );
}
