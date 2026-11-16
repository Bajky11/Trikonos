import { Button, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import { useState } from "react";
import { money } from "../data/catalog";
import type { MotifList } from "../api/generated/models";
import { useCategoriesList } from "../api/generated/api";
import { apiBaseUrl } from "../api/http";

export function ProductArt({
  src,
  name = "",
  className = "",
}: {
  src?: string | null;
  name?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string>();
  const url = src ? new URL(src, `${apiBaseUrl}/`).href : undefined;
  return url && failed !== url ? (
    <div className={`product-art product-art-photo ${className}`}>
      <img src={url} alt={name} loading="lazy" onError={() => setFailed(url)} />
    </div>
  ) : (
    <div
      role={name ? "img" : undefined}
      aria-label={name || undefined}
      className={`product-art product-art-placeholder ${className}`}
    >
      Náhled není k dispozici
    </div>
  );
}
export function ProductCard({ product }: { product: MotifList }) {
  return (
    <article className="product-card">
      <Link to={`/produkt/${encodeURIComponent(product.slug)}`} className="product-card-link">
        <ProductArt src={product.mainImage} />
        <div className="product-card-details">
          <Typography component="h3" variant="h4">
            {product.name}
          </Typography>
          <p>{product.category.name}</p>
          <strong>Motiv {money(product.price / 100)}</strong>
        </div>
      </Link>
    </article>
  );
}
export function ProductStrip({
  products,
  label,
}: {
  products: readonly MotifList[];
  label: string;
}) {
  if (!products.length) return <p role="status">Zatím zde nejsou žádné motivy.</p>;
  return (
    <div className="product-strip" role="region" aria-label={label} tabIndex={0}>
      <div className="product-strip-group">
        {products.map((product) => (
          <ProductCard product={product} key={product.id} />
        ))}
      </div>
    </div>
  );
}
export function ProductFilters({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const categories = useCategoriesList();
  const filters: [string, string][] = [
    ["", "Všechna trička"],
    ...(categories.data ?? []).map((category): [string, string] => [category.slug, category.name]),
  ];
  return (
    <>
      <CatalogFeedback query={categories} label="Kategorie" />
      <div className="product-filters" role="group" aria-label="Filtrovat produkty">
        {filters.map(([id, label]) => (
          <Button
            className={`filter-button ${value === id ? "active" : ""}`}
            key={id}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            {label}
          </Button>
        ))}
      </div>
    </>
  );
}
export function CatalogFeedback({
  query,
  label = "Produkty",
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  label?: string;
}) {
  if (query.isPending) return <p role="status">Načítání…</p>;
  if (!query.isError) return null;
  return (
    <div role="alert">
      <p>{label} se nepodařilo načíst.</p>
      <Button onClick={() => void query.refetch()}>Zkusit znovu</Button>
    </div>
  );
}
export function CatalogLink() {
  return (
    <Button variant="contained" component={Link} to="/tricka" endIcon={<span>→</span>}>
      Všechna trička
    </Button>
  );
}
