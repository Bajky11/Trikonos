import { DataTable } from "../../components/DataTable";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import { Button, MenuItem, Paper, TableCell, TableRow, TextField } from "@mui/material";
import {
  adminCustomersExportConsentsRetrieve,
  getAdminAuthMeRetrieveQueryKey,
  useAdminCustomersList,
} from "../../api/generated/api";
import { CatalogFeedback } from "../../components/Products";
import { money } from "../../data/catalog";
import { dateTime } from "../orders/labels";
import { customerError, downloadConsentCsv, sessionRequired, useCustomerReadError } from "./api";

export function CustomersPanel({ search }: { search: string }) {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const previousSearch = useRef(search);
  const exporting = useRef(false);
  const [exportError, setExportError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const consent = params.get("marketingConsent") || "";
  const number = Number(params.get("page") || 1);
  const page = Number.isSafeInteger(number) && number > 0 ? number : 1;
  useEffect(() => {
    if (previousSearch.current === search) return;
    const timer = window.setTimeout(() => {
      previousSearch.current = search;
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("page");
          if (search.trim()) next.set("q", search.trim());
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, setParams]);
  const change = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("page");
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  const customers = useAdminCustomersList(
    {
      page,
      pageSize: 20,
      q: params.get("q") || undefined,
      ordering: params.get("ordering") || "-createdAt",
      marketingConsent: consent === "true" ? true : consent === "false" ? false : undefined,
    },
    {
      query: { retry: false, refetchOnWindowFocus: false, staleTime: 0 },
      request: { cache: "no-store" },
    },
  );
  const csv = useMutation({
    mutationKey: ["admin-customer-export"],
    gcTime: 0,
    retry: false,
    mutationFn: async () => {
      const blob = await adminCustomersExportConsentsRetrieve({
        cache: "no-store",
        headers: { Accept: "*/*" },
      });
      if (!client.getQueryData(getAdminAuthMeRetrieveQueryKey())) return;
      downloadConsentCsv(blob);
    },
  });
  useCustomerReadError(customers.error);
  useCustomerReadError(csv.error);
  return (
    <Paper className="admin-panel" variant="outlined">
      <div className="admin-catalog-toolbar dictionary-toolbar">
        <div className="account-heading">
          <h2>Zákazníci</h2>
          <p>Zákazníci vznikají při objednání. Ruční založení ani smazání není dostupné.</p>
        </div>
        <TextField
          label="Hledání zákazníků"
          type="search"
          value={params.get("q") || ""}
          onChange={(event) => change("q", event.target.value)}
        />
        <TextField
          label="Marketingový souhlas"
          select
          value={consent}
          onChange={(event) => change("marketingConsent", event.target.value)}
        >
          <MenuItem value="">Všichni zákazníci</MenuItem>
          <MenuItem value="true">Se souhlasem</MenuItem>
          <MenuItem value="false">Bez souhlasu</MenuItem>
        </TextField>
        <TextField
          label="Řazení zákazníků"
          select
          value={params.get("ordering") || "-createdAt"}
          onChange={(event) => change("ordering", event.target.value)}
        >
          {Object.entries({
            "-createdAt": "Nejnovější",
            createdAt: "Nejstarší",
            "-ordersCount": "Nejvíce objednávek",
            ordersCount: "Nejméně objednávek",
            "-totalSpent": "Součet cen sestupně",
            totalSpent: "Součet cen vzestupně",
          }).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="outlined"
          disabled={csv.isPending}
          onClick={() => {
            if (
              exporting.current ||
              !window.confirm(
                "Exportovat e-maily VŠECH zákazníků s aktuálním marketingovým souhlasem? Filtry tohoto seznamu se na export nevztahují. Soubor obsahuje osobní údaje; chraňte jej a nepovažujte jej za audit udělení souhlasu.",
              )
            )
              return;
            exporting.current = true;
            setExportError("");
            setExportMessage("");
            void csv
              .mutateAsync()
              .then(() => setExportMessage("CSV se souhlasícími e-maily bylo předáno ke stažení."))
              .catch((error: unknown) => {
                setExportError(customerError(error));
                if (sessionRequired(error))
                  void client.invalidateQueries({ queryKey: getAdminAuthMeRetrieveQueryKey() });
              })
              .finally(() => {
                exporting.current = false;
                csv.reset();
              });
          }}
        >
          Export e-mailů (CSV)
        </Button>
      </div>
      {(exportError || exportMessage || customers.isPending || customers.isError) && (
        <div className="admin-panel-body customer-list-info">
          {exportError && <p role="alert">{exportError}</p>}
          {exportMessage && <p role="status">{exportMessage}</p>}
          <CatalogFeedback query={customers} label="Zákazníci" />
        </div>
      )}
      {customers.isSuccess && (
        <>
          <DataTable
            label="Zákazníci"
            columns={[
              { label: "Kontakt" },
              { label: "Firma" },
              { label: "Souhlas" },
              { label: "Objednávky" },
              { label: "Součet cen" },
              { label: "Poslední objednávka" },
            ]}
            page={page}
            pageCount={Math.ceil(customers.data.count / 20)}
            paginationLabel="Stránkování zákazníků"
            onPageChange={(value) =>
              setParams((current) => {
                const next = new URLSearchParams(current);
                next.set("page", String(value));
                return next;
              })
            }
            empty={
              !customers.data.results.length ? "Žádný zákazník neodpovídá hledání." : undefined
            }
          >
            {customers.data.results.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <div className="customer-contact">
                    <strong>
                      {[customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
                        "Bez jména"}
                    </strong>
                    {customer.phone && (
                      <span>
                        <PhoneOutlinedIcon aria-hidden="true" fontSize="small" />
                        {customer.phone}
                      </span>
                    )}
                    <span>
                      <EmailOutlinedIcon aria-hidden="true" fontSize="small" />
                      <Link to={`/admin/klienti/${customer.id}${params.size ? `?${params}` : ""}`}>
                        {customer.email}
                      </Link>
                    </span>
                  </div>
                </TableCell>
                <TableCell>{customer.companyName || "—"}</TableCell>
                <TableCell>{customer.marketingConsent ? "Ano" : "Ne"}</TableCell>
                <TableCell>{customer.ordersCount}</TableCell>
                <TableCell>
                  {customer.totalSpent == null
                    ? "Není stanoveno"
                    : money(customer.totalSpent / 100)}
                </TableCell>
                <TableCell>{customer.lastOrderAt ? dateTime(customer.lastOrderAt) : "—"}</TableCell>
              </TableRow>
            ))}
          </DataTable>
        </>
      )}
    </Paper>
  );
}
