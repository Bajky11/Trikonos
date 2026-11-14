import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Accordion, AccordionDetails, AccordionSummary, Button } from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { money, products, shirtColors, shirtTypes } from "../data/catalog";
import type { Product } from "../data/catalog";
import { CatalogLink, ProductArt, ProductCard } from "../components/Products";
import { useShop } from "../components/ShopContext";
import { useTitle } from "../useTitle";

function ProductDetail({ product }: { product: Product }) {
  const { add } = useShop();
  const [type, setType] = useState(
    product.category === "detska" ? "children" : product.category === "damska" ? "female" : "male",
  );
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [image, setImage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const sizes = shirtTypes.find((item) => item.id === type)!.sizes;
  useEffect(() => {
    if (paused || hovered || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      if (!document.hidden) setImage((index) => (index + 1) % product.images.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [paused, hovered, product]);
  return (
    <div className="product-layout">
      <div
        className="product-preview"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false);
        }}
      >
        <div className="product-gallery-main">
          {product.images.map((photo, index) => (
            <div
              key={index}
              className={`product-slide ${index === image ? "active" : ""}`}
              aria-hidden={index !== image}
            >
              <ProductArt image={photo} name={product.name} />
            </div>
          ))}
        </div>
        <div className="product-thumbnails" role="group" aria-label="Vybrat obrázek">
          {product.images.map((photo, index) => (
            <button
              key={index}
              aria-label={`${photo.label}, obrázek ${index + 1}`}
              aria-pressed={image === index}
              onClick={() => setImage(index)}
            >
              <ProductArt image={photo} />
            </button>
          ))}
        </div>
        <div className="product-gallery-controls">
          <span>
            {image + 1} / {product.images.length}
          </span>
          <button className="plain-button" onClick={() => setPaused((value) => !value)}>
            {paused ? "Spustit střídání" : "Pozastavit střídání"}
          </button>
        </div>
      </div>
      <div className="product-info">
        <h1>{product.name}</h1>
        <p className="product-description">{product.subtitle}</p>
        <p className="product-price">
          {money(product.price)} <span>/ kus</span>
        </p>
        <form
          className="product-form"
          onSubmit={(event) => {
            event.preventDefault();
            add({
              id: product.id,
              name: product.name,
              quantity,
              size,
              color,
              type,
              price: product.price,
            });
          }}
        >
          <fieldset className="choice-field">
            <legend>Typ trička</legend>
            <div>
              {shirtTypes.map((option) => (
                <label key={option.id}>
                  <input
                    type="radio"
                    name="type"
                    value={option.id}
                    checked={type === option.id}
                    onChange={() => {
                      setType(option.id);
                      setSize("");
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="choice-field color-field">
            <legend>Barva</legend>
            <div>
              {shirtColors.map((option) => (
                <label key={option.name}>
                  <input
                    type="radio"
                    name="color"
                    value={option.name}
                    checked={color === option.name}
                    onChange={() => setColor(option.name)}
                    required
                  />
                  <span>
                    <i style={{ background: option.hex }} />
                    {option.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="choice-field">
            <legend>Velikost</legend>
            <div>
              {sizes.map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="size"
                    value={option}
                    checked={size === option}
                    onChange={() => setSize(option)}
                    required
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="product-purchase">
            <label className="quantity-field">
              Počet kusů
              <input
                aria-label="Počet kusů"
                type="number"
                min="1"
                max="99"
                step="1"
                required
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
              />
            </label>
            <Button variant="contained" type="submit">
              Přidat do košíku <span>↗</span>
            </Button>
          </div>
        </form>
        <div className="product-details">
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMore />}>O produktu</AccordionSummary>
            <AccordionDetails>
              Motiv: {product.name}
              <br />
              Barva a velikost dle vašeho výběru.
              <br />
              Kód produktu: {product.id}
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMore />}>Chcete vlastní potisk?</AccordionSummary>
            <AccordionDetails>
              Pro vlastní motiv, týmová trička nebo větší množství se podívejte na{" "}
              <Link to="/#vlastni-potisk">možnosti vlastního potisku →</Link>.
            </AccordionDetails>
          </Accordion>
        </div>
      </div>
    </div>
  );
}
export function ProductPage() {
  const { id } = useParams();
  const product = products.find((item) => item.id === id);
  useTitle(product?.name || "Produkt nenalezen");
  return (
    <main className="page-main">
      <div className="shell">
        <nav className="breadcrumbs" aria-label="Drobečková navigace">
          <Link to="/">Domů</Link>
          <span>/</span>
          <Link to="/tricka">Všechna trička</Link>
          <span>/</span>
          <span>{product?.name || "Produkt nenalezen"}</span>
        </nav>
        {product ? (
          <>
            <ProductDetail key={product.id} product={product} />
            <section className="product-related">
              <div className="collection-heading">
                <h2>Další motivy pro tebe</h2>
                <CatalogLink />
              </div>
              <div className="related-grid">
                {products
                  .filter((item) => item.category === product.category && item.id !== product.id)
                  .slice(0, 3)
                  .map((item) => (
                    <ProductCard key={item.id} product={item} />
                  ))}
              </div>
            </section>
          </>
        ) : (
          <div className="not-found">
            <h1>Tohle tričko jsme nenašli.</h1>
            <p>Vyberte si jiný motiv v kolekci.</p>
            <CatalogLink />
          </div>
        )}
      </div>
    </main>
  );
}
