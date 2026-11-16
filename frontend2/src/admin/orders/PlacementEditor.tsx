import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, MenuItem, TextField } from "@mui/material";
import {
  adminOrdersItemsPlacementsPartialUpdate,
  adminPrintAreasList,
} from "../../api/generated/api";
import type { AdminOrderDetail, AdminOrderItem, AdminPlacement } from "../../api/generated/models";
import { allPages } from "../catalog/api";
import { formText } from "../catalog/forms";
import type { SaveOrder } from "./OrderEditor";

export function PlacementEditor({
  order,
  item,
  placement,
  disabled,
  save,
}: {
  order: AdminOrderDetail;
  item: AdminOrderItem;
  placement: AdminPlacement;
  disabled: boolean;
  save: SaveOrder;
}) {
  const [areaId, setAreaId] = useState(placement.printArea.id),
    [error, setError] = useState("");
  const areas = useQuery({
    queryKey: ["/api/v1/admin/print-areas", "placement", item.productType.id],
    queryFn: ({ signal }) =>
      allPages((page) =>
        adminPrintAreasList({ page, pageSize: 100, productType: item.productType.id }, { signal }),
      ),
    retry: false,
    enabled: !order.isLocked,
    refetchOnWindowFocus: false,
  });
  const choices = areas.data ?? [];
  const area =
    choices.find((area) => area.id === areaId) ??
    (areaId === placement.printArea.id ? placement.printArea : undefined);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || order.isLocked) return;
        const data = new FormData(event.currentTarget);
        const values = Object.fromEntries(
          ["x", "y", "width", "height", "rotationDeg"].map((key) => [
            key,
            Number(formText(data, key)),
          ]),
        );
        const { x, y, width, height, rotationDeg } = values;
        if (
          !area ||
          Object.values(values).some((value) => !Number.isSafeInteger(value)) ||
          x! < 0 ||
          y! < 0 ||
          width! <= 0 ||
          height! <= 0 ||
          x! + width! > area.widthMm ||
          y! + height! > area.heightMm
        ) {
          setError("Zadejte celé mm a rozměry umístění uvnitř zvolené tiskové plochy.");
          return;
        }
        setError("");
        save(
          () =>
            adminOrdersItemsPlacementsPartialUpdate(order.id, item.id, placement.id, {
              printAreaId: areaId,
              x,
              y,
              width,
              height,
              rotationDeg,
            }),
          "Umístění podkladu bylo uložené.",
        );
      }}
    >
      <fieldset disabled={disabled || order.isLocked} className="checkout-fields">
        <legend>Oprava umístění podkladu</legend>
        <TextField
          select
          label="Tisková plocha podkladu"
          value={areaId}
          disabled={disabled || order.isLocked}
          onChange={(event) => setAreaId(event.target.value)}
        >
          {!choices.some((area) => area.id === placement.printArea.id) && (
            <MenuItem value={placement.printArea.id}>
              {placement.printArea.name} (současná)
            </MenuItem>
          )}
          {choices.map((area) => (
            <MenuItem key={area.id} value={area.id}>
              {area.name} · {area.widthMm} × {area.heightMm} mm
            </MenuItem>
          ))}
        </TextField>
        {(
          [
            ["x", "X (mm)"],
            ["y", "Y (mm)"],
            ["width", "Šířka (mm)"],
            ["height", "Výška (mm)"],
            ["rotationDeg", "Rotace (°)"],
          ] as const
        ).map(([key, label]) => (
          <TextField
            key={key}
            label={label}
            name={key}
            type="number"
            required
            defaultValue={placement[key]}
            slotProps={{ htmlInput: { step: 1 } }}
          />
        ))}
        {areas.isError && (
          <p role="alert">
            Další tiskové plochy se nepodařilo načíst. Aktuální plocha je zachovaná.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <p>
          Opravuje se existující umístění. Tento endpoint nepřidává ani nemaže podklady a
          nenahrazuje soubor.
        </p>
        <Button type="submit">Uložit umístění</Button>
      </fieldset>
    </form>
  );
}
