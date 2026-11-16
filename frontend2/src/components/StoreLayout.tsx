import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button, Dialog, DialogContent, DialogTitle, IconButton } from "@mui/material";
import Close from "@mui/icons-material/Close";
import LocalShippingOutlined from "@mui/icons-material/LocalShippingOutlined";
import Undo from "@mui/icons-material/Undo";
import VerifiedUserOutlined from "@mui/icons-material/VerifiedUserOutlined";
import Checkroom from "@mui/icons-material/Checkroom";
import { useShop } from "./ShopContext";
import { useConfigRetrieve } from "../api/generated/api";
import { useStoreData } from "../api/useStoreData";
import { LoginForm } from "../auth/LoginForm";

const navigation = [
  ["nase-prace", "Naše práce"],
  ["sezona", "Sezóna"],
  ["potisky", "Naše potisky"],
  ["vlastni-potisk", "Vlastní potisk"],
  ["faq", "FAQ"],
  ["kontakt", "Kontakty"],
];
function Header() {
  const { data: config } = useConfigRetrieve();
  const shopName = config?.shopName || "Trikonoš";
  const location = useLocation();
  const home = location.pathname === "/";
  const [position, setPosition] = useState({ solid: !home, ribbon: !home, active: "" });
  const { count } = useShop();
  const navigate = useNavigate();
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const hero = document.getElementById("domu");
      const inQuietSection = ["nase-prace", "sezona"].some((id) => {
        const bounds = document.getElementById(id)?.getBoundingClientRect();
        return bounds && bounds.top <= 145 && bounds.bottom > 145;
      });
      let active = home ? "" : "potisky";
      if (home)
        for (const [id] of navigation) {
          if ((document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= 192)
            active = id!;
        }
      setPosition({
        solid: !home || window.scrollY > 64,
        ribbon: !home || (!inQuietSection && !!hero && hero.getBoundingClientRect().bottom <= 145),
        active,
      });
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [home]);
  const notices = [
    [LocalShippingOutlined, "Doprava od 2 kusů zdarma"],
    [Undo, "Možnost vrácení do 14 dní"],
    [VerifiedUserOutlined, "Odolný potisk"],
    [Checkroom, "Kvalitní bavlněná trička"],
  ] as const;
  return (
    <header
      className={`site-header ${position.solid ? "solid" : ""} ${position.ribbon ? "has-ribbon" : ""}`}
    >
      <nav className="nav shell" aria-label="Hlavní navigace">
        <Link className="brand" to="/#domu" aria-label={`${shopName}, úvodní stránka`}>
          {shopName}
        </Link>
        <div className="nav-links">
          {navigation.map(([id, label]) => (
            <Link
              key={id}
              className={position.active === id ? "active" : ""}
              to={id === "potisky" && !home ? "/tricka" : `/#${id}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <IconButton
          className="cart-button"
          aria-label={`Košík, počet položek: ${count}`}
          onClick={() => navigate("/kosik")}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 8h14l1 13H4L5 8Z" />
            <path d="M8 9V6a4 4 0 0 1 8 0v3" />
          </svg>
          {!!count && <span className="cart-count">{count}</span>}
        </IconButton>
      </nav>
      <div className="ribbon" aria-label={notices.map(([, text]) => text).join(". ")}>
        <div className="ribbon-track" aria-hidden="true">
          {[0, 1].map((group) => (
            <div key={group}>
              {notices.map(([Icon, text]) => (
                <span key={text}>
                  <Icon />
                  {text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
function Footer() {
  const { config, options } = useStoreData();
  const shopName = config.data?.shopName || "Trikonoš";
  const [login, setLogin] = useState(false);
  return (
    <>
      <footer className="store-footer" id="kontakt">
        <div className="shell">
          <div className="footer-grid">
            <div>
              <Link to="/#domu" className="footer-logo">
                {shopName}
              </Link>
              <p>Triko z hor, které má duši.</p>
            </div>
            <div>
              <h3>Najdi svou cestu</h3>
              <Link to="/tricka">Kolekce triček</Link>
              <Link to="/#vlastni-potisk">Vlastní motiv</Link>
              <Link to="/#faq">Časté dotazy</Link>
            </div>
            <div>
              <h3>Ozvi se</h3>
              {config.isPending && <p aria-live="polite">Načítání kontaktních údajů…</p>}
              {config.data?.contactEmail && (
                <a href={`mailto:${config.data.contactEmail}`}>{config.data.contactEmail}</a>
              )}
              {config.data?.contactPhone && (
                <a href={`tel:${config.data.contactPhone}`}>{config.data.contactPhone}</a>
              )}
              {config.data?.instagramUrl && (
                <a href={config.data.instagramUrl} target="_blank" rel="noreferrer">
                  Instagram
                </a>
              )}
              {config.isSuccess && !config.data.contactEmail && !config.data.contactPhone && (
                <p>Kontaktní údaje zatím nejsou vyplněné.</p>
              )}
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Zpět nahoru ↑
              </a>
            </div>
          </div>
          {(config.isError || options.isError) && (
            <div role="alert">
              <p>
                {config.isError
                  ? "Konfiguraci obchodu se nepodařilo načíst."
                  : "Katalogové číselníky se nepodařilo načíst."}
              </p>
              <Button
                onClick={() => {
                  if (config.isError) void config.refetch();
                  if (options.isError) void options.refetch();
                }}
              >
                Zkusit načíst znovu
              </Button>
            </div>
          )}
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} {shopName}
            </span>
            <button onClick={() => setLogin(true)} className="plain-button">
              Login
            </button>
          </div>
        </div>
      </footer>
      <Dialog open={login} onClose={() => setLogin(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          Přihlášení
          <IconButton
            className="dialog-close"
            onClick={() => setLogin(false)}
            aria-label="Zavřít přihlášení"
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <p className="section-label">Trikonoš admin</p>
          <LoginForm />
        </DialogContent>
      </Dialog>
    </>
  );
}
export function StoreLayout() {
  return (
    <>
      <Header />
      <Outlet />
      <Footer />
    </>
  );
}
