import { useQuery } from "@tanstack/react-query";
import { Fragment, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  LinearProgress,
  MenuItem,
  TableCell,
  TableRow,
  TextField,
} from "@mui/material";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import { apiFetch } from "../../api/http";
import { withCsrf } from "../../auth/csrf";
import { DataTable } from "../../components/DataTable";
import { CatalogFeedback } from "../../components/Products";
import { dateTime, orderStatuses } from "../orders/labels";
import { orderAssetUrl } from "../orders/files";

type Placement = {
  id: string;
  printArea: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  url: string;
};
type ItemStatus = "WAITING" | "IN_PROGRESS" | "DONE";
type ProductionStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";
const stages = ["NOT_STARTED", "IN_PROGRESS", "DONE"] as const;
const itemLabels: Record<ItemStatus, string> = {
  WAITING: "Čeká",
  IN_PROGRESS: "Vyrábím",
  DONE: "Vyrobeno",
};
const orderLabels: Record<ProductionStatus, string> = {
  NOT_STARTED: "Nezahájeno",
  IN_PROGRESS: "Rozpracováno",
  DONE: "Vyrobeno",
};
type Item = {
  id: string;
  motif: string | null;
  isCustom: boolean;
  customText: string;
  productType: string;
  cut: string;
  color: string;
  size: string;
  quantity: number;
  productionStatus: ItemStatus;
  productionRevision: number;
  placements: Placement[];
};
type ProductionOrder = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  productionStatus: ProductionStatus;
  items: Item[];
};

export function useProductionOrders(
  filter: { status: string; createdFrom?: string; createdTo?: string },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["production-orders", filter],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ status: filter.status });
      if (filter.createdFrom) params.set("createdFrom", filter.createdFrom);
      if (filter.createdTo) params.set("createdTo", filter.createdTo);
      return apiFetch<ProductionOrder[]>(`/api/v1/admin/production/orders?${params}`, {
        signal,
        cache: "no-store",
      });
    },
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
}

export function ProductionOrders({ query }: { query: ReturnType<typeof useProductionOrders> }) {
  const [stage, setStage] = useState<ProductionStatus | "ALL">("ALL");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const active = useRef(false);
  const refresh = async () => {
    const result = await query.refetch();
    if (result.isSuccess) {
      setNeedsRefresh(false);
      setError("");
      return true;
    }
    setNeedsRefresh(true);
    setError("Aktuální stav se nepodařilo načíst. Před další změnou jej znovu obnovte.");
    return false;
  };
  const save = async (path: string, method: "POST" | "PATCH", data?: object) => {
    if (active.current || needsRefresh || query.isFetching) return false;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      await withCsrf(() =>
        apiFetch(path, {
          method,
          ...(data
            ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }
            : {}),
        }),
      );
      return await refresh();
    } catch {
      setNeedsRefresh(true);
      setError("Změnu se nepodařilo potvrdit. Před dalším pokračováním obnovte aktuální stav.");
      return false;
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  const counts = { NOT_STARTED: 0, IN_PROGRESS: 0, DONE: 0 };
  const orders = query.data ?? [];
  orders.forEach((order) => counts[order.productionStatus]++);
  const actionsDisabled = busy || needsRefresh || query.isFetching || query.isError;
  return (
    <section className="production-orders" aria-labelledby="production-queue-title">
      <h2 id="production-queue-title">Objednávky k výrobě</h2>
      <CatalogFeedback query={query} label="Objednávky k výrobě" />
      {error && (
        <Alert
          className="print-controls"
          severity="error"
          action={
            needsRefresh && (
              <Button
                color="inherit"
                disabled={busy || query.isFetching}
                onClick={() => void refresh()}
              >
                Obnovit stav výroby
              </Button>
            )
          }
        >
          {error}
        </Alert>
      )}
      {orders.length > 0 && (
        <div
          className="production-stages print-controls"
          role="group"
          aria-label="Filtr podle postupu výroby"
        >
          {(["ALL", ...stages] as const).map((value) => (
            <Button
              key={value}
              aria-pressed={stage === value}
              size="small"
              onClick={() => setStage(value)}
            >
              {value === "ALL" ? "Všechny" : orderLabels[value]}{" "}
              <span>{value === "ALL" ? orders.length : counts[value]}</span>
            </Button>
          ))}
        </div>
      )}
      {query.isSuccess && !orders.length && (
        <p className="production-empty" role="status">
          Pro vybrané filtry nejsou žádné objednávky.
        </p>
      )}
      {orders.length > 0 && stage !== "ALL" && counts[stage] === 0 && (
        <p className="production-empty print-controls" role="status">
          V tomto stavu výroby nejsou žádné objednávky.
        </p>
      )}
      {orders.map((order) => {
        const total = order.items.reduce((sum, item) => sum + item.quantity, 0);
        const done = order.items.reduce(
          (sum, item) => sum + (item.productionStatus === "DONE" ? item.quantity : 0),
          0,
        );
        const locked = actionsDisabled || ["CANCELLED", "REFUNDED"].includes(order.status);
        const expanded = expandedOrder === order.id;
        const detailId = `production-detail-${order.id}`;
        return (
          <article
            className={`production-order${stage !== "ALL" && stage !== order.productionStatus ? " production-filtered" : ""}`}
            data-state={order.productionStatus}
            aria-labelledby={`production-order-${order.id}`}
            key={order.id}
          >
            <div className="production-order-heading">
              <div>
                <h3 className="production-order-title" id={`production-order-${order.id}`}>
                  <Link to={`/admin/objednavky/${order.id}`}>{order.orderNumber}</Link>
                </h3>
                <p>
                  Objednávka: <strong>{orderStatuses[order.status] ?? order.status}</strong>
                </p>
              </div>
              <div className="production-progress">
                <div className="production-progress-caption">
                  <span className="production-badge" data-state={order.productionStatus}>
                    Výroba: {orderLabels[order.productionStatus]}
                  </span>
                  {total > 0 && (
                    <span>
                      <strong>
                        {done} / {total}
                      </strong>{" "}
                      ks hotovo
                    </span>
                  )}
                </div>
                {total > 0 && (
                  <LinearProgress
                    variant="determinate"
                    value={(done / total) * 100}
                    aria-label={`Postup výroby objednávky ${order.orderNumber}`}
                  />
                )}
              </div>
              <Button
                className="production-order-toggle print-controls"
                variant={expanded ? "text" : "outlined"}
                size="small"
                aria-expanded={expanded}
                aria-controls={detailId}
                endIcon={<ExpandMoreIcon />}
                onClick={() => setExpandedOrder(expanded ? null : order.id)}
              >
                {expanded ? "Skrýt položky" : "Zobrazit položky"}
              </Button>
            </div>
            <div
              id={detailId}
              className={`production-order-detail${expanded ? "" : " production-collapsed"}`}
            >
              <div className="production-detail-tools">
                <p>Vytvořeno {dateTime(order.createdAt)}</p>
                <div className="production-actions print-controls">
                  <Button
                    component={Link}
                    to={`/admin/objednavky/${order.id}/tisk`}
                    startIcon={<DescriptionOutlinedIcon />}
                    size="small"
                  >
                    Výrobní list
                  </Button>
                  {order.productionStatus === "NOT_STARTED" && (
                    <Button
                      startIcon={<PlayArrowOutlinedIcon />}
                      variant="contained"
                      size="small"
                      disabled={locked}
                      onClick={async () => {
                        if (
                          await save(`/api/v1/admin/production/orders/${order.id}/start`, "POST")
                        ) {
                          setStage((current) => (current === "NOT_STARTED" ? "ALL" : current));
                        }
                      }}
                    >
                      Začít pracovat
                    </Button>
                  )}
                </div>
              </div>
              {order.items.length > 0 ? (
                <DataTable
                  label={`Položky objednávky ${order.orderNumber}`}
                  columns={[
                    { label: "Motiv / potisk" },
                    { label: "Oděv" },
                    { label: "Střih" },
                    { label: "Barva" },
                    { label: "Velikost" },
                    { label: "Kusů", align: "right", compact: true },
                    { label: "Stav výroby" },
                  ]}
                >
                  {order.items.map((item) => (
                    <Fragment key={item.id}>
                      <TableRow className="production-item-row">
                        <TableCell data-label="Motiv / potisk">
                          <strong>
                            {item.isCustom ? "Vlastní potisk" : item.motif || "Motiv není dostupný"}
                          </strong>
                        </TableCell>
                        <TableCell data-label="Oděv">
                          <strong>{item.productType || "—"}</strong>
                        </TableCell>
                        <TableCell data-label="Střih">{item.cut || "—"}</TableCell>
                        <TableCell data-label="Barva">{item.color || "—"}</TableCell>
                        <TableCell data-label="Velikost">{item.size || "—"}</TableCell>
                        <TableCell data-label="Kusů" align="right">
                          <strong>{item.quantity} ks</strong>
                        </TableCell>
                        <TableCell data-label="Stav výroby">
                          <span
                            className="production-badge production-item-print-status"
                            data-state={item.productionStatus}
                          >
                            {itemLabels[item.productionStatus]}
                          </span>
                          <TextField
                            className="production-item-status print-controls"
                            select
                            value={item.productionStatus}
                            disabled={locked || order.productionStatus === "NOT_STARTED"}
                            slotProps={{
                              select: {
                                inputProps: {
                                  "aria-label": `Stav výroby položky ${item.isCustom ? "Vlastní potisk" : item.motif || item.productType}`,
                                },
                              },
                            }}
                            onChange={(event) =>
                              void save(
                                `/api/v1/admin/production/orders/${order.id}/items/${item.id}`,
                                "PATCH",
                                {
                                  status: event.target.value,
                                  expectedStatus: item.productionStatus,
                                  expectedRevision: item.productionRevision,
                                },
                              )
                            }
                          >
                            {(Object.keys(itemLabels) as ItemStatus[]).map((state) => (
                              <MenuItem key={state} value={state}>
                                {itemLabels[state]}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                      </TableRow>
                      {(item.customText || item.isCustom) && (
                        <TableRow className="production-item-detail-row">
                          <TableCell colSpan={7}>
                            <div className="production-item-detail">
                              <div className="production-item-info">
                                {item.customText && (
                                  <span>
                                    <strong>Text:</strong> {item.customText}
                                  </span>
                                )}
                                {item.isCustom
                                  ? item.placements.length
                                    ? item.placements.map((placement) => (
                                        <span className="production-placement" key={placement.id}>
                                          <strong>{placement.printArea}</strong>
                                          <span>
                                            {placement.width} × {placement.height} mm; x=
                                            {placement.x}, y=
                                            {placement.y} mm; rotace {placement.rotationDeg}°
                                          </span>
                                          {orderAssetUrl(placement.url) ? (
                                            <a
                                              href={orderAssetUrl(placement.url)}
                                              target="_blank"
                                              rel="noreferrer"
                                            >
                                              Otevřít podklad <OpenInNewIcon aria-hidden="true" />
                                            </a>
                                          ) : (
                                            <span>Podklad není dostupný</span>
                                          )}
                                        </span>
                                      ))
                                    : "Podklad není dostupný"
                                  : null}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </DataTable>
              ) : (
                <p className="production-empty">Objednávka neobsahuje položky.</p>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
