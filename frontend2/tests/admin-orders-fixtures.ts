import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { AdminOrderDetail } from "../src/api/generated/models";
import { options } from "./api-fixtures";

export const adminOrderId = "80000000-0000-0000-0000-000000000001";
export const adminItemId = "80000000-0000-0000-0000-000000000002";
type MutableOrder = { -readonly [Key in keyof AdminOrderDetail]: AdminOrderDetail[Key] };
export function sampleOrder(): MutableOrder {
  const address = {
    fullName: "Jana Nováková",
    companyName: "",
    street: "Horní 12",
    city: "Vrchlabí",
    zip: "54301",
    country: "CZ",
    ico: "",
    dic: "",
  };
  return {
    id: adminOrderId,
    orderNumber: "TRK-2026-0042",
    customer: {
      id: "80000000-0000-0000-0000-000000000003",
      email: "jana@example.cz",
      firstName: "Jana",
      lastName: "Nováková",
      phone: "777123456",
      companyName: "",
    },
    status: "QUOTE_REQUESTED",
    statusLabel: "Waiting for pricing",
    paymentStatus: "PENDING",
    paymentMethod: "BANK_TRANSFER",
    shipmentStatus: "CREATED",
    subtotal: null,
    shippingCost: 0,
    total: null,
    shippingCostManual: false,
    currency: "CZK",
    confirmedAt: null,
    carrier: null,
    deliveryType: "PERSONAL_PICKUP",
    pickupPointId: "",
    pickupPointName: "",
    trackingNumber: "",
    carrierShipmentId: "",
    billing: { ...address },
    shipping: { ...address },
    note: "Prosím o nabídku.",
    items: [
      {
        id: adminItemId,
        isCustom: true,
        motif: null,
        customText: "Týmová trička",
        productType: { id: options.productTypes[0]!.id, name: "Tričko" },
        cut: { id: options.cuts[0]!.id, name: "Pánské" },
        color: { id: options.colors[0]!.id, name: "Bílá", hexValue: "#ffffff" },
        size: "L",
        itemLabel: "Vlastní týmový potisk",
        quantity: 2,
        unitPrice: null,
        placements: [
          {
            id: "80000000-0000-0000-0000-000000000004",
            url: "/media/designs/team.png",
            printArea: {
              id: "80000000-0000-0000-0000-000000000005",
              name: "Přední strana",
              widthMm: 300,
              heightMm: 400,
            },
            x: 0,
            y: 0,
            width: 200,
            height: 100,
            rotationDeg: 0,
          },
        ],
      },
    ],
    allowedTransitions: ["CANCELLED"],
    isLocked: false,
    createdAt: "2026-11-16T10:00:00Z",
    updatedAt: "2026-11-16T10:00:00Z",
  };
}

export async function mockAdminOrders(page: Page, count = 21) {
  const state = {
    order: sampleOrder(),
    listError: false,
    rejectWrite: false,
    loseConfirmation: false,
    confirms: 0,
    lists: [] as URLSearchParams[],
    writes: [] as { path: string; body: Record<string, unknown>; method: string }[],
  };
  let version = 0;
  const refresh = () => {
    const order = state.order;
    order.isLocked = !["QUOTE_REQUESTED", "NEW"].includes(order.status!);
    order.subtotal = order.items.some((item) => item.unitPrice == null)
      ? null
      : order.items.reduce((sum, item) => sum + item.unitPrice! * item.quantity!, 0);
    order.total =
      order.subtotal == null || order.shippingCost == null
        ? null
        : order.subtotal + order.shippingCost;
    order.allowedTransitions =
      order.status === "QUOTE_REQUESTED"
        ? ["CANCELLED"]
        : order.status === "NEW"
          ? [
              "CANCELLED",
              ...(order.total != null ? ["PAID"] : []),
              ...(order.total != null && order.confirmedAt ? ["PROCESSING"] : []),
            ]
          : order.status === "PAID"
            ? ["PROCESSING", "REFUNDED"]
            : order.status === "PROCESSING"
              ? ["SHIPPED", "CANCELLED", "REFUNDED"]
              : [];
    order.updatedAt = new Date(Date.parse("2026-11-16T10:00:00Z") + ++version * 1000).toISOString();
  };
  await page.route(/\/api\/v1\/admin\/orders(?:\?.*)?$/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    state.lists.push(params);
    if (state.listError) return route.fulfill({ status: 503, json: {} });
    const order = state.order;
    const match =
      (!params.get("q") ||
        `${order.orderNumber} ${order.customer.email}`
          .toLowerCase()
          .includes(params.get("q")!.toLowerCase())) &&
      (!params.get("status") || params.get("status") === order.status);
    const row = {
      id: order.id,
      orderNumber: order.orderNumber,
      customerFirstName: order.customer.firstName,
      customerLastName: order.customer.lastName,
      customerName: `${order.customer.firstName} ${order.customer.lastName}`,
      customerEmail: order.customer.email,
      createdAt: order.createdAt,
      itemCount: 1,
      total: order.total,
      currency: "CZK",
      status: order.status,
      paymentStatus: order.paymentStatus,
      shipmentStatus: order.shipmentStatus,
      hasCustom: true,
    };
    const pageNumber = Number(params.get("page") || 1);
    return route.fulfill({
      json: {
        count: match ? count : 0,
        next:
          match && count > 20 && pageNumber === 1
            ? "http://localhost:8000/api/v1/admin/orders?page=2"
            : null,
        previous: pageNumber > 1 ? "?page=1" : null,
        results: match ? [row] : [],
      },
    });
  });
  await page.route(new RegExp(`/api/v1/admin/orders/${adminOrderId}(?:/.*)?$`), (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") return route.fulfill({ json: state.order });
    expect(request.headers()["x-csrftoken"]).toBe("bootstrap-token");
    const body = request.postData() ? (request.postDataJSON() as Record<string, unknown>) : {};
    state.writes.push({ path, body, method: request.method() });
    if (state.rejectWrite) {
      state.rejectWrite = false;
      state.order.status = "PROCESSING";
      refresh();
      return route.fulfill({
        status: 409,
        json: { error: { code: "ORDER_LOCKED", message: "Objednávka je uzamčená." } },
      });
    }
    if (path.endsWith(`/items/${adminItemId}`)) {
      Object.assign(state.order.items[0]!, body);
      state.order.confirmedAt = null;
    } else if (path.endsWith("/shipping-cost")) {
      state.order.shippingCost = request.method() === "DELETE" ? 0 : (body.shippingCost as number);
      state.order.shippingCostManual = request.method() !== "DELETE";
      state.order.confirmedAt = null;
    } else if (path.endsWith("/confirm")) {
      state.confirms++;
      state.order.confirmedAt = "2026-11-16T11:00:00Z";
      state.order.status = "NEW";
      refresh();
      if (state.loseConfirmation) {
        state.loseConfirmation = false;
        return route.fulfill({ status: 503, json: {} });
      }
      return route.fulfill({ json: state.order });
    } else if (path.endsWith("/payment-status"))
      state.order.paymentStatus = body.paymentStatus as AdminOrderDetail["paymentStatus"];
    else if (path.endsWith("/status"))
      state.order.status = body.status as AdminOrderDetail["status"];
    else Object.assign(state.order, body);
    refresh();
    return route.fulfill({ json: state.order });
  });
  return state;
}
