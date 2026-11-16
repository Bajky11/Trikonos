import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Paper, TextField, Typography } from "@mui/material";
import { cartValidateCreate, useCatalogOptionsRetrieve } from "../api/generated/api";
import { withCsrf } from "../auth/csrf";
import { catalogLines, cartError } from "../cart/validation";
import { useShop } from "../components/ShopContext";
import { CatalogFeedback } from "../components/Products";
import { money } from "../data/catalog";
import { useTitle } from "../useTitle";

function Quantity({ quantity, onSave }: { quantity: number; onSave: (value: number) => boolean }) {
  const [value, setValue] = useState(String(quantity));
  const [error, setError] = useState("");
  return (
    <form
      className="cart-quantity"
      onSubmit={(event) => {
        event.preventDefault();
        const next = Number(value);
        if (!Number.isInteger(next) || next < 1 || next > 99) {
          setError("Zadejte počet 1–99.");
          return;
        }
        if (onSave(next)) setError("");
      }}
    >
      <TextField
        label="Počet kusů"
        type="number"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        required
        slotProps={{ htmlInput: { min: 1, max: 99, step: 1 } }}
      />
      <Button type="submit" disabled={value === String(quantity)}>
        Uložit počet
      </Button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function CartPage() {
  useTitle("Košík — Trikonoš");
  const shop = useShop();
  const options = useCatalogOptionsRetrieve();
  const lines = catalogLines(shop.items);
  const submitted = lines.filter((line) => line.input !== null);
  const inputs = submitted.flatMap((line) => (line.input ? [line.input] : []));
  const validation = useQuery({
    queryKey: ["cart-validation", inputs],
    queryFn: ({ signal }) =>
      withCsrf(async () => {
        const result = await cartValidateCreate({ items: inputs }, { signal });
        if (result.items.length !== inputs.length) throw new Error("Invalid cart response length");
        return result;
      }),
    enabled: inputs.length > 0,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const verified = validation.isSuccess && !validation.isFetching;
  const hasCustom = shop.items.some((item) => item.kind !== "catalog");
  const subtotal = verified && inputs.length === lines.length ? validation.data.subtotal : null;
  return (
    <main className="shell page-main cart-page">
      <Typography variant="h1">Košík</Typography>
      <p>
        Uložené položky zůstávají v tomto prohlížeči. Objednání ani checkout zatím nejsou dostupné.
      </p>
      {shop.items.length > 0 && <CatalogFeedback query={options} label="Popisky variant" />}
      {!shop.items.length ? (
        <>
          <p role="status">Košík je prázdný.</p>
          <Button component={Link} to="/tricka" variant="contained">
            Vybrat motiv
          </Button>
        </>
      ) : (
        <>
          {inputs.length > 0 && (
            <>
              {validation.isFetching && (
                <p role="status">Ověřování dostupnosti a aktuálních cen…</p>
              )}
              {validation.fetchStatus === "paused" && (
                <p role="status">Ověření čeká na připojení k internetu.</p>
              )}
              {validation.isError && <p role="alert">{cartError(validation.error)}</p>}
              <Button disabled={validation.isFetching} onClick={() => void validation.refetch()}>
                Znovu ověřit katalogové položky
              </Button>
            </>
          )}
          <div className="cart-lines">
            {shop.items.map((item, index) => {
              const lineIndex = submitted.findIndex((line) => line.index === index);
              const result =
                verified && lineIndex >= 0 ? validation.data.items[lineIndex] : undefined;
              const catalog = item.kind === "catalog";
              const type = catalog
                ? options.data?.productTypes.find((type) => type.id === item.productTypeId)?.name
                : item.type;
              const color = catalog
                ? options.data?.colors.find((color) => color.id === item.colorId)?.name
                : item.color;
              const cut = catalog
                ? options.data?.cuts.find((cut) => cut.id === item.cutId)?.name
                : undefined;
              return (
                <Paper
                  component="section"
                  variant="outlined"
                  className="cart-line"
                  aria-label={item.name}
                  key={`${index}-${catalog ? item.motifId : "custom"}-${item.quantity}`}
                >
                  <h2>{item.name}</h2>
                  {catalog ? (
                    <>
                      <p>
                        {type ??
                          (options.isSuccess
                            ? "Typ není v aktuálním číselníku"
                            : "Typ se nepodařilo načíst")}{" "}
                        ·{" "}
                        {cut ??
                          (options.isSuccess
                            ? "Střih není v aktuálním číselníku"
                            : "Střih se nepodařilo načíst")}{" "}
                        ·{" "}
                        {color ??
                          (options.isSuccess
                            ? "Barva není v aktuálním číselníku"
                            : "Barva se nepodařila načíst")}{" "}
                        · {item.size}
                      </p>
                      <p>Uložená cena: {money(item.unitPrice / 100)} / kus (pouze snapshot).</p>
                      {!lines.find((line) => line.index === index)?.input && (
                        <p role="alert">
                          Tato velikost už není podporovaná. Odeberte položku a vyberte variantu
                          znovu.
                        </p>
                      )}
                      {result?.valid && result.unitPrice !== null ? (
                        <>
                          <p>
                            Aktuální cena: <strong>{money(result.unitPrice / 100)} / kus</strong>
                            {result.lineTotal !== null &&
                              ` · ${money(result.lineTotal / 100)} za položku`}
                          </p>
                          {result.itemLabel && <p>{result.itemLabel}</p>}
                          {result.unitPrice !== item.unitPrice && (
                            <div role="status">
                              <p>
                                Cena se změnila z {money(item.unitPrice / 100)} na{" "}
                                {money(result.unitPrice / 100)} za kus.
                              </p>
                              <Button
                                onClick={() => {
                                  if (result.unitPrice !== null)
                                    shop.acceptPrice(index, result.unitPrice);
                                }}
                              >
                                Přijmout aktuální cenu
                              </Button>
                            </div>
                          )}
                        </>
                      ) : (
                        result && (
                          <div role="alert">
                            <p>Položka není dostupná nebo ji nelze ocenit.</p>
                            {result.errors.map((error, i) => (
                              <p key={i}>{error}</p>
                            ))}
                          </div>
                        )
                      )}
                      {!result && <p>Cena a dostupnost zatím nejsou ověřené.</p>}
                    </>
                  ) : (
                    <>
                      <p>
                        Návrh vlastního potisku · {color} · {item.size}
                      </p>
                      <p>
                        Dosud nenapojený návrh: soubor ani varianty nebyly ověřené backendem. Cena
                        není potvrzená a do ověřeného mezisoučtu se nezapočítává.
                      </p>
                    </>
                  )}
                  <Quantity
                    quantity={item.quantity}
                    onSave={(value) => shop.setQuantity(index, value)}
                  />
                  <Button color="error" onClick={() => shop.remove(index)}>
                    Odebrat položku
                  </Button>
                </Paper>
              );
            })}
          </div>
          <Paper
            component="section"
            aria-label="Souhrn košíku"
            variant="outlined"
            className="cart-line"
          >
            <h2>Souhrn</h2>
            <p>Počet kusů: {shop.count}</p>
            <p>
              Ověřený mezisoučet katalogových položek:{" "}
              <strong>
                {lines.length && subtotal !== null ? money(subtotal / 100) : "není stanoven"}
              </strong>
            </p>
            {hasCustom && (
              <p>
                Vlastní potisk vyžaduje samostatné ověření a nacenění. Jeho odeslání zatím není
                napojené.
              </p>
            )}
            <p>Doprava není zvolená. Celková cena objednávky zatím není stanovena.</p>
            <Button component={Link} to="/tricka">
              Pokračovat ve výběru
            </Button>
          </Paper>
        </>
      )}
    </main>
  );
}
