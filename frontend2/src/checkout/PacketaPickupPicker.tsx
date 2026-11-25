import LocationOnOutlined from "@mui/icons-material/LocationOnOutlined";
import { Box, Typography } from "@mui/material";
import { PacketaPicker } from "./PacketaAddressPicker";

export type PickupPoint = { id: string; name: string };

function readPickupPoint(value: unknown): PickupPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Record<string, unknown>;
  const id = typeof point.id === "string" || typeof point.id === "number" ? String(point.id) : "";
  const name = typeof point.name === "string" ? point.name.trim() : "";
  if (
    point.country !== "cz" ||
    point.pickupPointType === "external" ||
    (point.group && point.group !== "zbox") ||
    point.error ||
    !/^[1-9]\d{0,99}$/.test(id) ||
    !name ||
    name.length > 255
  )
    return null;
  return { id, name };
}

export function PacketaPickupPicker({
  apiKey,
  point,
  disabled,
  onSelect,
}: {
  apiKey: string;
  point: PickupPoint | null;
  disabled: boolean;
  onSelect: (value: PickupPoint) => void;
}) {
  return (
    <Box
      sx={{
        gridColumn: "1 / -1",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1.5,
        p: 2,
        border: 1,
        borderColor: point ? "primary.main" : "divider",
        bgcolor: point ? "var(--sage)" : "background.default",
        "& > .MuiButton-root": { width: { xs: "100%", sm: "auto" } },
      }}
    >
      <Box
        role="status"
        sx={{
          display: "flex",
          gap: 1.25,
          alignItems: "flex-start",
          flex: "1 1 16rem",
          minWidth: 0,
        }}
      >
        <LocationOnOutlined color="primary" />
        <Box sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
          <Typography variant="body2" color="text.secondary">
            {point ? "Vybrané místo Zásilkovny" : "Zásilkovna"}
          </Typography>
          {point ? (
            <Typography sx={{ fontWeight: 700 }}>{point.name}</Typography>
          ) : (
            <Typography variant="body2">Vyberte si box nebo výdejní místo na mapě.</Typography>
          )}
        </Box>
      </Box>
      <PacketaPicker
        origin="https://widget.packeta.com"
        query={{ apiKey, vendors: "cz,,,,,|cz,zbox,,,," }}
        labels={{
          button: point ? "Změnit vybrané místo" : "Vybrat Z-BOX nebo výdejní místo",
          title: "Z-BOXy a výdejní místa Zásilkovny",
          frame: "Mapa Z-BOXů a výdejních míst Zásilkovny",
          invalid: "Toto místo nelze použít. Vyberte jiné místo v Česku.",
          close: "Zavřít mapu",
        }}
        buttonVariant={point ? "outlined" : "contained"}
        disabled={disabled}
        payload="packetaPoint"
        parse={readPickupPoint}
        onSelect={onSelect}
      />
    </Box>
  );
}
