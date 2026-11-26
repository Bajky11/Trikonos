import { Link } from "react-router-dom";
import { Button, TableCell, TableRow } from "@mui/material";
import type { AdminOrderList } from "../../api/generated/models";
import { money } from "../../data/catalog";
import { deliveryTypes, orderStatuses, paymentMethods, paymentStatuses } from "./labels";
import { StatusBadge } from "./OrderStatusBadge";

export const ledgerColumns = [
  { label: "Objednávka", compact: true },
  { label: "Položky", minWidth: 240 },
  { label: "Platba", minWidth: 160 },
  { label: "Doprava", minWidth: 120 },
  { label: "Stav", compact: true },
  { label: "Poznámka", minWidth: 180 },
  { label: "Akce", align: "right" as const, compact: true },
];
const date = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" });
const price = (value: number | null | undefined, currency = "CZK") =>
  value == null
    ? "K nacenění"
    : currency === "CZK"
      ? money(value / 100)
      : new Intl.NumberFormat("cs-CZ", { style: "currency", currency }).format(value / 100);

export function OrdersLedger({
  orders,
  params,
}: {
  orders: readonly AdminOrderList[];
  params: URLSearchParams;
}) {
  return (
    <>
      {orders.map((order) => (
        <TableRow key={order.id} className="orders-list-row">
          <TableCell component="th" scope="row">
            <Link
              className="data-table-nowrap orders-reference"
              to={`/admin/objednavky/${order.id}${params.size ? `?${params}` : ""}`}
            >
              {order.orderNumber}
            </Link>
            <time className="data-table-secondary" dateTime={order.createdAt}>
              {date.format(new Date(order.createdAt))}
            </time>
          </TableCell>
          <TableCell className="data-table-wrap">
            {order.items?.length ? (
              <ul className="orders-items">
                {order.items.map((item) => (
                  <li key={item.id}>
                    <span className="orders-item-quantity">{item.quantity ?? 1}×</span>
                    <div>
                      <strong>
                        {item.motif?.name ||
                          item.itemLabel ||
                          (item.isCustom ? "Vlastní potisk" : "—")}
                      </strong>
                      <span className="data-table-secondary">
                        {[
                          item.cut?.name,
                          item.color?.name,
                          item.size,
                          price(
                            item.unitPrice == null ? null : item.unitPrice * (item.quantity ?? 1),
                            order.currency,
                          ),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              "—"
            )}
          </TableCell>
          <TableCell>
            <span className="orders-payment" data-status={order.paymentStatus}>
              {paymentStatuses[order.paymentStatus ?? ""] ?? order.paymentStatus ?? "—"}
            </span>
            {order.paymentMethod && (
              <span className="data-table-secondary">
                {paymentMethods[order.paymentMethod] ?? order.paymentMethod}
              </span>
            )}
          </TableCell>
          <TableCell>
            {order.carrier?.name || deliveryTypes[order.deliveryType ?? ""] || "—"}
            {order.trackingNumber && (
              <span className="data-table-secondary">{order.trackingNumber}</span>
            )}
          </TableCell>
          <TableCell>
            <StatusBadge value={order.status} labels={orderStatuses} />
          </TableCell>
          <TableCell className="data-table-wrap orders-note">{order.note || "—"}</TableCell>
          <TableCell align="right">
            <Button
              component={Link}
              variant="outlined"
              size="small"
              className="orders-print"
              to={`/admin/objednavky/${order.id}/tisk`}
              aria-label={`Tisk objednávky ${order.orderNumber}`}
            >
              Tisk
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
