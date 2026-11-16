import { apiBaseUrl } from "../../api/http";

export function orderAssetUrl(value: string) {
  try {
    const url = new URL(value, `${apiBaseUrl}/`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function downloadLabel(blob: Blob, orderNumber: string) {
  if (!(blob instanceof Blob) || !blob.size || blob.type.split(";")[0] !== "application/pdf")
    throw new Error("Server nevrátil platný PDF štítek.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${orderNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}-label.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
