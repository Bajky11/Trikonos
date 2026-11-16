import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import {
  adminPrintAreasList,
  useAdminProductionPlacementsList,
  useAdminProductionSummaryList,
} from "../../api/generated/api";
import { allPages } from "../catalog/api";
import { CatalogFeedback } from "../../components/Products";
import { orderStatuses } from "../orders/labels";
import { orderAssetUrl } from "../orders/files";

function validDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function ProductionPanel() {
  const [params, setParams] = useSearchParams();
  const statuses = (params.get("status") || "PAID,PROCESSING").split(",").filter(Boolean);
  const createdFrom = params.get("createdFrom") || "",
    createdTo = params.get("createdTo") || "",
    printArea = params.get("printArea") || "";
  const valid =
    statuses.length > 0 &&
    statuses.every((status) => Object.hasOwn(orderStatuses, status)) &&
    validDate(createdFrom) &&
    validDate(createdTo) &&
    (!createdFrom || !createdTo || createdFrom <= createdTo) &&
    (!printArea ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(printArea));
  const filter = {
    status: statuses.join(","),
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
  };
  const summary = useAdminProductionSummaryList(filter, {
    query: { enabled: valid, retry: false, refetchOnWindowFocus: false, staleTime: 0 },
    request: { cache: "no-store" },
  });
  const placements = useAdminProductionPlacementsList(
    { ...filter, printArea: printArea || undefined },
    {
      query: { enabled: valid, retry: false, refetchOnWindowFocus: false, staleTime: 0 },
      request: { cache: "no-store" },
    },
  );
  const areas = useQuery({
    queryKey: ["/api/v1/admin/print-areas", "production-options"],
    queryFn: ({ signal }) =>
      allPages((page) => adminPrintAreasList({ page, pageSize: 100 }, { signal })),
    retry: false,
  });
  const update = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  return (
    <Paper className="admin-panel" variant="outlined">
      <h2>Výroba</h2>
      <div className="print-controls">
        <p>
          Výchozí stav: zaplacené a ve výrobě. Oba přehledy používají stejný explicitní filtr stavů
          a data vytvoření objednávky.
        </p>
        <div className="admin-catalog-toolbar">
          <TextField
            select
            label="Stavy pro výrobu"
            value={statuses}
            slotProps={{ select: { multiple: true } }}
            onChange={(event) => {
              const value = event.target.value;
              update("status", typeof value === "string" ? value : (value as string[]).join(","));
            }}
          >
            {Object.entries(orderStatuses).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Vytvořeno od"
            type="date"
            value={createdFrom}
            onChange={(event) => update("createdFrom", event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Vytvořeno do"
            type="date"
            value={createdTo}
            onChange={(event) => update("createdTo", event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            select
            label="Tisková plocha (jen podklady)"
            value={printArea}
            onChange={(event) => update("printArea", event.target.value)}
          >
            <MenuItem value="">Všechny plochy</MenuItem>
            {(areas.data ?? []).map((area) => (
              <MenuItem value={area.id} key={area.id}>
                {area.name}
              </MenuItem>
            ))}
          </TextField>
        </div>
        <CatalogFeedback query={areas} label="Tiskové plochy" />
        <Button
          disabled={!valid || summary.isFetching || placements.isFetching}
          onClick={() => {
            void summary.refetch();
            void placements.refetch();
          }}
        >
          Obnovit výrobní přehled
        </Button>
        <Button
          disabled={
            !valid ||
            !summary.isSuccess ||
            !placements.isSuccess ||
            summary.isFetching ||
            placements.isFetching
          }
          onClick={() => window.print()}
        >
          Vytisknout výrobní přehled
        </Button>
      </div>
      {!valid ? (
        <p role="alert">
          Zkontrolujte stavy a filtry: datum musí být platné, od nesmí být po do a tisková plocha
          musí mít platné ID.
        </p>
      ) : (
        <>
          <p>
            Filtr stavů: {statuses.map((status) => orderStatuses[status]).join(", ")}; období:{" "}
            {createdFrom || "bez omezení"} — {createdTo || "bez omezení"}
          </p>
          <h3>Souhrn oděvů k výrobě</h3>
          <CatalogFeedback query={summary} label="Souhrn výroby" />
          {summary.isSuccess && (
            <>
              <TableContainer>
                <Table aria-label="Souhrn výroby">
                  <TableHead>
                    <TableRow>
                      {["Typ", "Střih", "Barva", "Velikost", "Počet kusů"].map((label) => (
                        <TableCell key={label}>{label}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.data.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row.productType}</TableCell>
                        <TableCell>{row.cut}</TableCell>
                        <TableCell>{row.color}</TableCell>
                        <TableCell>{row.size}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {!summary.data.length && (
                <p role="status">Pro vybrané filtry nejsou oděvy k výrobě.</p>
              )}
            </>
          )}
          <h3>Podklady vlastního potisku</h3>
          <p>
            Filtr tiskové plochy se vztahuje jen na podklady, ne na souhrn oděvů. API zde nevrací
            počty kusů, souřadnice ani ID objednávky — úplný výrobní list otevřete přes dohledání
            objednávky.
          </p>
          <CatalogFeedback query={placements} label="Výrobní podklady" />
          {placements.isSuccess && (
            <>
              <TableContainer>
                <Table aria-label="Výrobní podklady">
                  <TableHead>
                    <TableRow>
                      {["Objednávka", "Položka", "Plocha", "Rozměry", "Podklad"].map((label) => (
                        <TableCell key={label}>{label}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {placements.data.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Link to={`/admin/objednavky?q=${encodeURIComponent(row.orderNumber)}`}>
                            {row.orderNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{row.itemLabel}</TableCell>
                        <TableCell>{row.printArea}</TableCell>
                        <TableCell>
                          {row.width} × {row.height} mm; {row.rotationDeg}°
                        </TableCell>
                        <TableCell>
                          {orderAssetUrl(row.url) && (
                            <a href={orderAssetUrl(row.url)} target="_blank" rel="noreferrer">
                              Otevřít podklad
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {!placements.data.length && (
                <p role="status">Pro vybrané filtry nejsou podklady vlastního potisku.</p>
              )}
            </>
          )}
        </>
      )}
    </Paper>
  );
}
