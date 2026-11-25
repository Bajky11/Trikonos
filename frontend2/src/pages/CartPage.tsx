import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, ButtonGroup, Paper, Typography } from "@mui/material";
import Add from "@mui/icons-material/Add";
import Remove from "@mui/icons-material/Remove";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";
import CheckroomRounded from "@mui/icons-material/CheckroomRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import { cartValidateCreate, useCatalogOptionsRetrieve } from "../api/generated/api";
import { withCsrf } from "../auth/csrf";
import { validationLines, cartError } from "../cart/validation";
import { useShop } from "../components/ShopContext";
import { CatalogFeedback, ProductArt } from "../components/Products";
import { PurchaseSteps } from "../checkout/PurchaseSteps";
import { money } from "../data/catalog";
import { useTitle } from "../useTitle";

function Quantity({
  quantity,
  onSave,
  disabled,
}: {
  quantity: number;
  onSave: (value: number) => boolean;
  disabled: boolean;
}) {
  return (
    <ButtonGroup variant="outlined" className="cart-stepper" aria-label="Počet kusů">
      <Button
        aria-label="Snížit počet kusů"
        disabled={disabled || quantity <= 1}
        onClick={() => onSave(quantity - 1)}
      >
        <Remove fontSize="small" />
      </Button>
      <Typography component="output" aria-label="Počet kusů" className="cart-stepper-value">
        {quantity}
      </Typography>
      <Button
        aria-label="Zvýšit počet kusů"
        disabled={disabled || quantity >= 99}
        onClick={() => onSave(quantity + 1)}
      >
        <Add fontSize="small" />
      </Button>
    </ButtonGroup>
  );
}

export function CartPage() {
  useTitle("Košík — Trikonoš");
  const shop = useShop();
  const options = useCatalogOptionsRetrieve();
  const lines = validationLines(shop.items);
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
  const canContinue =
    verified &&
    inputs.length === shop.items.length &&
    validation.data.items.every((item) => item.valid);
  const hasCustom = shop.items.some((item) => item.kind !== "catalog");
  const catalogResults = lines
    .filter((line) => line.item.kind === "catalog")
    .map((line) =>
      verified
        ? validation.data.items[
            submitted.findIndex((submittedLine) => submittedLine.index === line.index)
          ]
        : undefined,
    );
  const subtotal =
    catalogResults.length > 0 &&
    catalogResults.every((result) => result?.valid && result.lineTotal !== null)
      ? catalogResults.reduce((sum, result) => sum + (result?.lineTotal ?? 0), 0)
      : null;
  return (
    <main className="shell page-main purchase-page cart-page">
      <PurchaseSteps current={1} />
      <header className="purchase-heading">
        <Typography variant="h1">Košík</Typography>
        {!!shop.items.length && (
          <p>Zkontrolujte svůj výběr. Dopravu a platbu zvolíte v dalším kroku.</p>
        )}
      </header>
      {shop.items.length > 0 && <CatalogFeedback query={options} label="Popisky variant" />}
      {!shop.items.length ? (
        <Paper variant="outlined" className="purchase-empty">
          <ShoppingBagOutlined aria-hidden="true" />
          <h2 role="status">Košík je prázdný.</h2>
          <p>Vyberte si motiv nebo si vytvořte vlastní potisk.</p>
          <Button component={Link} to="/tricka" variant="contained">
            Prohlédnout motivy
          </Button>
          <Button component={Link} to="/#vlastni-potisk">
            Vytvořit vlastní potisk
          </Button>
        </Paper>
      ) : (
        <div className="purchase-layout">
          <div className="cart-list-panel">
            {shop.locked && (
              <Alert severity="info" role="status">
                Nejdřív dokončete původní odeslání. Položky zatím nelze měnit.
              </Alert>
            )}
            {inputs.length > 0 && !canContinue && (
              <div className="cart-verification">
                {validation.isFetching && (
                  <p role="status">Ověřování dostupnosti a aktuálních cen…</p>
                )}
                {validation.fetchStatus === "paused" && (
                  <p role="status">Ověření čeká na připojení k internetu.</p>
                )}
                {validation.isError && <p role="alert">{cartError(validation.error)}</p>}
                {!validation.isFetching && validation.fetchStatus !== "paused" && (
                  <Button onClick={() => void validation.refetch()}>
                    {shop.items.some((item) => item.kind === "custom")
                      ? "Znovu ověřit košík"
                      : "Znovu ověřit katalogové položky"}
                  </Button>
                )}
              </div>
            )}
            <div className="cart-lines">
              {shop.items.map((item, index) => {
                const lineIndex = submitted.findIndex((line) => line.index === index);
                const result =
                  verified && lineIndex >= 0 ? validation.data.items[lineIndex] : undefined;
                const catalog = item.kind === "catalog";
                const known = item.kind === "catalog" || item.kind === "custom";
                const type = known
                  ? options.data?.productTypes.find((type) => type.id === item.productTypeId)?.name
                  : item.type;
                const color = known
                  ? options.data?.colors.find((color) => color.id === item.colorId)?.name
                  : item.color;
                const cut = known
                  ? options.data?.cuts.find((cut) => cut.id === item.cutId)?.name
                  : undefined;
                return (
                  <Paper
                    component="section"
                    variant="outlined"
                    className="cart-line purchase-item"
                    aria-label={item.name}
                    key={`${index}-${catalog ? item.motifId : "custom"}`}
                  >
                    <div className="purchase-item-art">
                      {item.kind === "custom" ? (
                        <ProductArt
                          src={item.upload.url}
                          name={item.upload.fileName}
                          className="cart-design"
                        />
                      ) : catalog &&
                        typeof item.previewUrl === "string" &&
                        /^(https?:\/\/|\/(?!\/))/i.test(item.previewUrl) ? (
                        <ProductArt src={item.previewUrl} className="cart-design" />
                      ) : (
                        <CheckroomRounded aria-hidden="true" />
                      )}
                    </div>
                    <div className="purchase-item-content">
                      <span className="section-label">
                        {catalog ? "Katalogový motiv" : "Vlastní potisk"}
                      </span>
                      <div className="cart-line-title">
                        <h2>{item.name}</h2>
                        {catalog && result?.valid && result.lineTotal !== null && (
                          <strong>{money(result.lineTotal / 100)}</strong>
                        )}
                      </div>
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
                          {!lines.find((line) => line.index === index)?.input && (
                            <p role="alert">
                              Tato velikost už není podporovaná. Odeberte položku a vyberte variantu
                              znovu.
                            </p>
                          )}
                          {result?.valid && result.unitPrice !== null ? (
                            <>
                              <p>{money(result.unitPrice / 100)} za kus</p>
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
                                    disabled={shop.locked}
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
                          {!result && (
                            <p>Uložená cena: {money(item.unitPrice / 100)} / kus (neověřená).</p>
                          )}
                        </>
                      ) : item.kind === "custom" ? (
                        <>
                          <p>
                            {type ?? "Typ není v aktuální nabídce"} ·{" "}
                            {cut ?? "Střih není v aktuální nabídce"} ·{" "}
                            {color ?? "Barva není v aktuální nabídce"} · {item.size}
                          </p>
                          <details className="print-details">
                            <summary>Parametry potisku</summary>
                            <p>
                              Umístění: {item.placement.width} × {item.placement.height} mm, pozice{" "}
                              {item.placement.x} × {item.placement.y} mm.
                            </p>
                          </details>
                          {lines.find((line) => line.index === index)?.localError && (
                            <p role="alert">
                              {lines.find((line) => line.index === index)?.localError}
                            </p>
                          )}
                          {result?.valid && <p role="status">Podklad a varianta byly ověřené.</p>}
                          {result && !result.valid && (
                            <div role="alert">
                              {result.errors.map((error, i) => (
                                <p key={i}>{error}</p>
                              ))}
                            </div>
                          )}
                          {!result && <p>Podklad a varianta zatím nejsou ověřené.</p>}
                          {(validation.isError ||
                            (result && !result.valid) ||
                            lines[index]?.localError) && (
                            <Button component={Link} to="/#vlastni-potisk">
                              Nahrát podklad znovu v editoru
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          <p>
                            Návrh vlastního potisku · {color} · {item.size}
                          </p>
                          <p>
                            Cena není potvrzená. Pro objednání vytvořte návrh znovu v editoru a tuto
                            položku odeberte.
                          </p>
                          <Button component={Link} to="/#vlastni-potisk">
                            Otevřít editor
                          </Button>
                        </>
                      )}
                      <div className="purchase-item-actions">
                        <Quantity
                          quantity={item.quantity}
                          onSave={(value) => shop.setQuantity(index, value)}
                          disabled={shop.locked}
                        />
                        <Button
                          color="inherit"
                          startIcon={<DeleteOutlineRounded />}
                          disabled={shop.locked}
                          onClick={() => shop.remove(index)}
                        >
                          Odebrat položku
                        </Button>
                      </div>
                    </div>
                  </Paper>
                );
              })}
            </div>
          </div>
          <Paper
            component="section"
            aria-label="Souhrn košíku"
            variant="outlined"
            className="cart-line purchase-summary"
          >
            <h2>Souhrn košíku</h2>
            <p className="purchase-summary-row">
              <span>Počet kusů</span>
              <strong>{shop.count}</strong>
            </p>
            <p className="purchase-summary-row">
              <span>Doprava</span>
              <span>V dalším kroku</span>
            </p>
            <p className="purchase-summary-row purchase-total">
              <span>{hasCustom ? "Katalogové položky" : "Cena zboží"}</span>
              <strong>
                {lines.length && subtotal !== null ? money(subtotal / 100) : "není stanoven"}
              </strong>
            </p>
            {hasCustom && (
              <p>
                Celková cena objednávky zatím není stanovena. Vlastní potisk vám naceníme
                individuálně.
              </p>
            )}
            {verified &&
              validation.data.requiresQuote &&
              inputs.length === lines.length &&
              validation.data.items.every((item) => item.valid) &&
              !shop.items.some((item) => item.kind === undefined) && (
                <p role="status">Košík je ověřený a bude vyžadovat nacenění.</p>
              )}
            {!canContinue && !shop.locked && (
              <p className="muted">
                Pokračovat můžete, až budou všechny položky ověřené a dostupné.
              </p>
            )}
            <Button
              component={Link}
              to="/pokladna"
              variant="contained"
              endIcon={<ArrowForwardRounded />}
              disabled={!shop.locked && !canContinue}
            >
              {shop.locked ? "Dokončit původní odeslání" : "Pokračovat k objednání"}
            </Button>
            <Button component={Link} to="/tricka">
              Pokračovat ve výběru
            </Button>
          </Paper>
        </div>
      )}
    </main>
  );
}
