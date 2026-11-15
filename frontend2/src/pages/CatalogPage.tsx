import { useSearchParams, Link } from "react-router-dom";
import { Button, MenuItem, Pagination, TextField } from "@mui/material";
import { ProductCard, ProductFilters, CatalogFeedback } from "../components/Products";
import { useMotifsList } from "../api/generated/api";
import { MotifsListOrdering } from "../api/generated/models";
import { ApiError } from "../api/http";
import { useTitle } from "../useTitle";

export function CatalogPage() {
  useTitle("Všechna trička");
  const [params, setParams] = useSearchParams();
  const filter = params.get("kategorie") || "";
  const requestedPage = Number(params.get("strana") ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;
  const orderings = [
    [MotifsListOrdering.position, "Výchozí pořadí"],
    [MotifsListOrdering["-createdAt"], "Nejnovější"],
    [MotifsListOrdering.price, "Nejlevnější"],
    [MotifsListOrdering["-price"], "Nejdražší"],
    [MotifsListOrdering.name, "Podle názvu"],
  ] as const;
  const ordering = orderings.find(([value]) => value === params.get("razeni"))?.[0] ?? "position";
  const products = useMotifsList({
    category: filter || undefined,
    q: params.get("q") || undefined,
    page,
    pageSize: 12,
    ordering,
  });
  const count = products.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / 12));
  const start = (page - 1) * 12;
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "strana") next.delete("strana");
    setParams(next);
  };
  return (
    <main className="page-main catalog-main">
      <div className="shell">
        <nav className="breadcrumbs" aria-label="Drobečková navigace">
          <Link to="/">Domů</Link>
          <span>/</span>
          <span>Všechna trička</span>
        </nav>
        <div className="catalog-heading">
          <span className="section-label">Naše potisky</span>
          <h1 id="catalog-title">Všechna trička</h1>
        </div>
        <div className="catalog-layout">
          <aside>
            <ProductFilters value={filter} onChange={(value) => update("kategorie", value)} />
          </aside>
          <div>
            <form
              className="catalog-tools"
              onSubmit={(event) => {
                event.preventDefault();
                const value = new FormData(event.currentTarget).get("q");
                if (typeof value === "string") update("q", value.trim());
              }}
            >
              <TextField
                key={params.get("q")}
                label="Hledat motiv"
                name="q"
                defaultValue={params.get("q") ?? ""}
              />
              <Button type="submit">Hledat</Button>
              <TextField
                select
                label="Řazení"
                value={ordering}
                onChange={(event) => update("razeni", event.target.value)}
              >
                {orderings.map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            </form>
            {products.isError &&
            products.error instanceof ApiError &&
            products.error.status === 404 &&
            page > 1 ? (
              <div role="alert">
                <p>Tato stránka katalogu neexistuje.</p>
                <Button onClick={() => update("strana", "")}>Zpět na první stránku</Button>
              </div>
            ) : (
              <CatalogFeedback query={products} />
            )}
            {products.isSuccess && (
              <>
                <div className="catalog-grid">
                  {products.data.results.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
                {!count && <p role="status">Žádné motivy neodpovídají výběru.</p>}
                <div className="pagination-bar">
                  <p role="status">
                    Zobrazeno {count ? start + 1 : 0}–{Math.min(start + 12, count)} z {count} motivů
                  </p>
                  <Pagination
                    count={pages}
                    page={page}
                    shape="rounded"
                    variant="outlined"
                    onChange={(_, value) => {
                      update("strana", value === 1 ? "" : String(value));
                      window.scrollTo({ top: 0, behavior: "instant" });
                    }}
                    getItemAriaLabel={(type, value) =>
                      type === "page"
                        ? `Stránka ${value}`
                        : type === "next"
                          ? "Další stránka"
                          : "Předchozí stránka"
                    }
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
