import { useRef, useState } from "react";
import { importedProducts } from "../data/catalog";

export function Seasonal() {
  const [active, setActive] = useState<string | null>(null);
  const strips = useRef<Record<string, HTMLDivElement | null>>({});
  const openButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const backButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const close = () => {
    const previous = active;
    setActive(null);
    if (previous) openButtons.current[previous]?.focus();
  };
  const scroll = (id: string, direction: number) =>
    strips.current[id]?.scrollBy({ left: direction * 324, behavior: "smooth" });
  const photos = [
    importedProducts[2]!,
    importedProducts[3]!,
    importedProducts[6]!,
    importedProducts[5]!,
    importedProducts[7]!,
    {
      ...importedProducts[2]!,
      id: "tancici-bukacek-detail",
      name: "Tančící Bukáček — detail",
      images: [importedProducts[2]!.images[1]!],
    },
  ];
  return (
    <section
      id="sezona"
      className={`seasonal-section ${active ? "expanded" : ""}`}
      aria-label="Sezonní kolekce"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      {(["christmas", "halloween"] as const).map((id) => {
        const selected = active === id;
        return (
          <article
            key={id}
            className={`season-panel season-${id} ${selected ? "active" : ""}`}
            inert={active !== null && !selected}
          >
            <div className="season-heading">
              <h2>
                <button
                  ref={(node) => {
                    openButtons.current[id] = node;
                  }}
                  className="season-open"
                  aria-expanded={selected}
                  aria-controls={`${id}-designs`}
                  tabIndex={selected ? -1 : 0}
                  onClick={() => {
                    setActive(id);
                    requestAnimationFrame(() => backButtons.current[id]?.focus());
                  }}
                >
                  {id === "christmas" ? "Vánoce" : "Halloween"}
                  <span>
                    Prohlédnout motivy <span>↗</span>
                  </span>
                </button>
              </h2>
              {selected && (
                <p>
                  {id === "christmas"
                    ? "Trocha hor. Trocha kouzla. Radost pod stromeček."
                    : "Trocha tajemna. Trocha nadsázky. Halloween po svém."}
                </p>
              )}
            </div>
            <div
              className="season-detail"
              id={`${id}-designs`}
              inert={!selected}
              aria-hidden={!selected}
            >
              <button
                ref={(node) => {
                  backButtons.current[id] = node;
                }}
                className="season-back"
                onClick={close}
              >
                ← Zpět na sezony
              </button>
              <div className="season-body">
                <div
                  className="season-strip"
                  ref={(node) => {
                    strips.current[id] = node;
                  }}
                  role="region"
                  aria-label={`${id === "christmas" ? "Vánoční" : "Halloweenské"} motivy`}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                      event.preventDefault();
                      scroll(id, event.key === "ArrowLeft" ? -1 : 1);
                    }
                  }}
                >
                  {(id === "christmas" ? photos : [...photos].reverse()).map((product) => (
                    <figure key={product.id}>
                      <img src={product.images[0]!.src} alt={product.name} loading="lazy" />
                      <figcaption>{product.name}</figcaption>
                    </figure>
                  ))}
                </div>
                <div className="season-arrows">
                  <button aria-label="Předchozí motivy" onClick={() => scroll(id, -1)}>
                    ←
                  </button>
                  <button aria-label="Další motivy" onClick={() => scroll(id, 1)}>
                    →
                  </button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
