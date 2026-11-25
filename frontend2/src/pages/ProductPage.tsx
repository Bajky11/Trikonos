import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Accordion, AccordionDetails, AccordionSummary, Button } from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { money } from "../data/catalog";
import type { CatalogOptionsResponse, MotifDetail } from "../api/generated/models";
import {
  useCatalogOptionsRetrieve,
  useMotifsRetrieve,
  useMotifsRelatedList,
} from "../api/generated/api";
import { ApiError } from "../api/http";
import { CatalogFeedback, CatalogLink, ProductArt, ProductCard } from "../components/Products";
import { useShop } from "../components/ShopContext";
import { useTitle } from "../useTitle";
import { GarmentPreview } from "../components/GarmentPreview";

function VariantChoice({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string; color?: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className={`choice-field ${name === "color" ? "color-field" : ""}`}>
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              required
            />
            <span>
              {option.color && <i style={{ background: option.color }} />}
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ProductDetail({
  product,
  options,
}: {
  product: MotifDetail;
  options: CatalogOptionsResponse;
}) {
  const { add } = useShop();
  const [type, setType] = useState("");
  const [cut, setCut] = useState("");
  const [size, setSize] = useState("");
  const [colorChoice, setColor] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [image, setImage] = useState(0);
  const variants = product.variants.filter(
    (variant) =>
      options.productTypes.some((item) => item.id === variant.productTypeId) &&
      options.cuts.some((item) => item.id === variant.cutId) &&
      options.colors.some((item) => item.id === variant.colorId) &&
      options.sizes.some((item) => item.value === variant.size),
  );
  const types = options.productTypes.filter((item) =>
    variants.some((variant) => variant.productTypeId === item.id),
  );
  const defaultVariants = variants.filter((variant) => variant.colorId === product.defaultColorId);
  const productType =
    types.find((item) => item.id === type) ??
    types.find((item) => defaultVariants.some((variant) => variant.productTypeId === item.id)) ??
    types[0];
  const cuts = options.cuts.filter((item) =>
    variants.some(
      (variant) => variant.productTypeId === productType?.id && variant.cutId === item.id,
    ),
  );
  const cutId =
    cuts.find((item) => item.id === cut)?.id ??
    cuts.find((item) =>
      defaultVariants.some(
        (variant) => variant.productTypeId === productType?.id && variant.cutId === item.id,
      ),
    )?.id ??
    cuts[0]?.id;
  const forCut = variants.filter(
    (variant) => variant.productTypeId === productType?.id && variant.cutId === cutId,
  );
  const colors = options.colors.filter((item) =>
    forCut.some((variant) => variant.colorId === item.id),
  );
  const selectedColor =
    colors.find((item) => item.id === colorChoice) ??
    colors.find((item) => item.id === product.defaultColorId) ??
    colors[0];
  const color = selectedColor?.id ?? "";
  const sizes = options.sizes.filter((item) =>
    forCut.some((variant) => variant.colorId === color && variant.size === item.value),
  );
  const selectedVariant = forCut.find(
    (variant) => variant.colorId === color && variant.size === size,
  );
  const unitPrice = product.price + (productType?.price ?? 0);
  const matchingGarment = product.images.filter(
    (photo) =>
      photo.productTypeId === productType?.id && photo.cutId === cutId && !!photo.productTypeId,
  );
  const generic = product.images.filter((photo) => !photo.productTypeId);
  const exact = matchingGarment.filter((photo) => photo.colorId && photo.colorId === color);
  const colored = generic.filter((photo) => photo.colorId && photo.colorId === color);
  const garmentPhotos = matchingGarment.filter((photo) => !photo.colorId);
  const designImage = product.designImageUrl || undefined;
  const preferredPhotos = [...exact, ...colored, ...garmentPhotos];
  // A null slide is the live composition, not a stored product photograph.
  const preferred = new Set(preferredPhotos);
  const slides = [
    null,
    ...preferredPhotos,
    ...product.images.filter((photo) => !preferred.has(photo)),
  ];
  const background = options.garmentMockups?.find(
    (item) => item.productTypeId === productType?.id && item.cutId === cutId,
  )?.url;
  const previewLabel = `Ilustrační náhled – ${product.name}${selectedColor ? `, ${selectedColor.name}` : ""}`;
  const activeImage = Math.min(image, slides.length - 1);
  return (
    <div className="product-layout">
      <div className="product-preview">
        <div className="product-gallery-main">
          {slides.map((photo, index) => (
            <div
              key={index}
              className={`product-slide ${index === activeImage ? "active" : ""}`}
              aria-hidden={index !== activeImage}
            >
              {photo ? (
                <ProductArt src={photo.url} name={photo.altText || product.name} />
              ) : (
                <GarmentPreview
                  design={designImage}
                  background={background}
                  color={selectedColor?.hexValue}
                  label={previewLabel}
                />
              )}
            </div>
          ))}
        </div>
        {slides.length > 1 && (
          <>
            <div className="product-thumbnails" role="group" aria-label="Vybrat obrázek">
              {slides.map((photo, index) => (
                <button
                  key={index}
                  aria-label={
                    photo
                      ? `${photo.altText || "Fotografie"}, obrázek ${index + 1}`
                      : "Zobrazit automatický náhled"
                  }
                  aria-pressed={activeImage === index}
                  onClick={() => setImage(index)}
                >
                  {photo ? (
                    <ProductArt src={photo.url} />
                  ) : (
                    <GarmentPreview
                      design={designImage}
                      background={background}
                      color={selectedColor?.hexValue}
                      label=""
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="product-gallery-controls">
              <span>
                {activeImage + 1} / {slides.length}
              </span>
            </div>
          </>
        )}
      </div>
      <div className="product-info">
        <h1>{product.name}</h1>
        <p className="product-description">{product.description}</p>
        <p className="product-price">
          {money(unitPrice / 100)} <span>/ kus{!productType && " (základní cena motivu)"}</span>
        </p>
        {productType && productType.price > 0 && (
          <p>
            Základ motivu {money(product.price / 100)} + příplatek za typ oblečení{" "}
            {money(productType.price / 100)}.
          </p>
        )}
        {variants.length ? (
          <form
            className="product-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedVariant) return;
              add({
                kind: "catalog",
                motifId: product.id,
                ...selectedVariant,
                name: product.name,
                previewUrl: preferredPhotos[0]?.url ?? designImage,
                quantity,
                unitPrice,
              });
            }}
          >
            <VariantChoice
              label="Typ oblečení"
              name="type"
              value={productType?.id ?? ""}
              options={types.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(value) => {
                setType(value);
                setCut("");
                setColor("");
                setSize("");
                setImage(0);
              }}
            />
            <VariantChoice
              label="Střih"
              name="cut"
              value={cutId ?? ""}
              options={cuts.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(value) => {
                setCut(value);
                setColor("");
                setSize("");
                setImage(0);
              }}
            />
            <VariantChoice
              label="Barva"
              name="color"
              value={color}
              options={colors.map((item) => ({
                value: item.id,
                label: item.name,
                color: item.hexValue,
              }))}
              onChange={(value) => {
                setColor(value);
                setSize("");
                setImage(0);
              }}
            />
            <VariantChoice
              label="Velikost"
              name="size"
              value={size}
              options={sizes.map((item) => ({ value: item.value, label: item.label }))}
              onChange={setSize}
            />
            {!selectedVariant && <p>Vyberte barvu a velikost.</p>}
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
              <Button variant="contained" type="submit" disabled={!selectedVariant}>
                Přidat do košíku <span>↗</span>
              </Button>
            </div>
          </form>
        ) : (
          <p role="status">Motiv zatím nemá dostupné varianty.</p>
        )}
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
  const { slug = "" } = useParams();
  const detail = useMotifsRetrieve(slug, { query: { enabled: !!slug } });
  const options = useCatalogOptionsRetrieve();
  const related = useMotifsRelatedList(slug, { query: { enabled: detail.isSuccess } });
  const product = detail.data;
  const notFound =
    detail.isError && detail.error instanceof ApiError && detail.error.status === 404;
  const title = product?.name ?? (notFound ? "Produkt nenalezen" : "Detail motivu");
  useTitle(title);
  return (
    <main className="page-main">
      <div className="shell">
        <nav className="breadcrumbs" aria-label="Drobečková navigace">
          <Link to="/">Domů</Link>
          <span>/</span>
          <Link to="/tricka">Všechna trička</Link>
          <span>/</span>
          <span>{title}</span>
        </nav>
        {detail.isSuccess && product ? (
          <>
            {!options.isSuccess && <h1>{product.name}</h1>}
            <CatalogFeedback query={options} label="Varianty" />
            {options.isSuccess && (
              <ProductDetail key={product.id} product={product} options={options.data} />
            )}
            <section className="product-related">
              <div className="collection-heading">
                <h2>Další motivy pro tebe</h2>
                <CatalogLink />
              </div>
              <div className="related-grid">
                {(related.data ?? []).slice(0, 3).map((item) => (
                  <ProductCard key={item.id} product={item} />
                ))}
              </div>
              <CatalogFeedback query={related} label="Související motivy" />
            </section>
          </>
        ) : notFound ? (
          <div className="not-found">
            <h1>Tohle tričko jsme nenašli.</h1>
            <p>Vyberte si jiný motiv v kolekci.</p>
            <CatalogLink />
          </div>
        ) : (
          <CatalogFeedback query={detail} />
        )}
      </div>
    </main>
  );
}
