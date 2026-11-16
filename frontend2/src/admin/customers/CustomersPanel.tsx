import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  MenuItem,
  Pagination,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
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
      <h2>Zákazníci</h2>
      <div className="admin-catalog-toolbar">
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
          Exportovat souhlasící e-maily (CSV)
        </Button>
      </div>
      {exportError && <p role="alert">{exportError}</p>}
      {exportMessage && <p role="status">{exportMessage}</p>}
      <p>
        Součet cen zahrnuje známé ceny všech objednávek, včetně nezaplacených a zrušených. Nejde o
        skutečně uhrazené částky. Souhlas je jen aktuální hodnota bez historie a auditních údajů.
      </p>
      <CatalogFeedback query={customers} label="Zákazníci" />
      {customers.isSuccess && (
        <>
          <TableContainer>
            <Table aria-label="Zákazníci">
              <TableHead>
                <TableRow>
                  {[
                    "Kontakt",
                    "Firma",
                    "Souhlas",
                    "Objednávky",
                    "Součet cen",
                    "Poslední objednávka",
                  ].map((label) => (
                    <TableCell key={label}>{label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {customers.data.results.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link to={`/admin/klienti/${customer.id}${params.size ? `?${params}` : ""}`}>
                        {customer.email}
                      </Link>
                      <br />
                      {customer.firstName} {customer.lastName}
                      <br />
                      {customer.phone}
                    </TableCell>
                    <TableCell>{customer.companyName || "—"}</TableCell>
                    <TableCell>{customer.marketingConsent ? "Ano" : "Ne"}</TableCell>
                    <TableCell>{customer.ordersCount}</TableCell>
                    <TableCell>
                      {customer.totalSpent == null
                        ? "Není stanoveno"
                        : money(customer.totalSpent / 100)}
                    </TableCell>
                    <TableCell>
                      {customer.lastOrderAt ? dateTime(customer.lastOrderAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {!customers.data.results.length && (
            <p role="status">Žádný zákazník neodpovídá hledání.</p>
          )}
          {customers.data.count > 20 && (
            <Pagination
              aria-label="Stránkování zákazníků"
              page={page}
              count={Math.ceil(customers.data.count / 20)}
              onChange={(_, value) =>
                setParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set("page", String(value));
                  return next;
                })
              }
            />
          )}
        </>
      )}
      <p>
        Zákazníci vznikají při objednání. Toto API nenabízí ruční založení ani smazání zákazníka.
      </p>
    </Paper>
  );
}
