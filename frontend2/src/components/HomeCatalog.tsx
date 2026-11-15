import { useState } from "react";
import { Typography } from "@mui/material";
import { useMotifsList } from "../api/generated/api";
import { CatalogFeedback, CatalogLink, ProductFilters, ProductStrip } from "./Products";

export function HomeCatalog() {
  const [category, setCategory] = useState("");
  const featured = useMotifsList({ pageSize: 8 });
  const selection = useMotifsList({ category: category || undefined, pageSize: 8 });
  return (
    <section id="potisky" className="collection-section">
      <div className="shell">
        <div className="section-heading">
          <div>
            <span className="section-label">01 / Naše potisky</span>
            <h2>Kolekce triček</h2>
          </div>
        </div>
        <div className="bestsellers">
          <div className="collection-heading">
            <Typography component="h3" variant="h3">
              Výběr z kolekce
            </Typography>
            <CatalogLink />
          </div>
          <CatalogFeedback query={featured} />
          {featured.isSuccess && (
            <ProductStrip products={featured.data.results.slice(0, 6)} label="Výběr z kolekce" />
          )}
        </div>
        <div className="collection-heading">
          <Typography component="h3" variant="h3">
            Vyber si svůj motiv
          </Typography>
          <CatalogLink />
        </div>
        <ProductFilters value={category} onChange={setCategory} />
        <CatalogFeedback query={selection} />
        {selection.isSuccess && (
          <ProductStrip products={selection.data.results} label="Výběr triček podle kategorie" />
        )}
      </div>
    </section>
  );
}
