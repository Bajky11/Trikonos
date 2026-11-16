import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { Button, Typography } from "@mui/material";
import { StoreLayout } from "./components/StoreLayout";
import { ShopProvider } from "./components/ShopContext";
import { HomePage } from "./pages/HomePage";
import { CatalogPage } from "./pages/CatalogPage";
import { ProductPage } from "./pages/ProductPage";
import { CartPage } from "./pages/CartPage";
import { useTitle } from "./useTitle";
import { RequireAuth } from "./auth/RequireAuth";
import { LoginPage } from "./pages/LoginPage";

// Administration is not needed by storefront visitors.
const AdminLayout = lazy(() =>
  import("./pages/AdminPage").then((module) => ({ default: module.AdminLayout })),
);
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })),
);
const CheckoutPage = lazy(() =>
  import("./pages/CheckoutPage").then((module) => ({ default: module.CheckoutPage })),
);
const OrderReceiptPage = lazy(() =>
  import("./pages/OrderReceiptPage").then((module) => ({ default: module.OrderReceiptPage })),
);
const OrderAccessLinkPage = lazy(() =>
  import("./pages/OrderReceiptPage").then((module) => ({ default: module.OrderAccessLinkPage })),
);
const OrderLookupPage = lazy(() =>
  import("./pages/OrderLookupPage").then((module) => ({ default: module.OrderLookupPage })),
);
const ContactPage = lazy(() =>
  import("./pages/ContactPage").then((module) => ({ default: module.ContactPage })),
);
const OrderDetailPage = lazy(() =>
  import("./admin/orders/OrderDetailPage").then((module) => ({ default: module.OrderDetailPage })),
);
const OrderPrintPage = lazy(() =>
  import("./admin/orders/OrderPrintPage").then((module) => ({ default: module.OrderPrintPage })),
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
              <Route path="produkt/:slug" element={<ProductPage />} />
              <Route path="kosik" element={<CartPage />} />
              <Route path="pokladna" element={<CheckoutPage />} />
              <Route path="objednavka" element={<OrderReceiptPage />} />
              <Route path="stav-objednavky" element={<OrderLookupPage />} />
              <Route path="kontakt" element={<ContactPage />} />
              <Route path="orders/:accessToken" element={<OrderAccessLinkPage />} />
              <Route path="prihlaseni" element={<LoginPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route element={<RequireAuth />}>
              <Route path="admin/objednavky/:orderId/tisk" element={<OrderPrintPage />} />
              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<AdminPage section="prehled" />} />
                <Route path="objednavky/:orderId" element={<OrderDetailPage />} />
                <Route path="orders/:orderId" element={<OrderDetailPage />} />
                <Route path=":section" element={<AdminPage />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </ShopProvider>
    </BrowserRouter>
  );
}
