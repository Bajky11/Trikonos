const tones: Record<string, string> = {
  QUOTE_REQUESTED: "warning",
  NEW: "info",
  PENDING: "warning",
  FAILED: "danger",
  PAID: "success",
  PROCESSING: "info",
  SHIPPED: "info",
  DELIVERED: "success",
  CANCELLED: "danger",
  REFUNDED: "warning",
  RETURNED: "danger",
};

export function StatusBadge({
  value = "",
  labels,
}: {
  value?: string;
  labels: Record<string, string>;
}) {
  return (
    <span className="orders-status" data-tone={tones[value]}>
      {labels[value] ?? (value || "—")}
    </span>
  );
}
