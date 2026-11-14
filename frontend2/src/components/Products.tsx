import { Button, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import type { CSSProperties } from "react";
import { filters, money } from "../data/catalog";
import type { Product, ProductImage } from "../data/catalog";

export function ProductArt({
  image,
  name = "",
  className = "",
}: {
  image: ProductImage;
  name?: string;
  className?: string;
}) {
  return image.src ? (
    <div className={`product-art product-art-photo ${className}`}>
      <img
        src={image.src}
        alt={name}
        loading="lazy"
        style={{ transform: `scale(${image.zoom || 1})` }}
      />
    </div>
  ) : (
    <div
      role={name ? "img" : undefined}
      aria-label={name || undefined}
      className={`product-art ${className}`}
      style={
        { "--x": `${image.x}%`, "--y": `${image.y}%`, "--zoom": image.zoom || 1 } as CSSProperties
      }
    />
  );
}
export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <Link to={`/produkt/${product.id}`} className="product-card-link">
        <ProductArt image={product.images[0]!} />
        <div className="product-card-details">
          <Typography component="h3" variant="h4">
            {product.name}
          </Typography>
          <p>{product.subtitle}</p>
          <strong>{money(product.price)}</strong>
        </div>
      </Link>
    </article>
  );
}
export function ProductStrip({ products, label }: { products: Product[]; label: string }) {
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
  return (
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
  );
}
export function CatalogLink() {
  return (
    <Button variant="contained" component={Link} to="/tricka" endIcon={<span>→</span>}>
      Všechna trička
    </Button>
  );
}
