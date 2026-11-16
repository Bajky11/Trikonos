import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { Button } from "@mui/material";
import { useAdminOrdersPrintSheetRetrieve } from "../../api/generated/api";
import { CatalogFeedback } from "../../components/Products";
import { amount } from "./OrderPricing";
import { orderAssetUrl } from "./files";
import { dateTime, deliveryTypes, orderStatuses, paymentMethods } from "./labels";

export function OrderPrintPage() {
  const { orderId = "" } = useParams();
  const [imageFailed, setImageFailed] = useState(false);
  const query = useAdminOrdersPrintSheetRetrieve(orderId, {
    query: { retry: false, refetchOnWindowFocus: false, staleTime: 0 },
    request: { cache: "no-store" },
  });
  return (
    <main className="shell page-main order-print-sheet">
      <div className="print-controls">
        <Button component={Link} to={`/admin/objednavky/${orderId}`}>
          Zpět na detail objednávky
        </Button>
        <Button disabled={!query.isSuccess || query.isFetching} onClick={() => window.print()}>
          Vytisknout výrobní list
        </Button>
        <p>
          Před tiskem ověřte aktuálnost a načtení podkladů. Podklady jsou ilustrace rozmístění, ne
          tisk v měřítku 1:1.
        </p>
      </div>
      <CatalogFeedback query={query} label="Výrobní list" />
      {imageFailed && (
        <p role="alert" className="print-controls">
          Některý podklad se nepodařilo zobrazit. Před tiskem jej ověřte přes odkaz na originál.
        </p>
      )}
      {query.isSuccess && (
        <article>
          <h1>Výrobní list — {query.data.orderNumber}</h1>
          <p>
            Vytvořeno: {dateTime(query.data.createdAt)} · Stav:{" "}
            {orderStatuses[query.data.status || ""] ?? query.data.status}
          </p>
          <p>
            Zákazník: {query.data.customer.firstName} {query.data.customer.lastName} ·{" "}
            {query.data.customer.email} · {query.data.customer.phone}
          </p>
          <h2>Doručení</h2>
          <p>
            {deliveryTypes[query.data.deliveryType || ""] ?? "Neurčeno"} ·{" "}
            {query.data.carrier?.name} · {query.data.pickupPointName}
          </p>
          <p>
            {query.data.shipping.fullName}
            <br />
            {query.data.shipping.companyName}
            <br />
            {query.data.shipping.street}
            <br />
            {query.data.shipping.zip} {query.data.shipping.city}, {query.data.shipping.country}
          </p>
          {query.data.note && <p>Poznámka: {query.data.note}</p>}
          <p>
            Platba: {paymentMethods[query.data.paymentMethod || ""] ?? "Neurčena"} · Celkem:{" "}
            {amount(query.data.total)}
          </p>
          <h2>Položky</h2>
          {query.data.items.map((item) => (
            <section key={item.id} className="print-item">
              <h3>
                {item.quantity} ks — {item.itemLabel}
              </h3>
              <p>
                {item.productType?.name} · {item.cut?.name} · {item.color?.name} · {item.size}
              </p>
              {item.customText && <p>{item.customText}</p>}
              {item.placements.map((placement) => (
                <div key={placement.id}>
                  <p>
                    {placement.printArea.name} ({placement.printArea.widthMm} ×{" "}
                    {placement.printArea.heightMm} mm): {placement.width} × {placement.height} mm;
                    x={placement.x}, y={placement.y} mm; rotace {placement.rotationDeg}°
                  </p>
                  {orderAssetUrl(placement.url) && (
                    <>
                      <a href={orderAssetUrl(placement.url)} target="_blank" rel="noreferrer">
                        Originální podklad
                      </a>
                      <img
                        src={orderAssetUrl(placement.url)}
                        alt={`Podklad: ${item.itemLabel}, ${placement.printArea.name}`}
                        className="print-design"
                        onError={() => setImageFailed(true)}
                      />
                    </>
                  )}
                </div>
              ))}
            </section>
          ))}
        </article>
      )}
    </main>
  );
}
