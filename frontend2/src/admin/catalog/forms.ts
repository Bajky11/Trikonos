import { ApiError } from "../../api/http";

export function formText(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

export function parsePrice(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [major, minor = ""] = normalized.split(".");
  const result = Number(major) * 100 + Number(minor.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result <= 2147483647 ? result : null;
}

export function catalogError(error: unknown) {
  if (!(error instanceof ApiError)) return "Operaci se nepodařilo dokončit. Zkuste to znovu.";
  const body = error.data as { error?: { fields?: unknown } } | null;
  if (error.code === "IN_USE")
    return "Motiv je použitý v objednávkách. Místo smazání jej deaktivujte.";
  if (error.code === "DUPLICATE_VARIANT")
    return "Tato kombinace již existuje. Upravte stávající řádek.";
  const fields = body?.error?.fields;
  const details =
    fields && typeof fields === "object"
      ? Object.entries(fields).flatMap(([name, messages]) =>
          Array.isArray(messages)
            ? messages
                .filter((message): message is string => typeof message === "string")
                .map((message) => `${name}: ${message}`)
            : [],
        )
      : [];
  return [error.message, ...details].join(" ");
}
