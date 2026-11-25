import { useEffect, useRef, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import type { PacketaHomeDelivery } from "../api/generated/models/packetaHomeDelivery";

const widgetOrigin = "https://hd.widget.packeta.com";

export type DeliveryLocation = { street: string; city: string; zip: string };

function readAddress(value: unknown): DeliveryLocation | null {
  if (!value || typeof value !== "object") return null;
  const fields = value as Record<string, unknown>;
  const field = (key: string) => (typeof fields[key] === "string" ? fields[key].trim() : "");
  const city = field("city");
  const zip = field("postcode").replace(/\s/g, "");
  const houseNumber = field("houseNumber").replace(/\s*\/\s*/g, "/");
  const street = `${field("street") || city} ${houseNumber}`;
  if (
    field("country").toLowerCase() !== "cz" ||
    !city ||
    city.length > 255 ||
    !/^\d{5}$/.test(zip) ||
    !/^\d\S*$/.test(houseNumber) ||
    street.length > 255
  )
    return null;
  return { street, city, zip };
}

export function PacketaPicker<T>({
  origin,
  query,
  disabled,
  labels,
  buttonVariant = "outlined",
  payload,
  parse,
  onSelect,
}: {
  origin: string;
  query: Record<string, string>;
  disabled: boolean;
  labels: { button: string; title: string; frame: string; invalid: string; close: string };
  buttonVariant?: "contained" | "outlined";
  payload: "address" | "packetaPoint";
  parse: (value: unknown) => T | null;
  onSelect: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open || disabled) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      let message = event.data;
      if (typeof message === "string") {
        try {
          message = JSON.parse(message);
        } catch {
          return;
        }
      }
      if (message?.packetaWidgetMessage !== true) return;
      // Direct PUDO embeds can return packetaSelectedData rather than packetaPoint.
      const selection =
        message[payload] ?? (payload === "packetaPoint" ? message.packetaSelectedData : null);
      if (selection == null) {
        setOpen(false);
        return;
      }
      const value = parse(selection);
      if (!value) {
        setInvalid(true);
        return;
      }
      onSelect(value);
      setOpen(false);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [disabled, onSelect, open, origin, parse, payload]);

  const params = new URLSearchParams({
    ...query,
    country: "cz",
    language: "cs",
    referrer: window.location.origin,
  });

  return (
    <>
      <Button
        type="button"
        variant={buttonVariant}
        disabled={disabled}
        onClick={() => {
          setInvalid(false);
          setOpen(true);
        }}
      >
        {labels.button}
      </Button>
      <Dialog open={open && !disabled} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{labels.title}</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {invalid && <Alert severity="warning">{labels.invalid}</Alert>}
          {open && !disabled && (
            <iframe
              ref={frame}
              title={labels.frame}
              src={`${origin}/v6/#/?${params}`}
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="strict-origin"
              style={{ display: "block", width: "100%", height: "min(62dvh, 640px)", border: 0 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setOpen(false)}>
            {labels.close}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export function PacketaAddressPicker({
  config,
  disabled,
  onSelect,
}: {
  config: PacketaHomeDelivery;
  disabled: boolean;
  onSelect: (address: DeliveryLocation) => void;
}) {
  return (
    <PacketaPicker
      origin={widgetOrigin}
      query={{ layout: "hd", carrierId: config.carrierId, apiKey: config.apiKey }}
      labels={{
        button: "Vybrat adresu v Zásilkovně",
        title: "Doručovací adresa v Zásilkovně",
        frame: "Výběr doručovací adresy Zásilkovny",
        invalid: "Zásilkovna nevrátila úplnou českou adresu. Vyberte jinou nebo ji zadejte ručně.",
        close: "Zavřít a pokračovat ručně",
      }}
      disabled={disabled}
      payload="address"
      parse={readAddress}
      onSelect={onSelect}
    />
  );
}
