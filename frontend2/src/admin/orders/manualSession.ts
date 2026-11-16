import type { OrderCreate } from "../../api/generated/models";
export const manualOrderKey = "trikonos-admin-order-attempt-v1";
export type ManualRecord =
  | { kind: "pending"; actorId: string; body: OrderCreate }
  | { kind: "created"; actorId: string; id: string };
export function readManual(): ManualRecord | null {
  try {
    const record = JSON.parse(
      sessionStorage.getItem(manualOrderKey) ?? "null",
    ) as ManualRecord | null;
    if (!record || typeof record.actorId !== "string") return null;
    if (record.kind === "created" && typeof record.id === "string") return record;
    if (
      record.kind === "pending" &&
      typeof record.body?.orderId === "string" &&
      Array.isArray(record.body.items)
    )
      return record;
  } catch {
    /* Unavailable or corrupt storage must not crash admin. */
  }
  return null;
}
export function storeManual(record: ManualRecord) {
  sessionStorage.setItem(manualOrderKey, JSON.stringify(record));
}
export function clearManual() {
  sessionStorage.removeItem(manualOrderKey);
}
