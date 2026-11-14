import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { Button, Typography } from "@mui/material";
import { StoreLayout } from "./components/StoreLayout";
import { ShopProvider } from "./components/ShopContext";
import { HomePage } from "./pages/HomePage";
import { CatalogPage } from "./pages/CatalogPage";
import { ProductPage } from "./pages/ProductPage";
import { useTitle } from "./useTitle";

// Administration is not needed by storefront visitors.
const AdminLayout = lazy(() =>
  import("./pages/AdminPage").then((module) => ({ default: module.AdminLayout })),
);
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })),
);

function ScrollToLocation() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (hash)
        document
          .getElementById(decodeURIComponent(hash.slice(1)))
          ?.scrollIntoView({ behavior: "instant" });
      else window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);
  return null;
}
function NotFound() {
  useTitle("Stránka nenalezena");
  return (
    <main className="shell page-main">
      <Typography variant="h1">Tudy cesta nevede.</Typography>
      <p>Požadovanou stránku jsme nenašli.</p>
      <Button component={Link} to="/" variant="contained">
        Zpět domů
      </Button>
    </main>
  );
}
export function App() {
  return (
    <BrowserRouter>
      <ShopProvider>
        <ScrollToLocation />
        <Suspense
          fallback={
            <p role="status" className="loading-page">
              Načítání…
            </p>
          }
        >
          <Routes>
            <Route element={<StoreLayout />}>
              <Route index element={<HomePage />} />
              <Route path="tricka" element={<CatalogPage />} />
              <Route path="produkt/:id" element={<ProductPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<AdminPage section="prehled" />} />
              <Route path=":section" element={<AdminPage />} />
            </Route>
          </Routes>
        </Suspense>
      </ShopProvider>
    </BrowserRouter>
  );
}
