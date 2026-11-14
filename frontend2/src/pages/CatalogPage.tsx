import { useSearchParams, Link } from "react-router-dom";
import { Pagination } from "@mui/material";
import { filterProducts } from "../data/catalog";
import { ProductCard, ProductFilters } from "../components/Products";
import { useTitle } from "../useTitle";

export function CatalogPage() {
  useTitle("Všechna trička");
  const [params, setParams] = useSearchParams();
  const filter = params.get("kategorie") || "all";
  const visible = filterProducts(filter);
  const pages = Math.max(1, Math.ceil(visible.length / 12));
  const page = Math.max(1, Math.min(Number(params.get("strana")) || 1, pages));
  const start = (page - 1) * 12;
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
            <ProductFilters
              value={filter}
              onChange={(value) => setParams(value === "all" ? {} : { kategorie: value })}
            />
          </aside>
          <div>
            <div className="catalog-grid">
              {visible.slice(start, start + 12).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            {!visible.length && <p role="status">V této kategorii zatím nejsou žádná trička.</p>}
            <div className="pagination-bar">
              <p role="status">
                Zobrazeno {visible.length ? start + 1 : 0}–{Math.min(start + 12, visible.length)} z{" "}
                {visible.length} triček
              </p>
              <Pagination
                count={pages}
                page={page}
                shape="rounded"
                variant="outlined"
                onChange={(_, value) => {
                  setParams({
                    ...(filter !== "all" ? { kategorie: filter } : {}),
                    strana: String(value),
                  });
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
          </div>
        </div>
      </div>
    </main>
  );
}
