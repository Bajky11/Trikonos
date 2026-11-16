import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAdminAuthMeRetrieveQueryKey } from "../../api/generated/api";
import { ApiError } from "../../api/http";
import { catalogError } from "../catalog/forms";

export function useCustomerReadError(error: unknown) {
  const client = useQueryClient();
  useEffect(() => {
    if (sessionRequired(error))
      void client.invalidateQueries({ queryKey: getAdminAuthMeRetrieveQueryKey() });
  }, [client, error]);
}
export const sessionRequired = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === 401 || (error.status === 403 && error.code === "AUTHENTICATION_REQUIRED"));
export function customerError(error: unknown) {
  if (error instanceof ApiError && error.code === "EMAIL_TAKEN")
    return "Tento e-mail už patří jinému zákazníkovi. Zvolte jiný; zákazníci se automaticky neslučují.";
  return catalogError(error);
}

export function downloadConsentCsv(blob: Blob) {
  if (!(blob instanceof Blob) || !blob.size || blob.type.split(";")[0] !== "text/csv")
    throw new Error("Server nevrátil CSV export souhlasů.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "marketing-consents.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
