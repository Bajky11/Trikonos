import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Accordion, AccordionDetails, AccordionSummary, Button, Typography } from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { designs, importedProducts, stripProducts } from "../data/catalog";
import { faqs, reviews } from "../data/content";
import { CatalogLink, ProductFilters, ProductStrip } from "../components/Products";
import { PhotoGallery } from "../components/PhotoGallery";
import { Seasonal } from "../components/Seasonal";
import { CustomPrint } from "../components/CustomPrint";
import { useTitle } from "../useTitle";

function Hero() {
  const [design, setDesign] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      if (!document.hidden && window.scrollY < window.innerHeight)
        setDesign((index) => (index + 1) % designs.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);
  return (
    <section className="hero" id="domu" aria-labelledby="hero-title">
      <div className="hero-art" aria-hidden="true">
        <svg
          viewBox="0 0 1671 941"
          preserveAspectRatio="xMidYMid slice"
          className="hero-design-scene"
        >
          <g transform="matrix(1 .05 -.06 1 935 382)">
            <image href={designs[design]!.src} width="164" height="164" />
          </g>
          <g transform="matrix(.98 .09 -.10 .98 1365 450)">
            <image href={designs[(design + 2) % designs.length]!.src} width="146" height="146" />
          </g>
        </svg>
      </div>
      <div className="hero-inner shell">
        <div className="hero-copy">
          <p className="section-label hero-eyebrow">Z Krkonoš. S láskou k horám.</p>
          <h1 id="hero-title">
            Triko z hor,
            <br />
            které má <em>duši.</em>
          </h1>
          <p className="hero-lead">
            Originální trička s motivy navrženými
            <br /> a potištěnými v Krkonoších.
          </p>
          <div className="hero-actions">
            <Button component={Link} to="/#potisky" variant="contained">
              Prohlédnout kolekci
            </Button>
            <Button component={Link} to="/#vlastni-potisk" variant="outlined">
              Vlastní potisk <span>↗</span>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
export function HomePage() {
  useTitle("Triko z hor, které má duši");
  const [filter, setFilter] = useState("all");
  return (
    <main className="home-page">
      <Hero />
      <section id="nase-prace" className="work-section">
        <div className="shell">
          <PhotoGallery />
          <div className="reviews-grid">
            <div className="reviews-heading">
              <Typography variant="h4" component="h3">
                Co o nás říkají zákazníci
              </Typography>
              <a href="https://share.google/dLdJat161BuZ7u5VZ" target="_blank" rel="noreferrer">
                Google ↗
              </a>
            </div>
            {reviews.map((text, index) => (
              <article className="review-card" key={text}>
                <div className="review-stars" aria-label={`Hodnocení: ${index === 1 ? 4 : 5} z 5`}>
                  {index === 1 ? (
                    <>
                      ★★★★<span>★</span>
                    </>
                  ) : (
                    "★★★★★"
                  )}
                </div>
                <p>„{text}“</p>
                <h4>Jméno zákazníka</h4>
              </article>
            ))}
          </div>
        </div>
      </section>
      <Seasonal />
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
                Bestsellers
              </Typography>
              <CatalogLink />
            </div>
            <ProductStrip products={importedProducts.slice(0, 6)} label="Výběr bestsellerů" />
          </div>
          <div className="collection-heading">
            <Typography component="h3" variant="h3">
              Vyber si svůj motiv
            </Typography>
            <CatalogLink />
          </div>
          <ProductFilters value={filter} onChange={setFilter} />
          <ProductStrip
            key={filter}
            products={stripProducts(filter)}
            label="Výběr triček podle kategorie"
          />
        </div>
      </section>
      <CustomPrint />
      <section className="faq-section" id="faq">
        <div className="shell faq-grid">
          <div>
            <span className="section-label">03 / FAQ</span>
            <h2>Často se ptáte</h2>
          </div>
          <div>
            {faqs.map(([question, answer]) => (
              <Accordion key={question}>
                <AccordionSummary expandIcon={<ExpandMore />}>{question}</AccordionSummary>
                <AccordionDetails>{answer}</AccordionDetails>
              </Accordion>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
