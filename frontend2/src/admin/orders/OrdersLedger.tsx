import { Link } from "react-router-dom";
import { TableCell, TableRow } from "@mui/material";
import type { AdminOrderList } from "../../api/generated/models";
import { money } from "../../data/catalog";
import { orderStatuses, paymentStatuses } from "./labels";
import { StatusBadge } from "./OrderStatusBadge";

export const ledgerColumns = [
  { label: "Objednávka", compact: true },
  { label: "Zákazník", minWidth: 140 },
  { label: "Položky", minWidth: 180 },
  { label: "Platba", compact: true },
  { label: "Stav", compact: true },
  { label: "Celkem", align: "right" as const, compact: true },
];
const date = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" });

export function OrdersLedger({
  orders,
  params,
}: {
  orders: readonly AdminOrderList[];
  params: URLSearchParams;
}) {
  return orders.map((order) => (
    <TableRow key={order.id}>
      <TableCell component="th" scope="row">
        <Link
          className="data-table-nowrap"
          to={`/admin/objednavky/${order.id}${params.size ? `?${params}` : ""}`}
        >
          {order.orderNumber}
        </Link>
        <time className="data-table-secondary" dateTime={order.createdAt}>
          {date.format(new Date(order.createdAt))}
        </time>
      </TableCell>
      <TableCell className="data-table-wrap">
        {[order.customerFirstName, order.customerLastName].filter(Boolean).join(" ") ||
          order.customerName ||
          order.customerEmail ||
          "—"}
      </TableCell>
      <TableCell className="data-table-wrap">
        {order.items?.length
          ? order.items
              .map(
                (item) =>
                  `${item.quantity ?? 1}× ${item.motif?.name || item.itemLabel || (item.isCustom ? "Vlastní potisk" : "Položka")}`,
              )
              .join(", ")
          : "—"}
      </TableCell>
      <TableCell>
        <StatusBadge value={order.paymentStatus} labels={paymentStatuses} />
      </TableCell>
      <TableCell>
        <StatusBadge value={order.status} labels={orderStatuses} />
      </TableCell>
      <TableCell align="right" className="data-table-nowrap">
        {order.total == null
          ? "K nacenění"
          : order.currency && order.currency !== "CZK"
            ? new Intl.NumberFormat("cs-CZ", {
                style: "currency",
                currency: order.currency,
              }).format(order.total / 100)
            : money(order.total / 100)}
      </TableCell>
    </TableRow>
  ));
}
