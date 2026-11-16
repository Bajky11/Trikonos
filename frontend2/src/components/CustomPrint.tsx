import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Dialog, DialogContent, DialogTitle, IconButton } from "@mui/material";
import Close from "@mui/icons-material/Close";
import { uploadsDesignsCreate, useCatalogOptionsRetrieve } from "../api/generated/api";
import type { CatalogOptionsResponse } from "../api/generated/models";
import { ApiError, apiBaseUrl } from "../api/http";
import { withCsrf } from "../auth/csrf";
import { designs } from "../data/catalog";
import type { CustomCartItem } from "../cart/storage";
import { useShop } from "./ShopContext";
import { CatalogFeedback } from "./Products";
import { fitDesign, moveDesign, placementInMm, previewArea, resizeDesign } from "./designGeometry";
import type { DesignBox } from "./designGeometry";

const initialHint =
  "PNG nebo JPG do 20 MB. Podklad se nahraje na server, odkaz platí 7 dní. Cena bude k nacenění.";
type Asset = CustomCartItem["upload"];

function CustomEditor({ options }: { options: CatalogOptionsResponse }) {
  const { add } = useShop();
  const types = options.productTypes.filter((type) =>
    type.printAreas.some((area) => area.widthMm > 0 && area.heightMm > 0),
  );
  const [typeId, setTypeId] = useState("");
  const [cutId, setCutId] = useState("");
  const [colorId, setColorId] = useState("");
  const [sizeValue, setSizeValue] = useState("");
  const [areaId, setAreaId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [position, setPosition] = useState<{ areaKey: string; box: DesignBox } | null>(null);
  const [controls, setControls] = useState(true);
  const [snap, setSnap] = useState(true);
  const [gallery, setGallery] = useState(false);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(initialHint);
  const filterId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const drag = useRef<{ mode: "move" | "resize"; x: number; y: number; box: DesignBox } | null>(
    null,
  );
  const type = types.find((type) => type.id === typeId) ?? types[0];
  const cut = options.cuts.find((cut) => cut.id === cutId) ?? options.cuts[0];
  const color = options.colors.find((color) => color.id === colorId) ?? options.colors[0];
  const size =
    options.sizes.find((size) => size.value === sizeValue)?.value ?? options.sizes[0]?.value;
  const areas = type?.printAreas.filter((area) => area.widthMm > 0 && area.heightMm > 0) ?? [];
  const area = areas.find((area) => area.id === areaId) ?? areas[0];
  const bounds = previewArea(area?.widthMm ?? 300, area?.heightMm ?? 400);
  const areaKey = `${type?.id}:${area?.id}:${area?.widthMm}:${area?.heightMm}`;
  const box = asset
    ? position?.areaKey === areaKey
      ? position.box
      : fitDesign(asset.widthPx, asset.heightPx, bounds)
    : null;
  const mm = box && area ? placementInMm(box, bounds, area.widthMm, area.heightMm) : null;
  const ready = !!(type && cut && color && size && area);
  const upload = useMutation({
    gcTime: 0,
    mutationFn: ({ file, signal }: { file: File; signal: AbortSignal }) =>
      withCsrf(() => uploadsDesignsCreate({ file }, { signal })),
  });
  const busy = upload.isPending || loadingGallery;
  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
    },
    [],
  );
  const selectFile = async (file: File) => {
    setError("");
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      !file.size ||
      file.size > 20 * 1024 * 1024
    ) {
      setError("Vyberte PNG nebo JPG do 20 MB.");
      return;
    }
    const request = ++sequence.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setStatus("Nahrávání podkladu…");
    try {
      const result = await upload.mutateAsync({ file, signal: abort.signal });
      if (request !== sequence.current) return;
      if (
        !result.widthPx ||
        !result.heightPx ||
        !["image/png", "image/jpeg"].includes(result.mimeType)
      )
        throw new Error("Invalid upload response");
      setAsset({
        fileToken: result.fileToken,
        url: result.url,
        fileName: file.name,
        mimeType: result.mimeType,
        widthPx: result.widthPx,
        heightPx: result.heightPx,
        uploadedAt: Date.now(),
      });
      setPosition(null);
      setStatus(
        "Podklad je nahraný. Umístěte jej do zvolené tiskové plochy; po změně plochy se umístění nastaví znovu.",
      );
    } catch (error) {
      if (request !== sequence.current || abort.signal.aborted) return;
      setError(
        error instanceof ApiError && error.status === 413
          ? "Podklad je příliš velký. Vyberte soubor do 20 MB."
          : error instanceof ApiError && error.status === 429
            ? "Příliš mnoho požadavků. Chvíli počkejte a nahrajte soubor znovu."
            : error instanceof ApiError
              ? error.message
              : "Podklad se nepodařilo nahrát. Zkuste to znovu.",
      );
      setStatus(initialHint);
    } finally {
      if (request === sequence.current) upload.reset();
    }
  };
  const point = (event: PointerEvent<SVGElement>) => {
    const matrix = svg.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      : { x: 0, y: 0 };
  };
  const startDrag = (event: PointerEvent<SVGRectElement>, mode: "move" | "resize") => {
    if (!box) return;
    event.preventDefault();
    const p = point(event);
    drag.current = { mode, x: p.x, y: p.y, box };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<SVGRectElement>) => {
    const start = drag.current;
    if (!start) return;
    const p = point(event);
    setPosition({
      areaKey,
      box:
        start.mode === "move"
          ? moveDesign(start.box, p.x - start.x, p.y - start.y, snap, bounds)
          : resizeDesign(start.box, p.x - start.x, bounds),
    });
  };
  const keyMove = (event: KeyboardEvent<SVGRectElement>, mode: "move" | "resize") => {
    if (!box || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 20 : 5;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    setPosition({
      areaKey,
      box:
        mode === "move"
          ? moveDesign(box, dx, dy, snap, bounds)
          : resizeDesign(box, dx || dy, bounds),
    });
  };
  return (
    <>
      {!ready && (
        <p role="status">
          Vlastní potisk zatím není dostupný. Chybí aktivní typ oblečení s tiskovou plochou, střih,
          barva nebo velikost.
        </p>
      )}
      <div className="custom-body">
        <div
          className={`shirt-preview ${controls ? "" : "controls-hidden"}`}
          role="group"
          aria-label={`Schematický náhled tiskové plochy – ${color?.name ?? "bez barvy"}`}
        >
          <div className="preview-toolbar">
            <Button
              variant={controls ? "contained" : "outlined"}
              aria-pressed={controls}
              onClick={() => setControls((value) => !value)}
            >
              {controls ? "Skrýt" : "Zobrazit"} ovládací prvky
            </Button>
            {controls && (
              <Button
                variant={snap ? "contained" : "outlined"}
                aria-pressed={snap}
                onClick={() => setSnap((value) => !value)}
              >
                {snap ? "Vypnout" : "Zapnout"} centrování
              </Button>
            )}
          </div>
          <p>
            Náhled oděvu je pouze ilustrační. Přesné umístění se vztahuje ke zvolené tiskové ploše.
          </p>
          <svg
            ref={svg}
            className="shirt-art"
            viewBox="0 0 1131 1390"
            aria-label="Editor umístění potisku"
          >
            <defs>
              <filter
                id={filterId}
                x="0"
                y="0"
                width="100%"
                height="100%"
                colorInterpolationFilters="sRGB"
              >
                <feFlood floodColor={color?.hexValue ?? "#ffffff"} result="color" />
                <feBlend in="SourceGraphic" in2="color" mode="multiply" result="tinted" />
                <feComposite in="tinted" in2="SourceAlpha" operator="in" />
              </filter>
            </defs>
            <image
              href="/assets/tshirt.png"
              width="1131"
              height="1390"
              filter={`url(#${filterId})`}
            />
            {controls && area && (
              <>
                <rect className="print-area" {...bounds} />
                {snap && (
                  <line
                    className="print-center"
                    x1={bounds.x + bounds.width / 2}
                    x2={bounds.x + bounds.width / 2}
                    y1={bounds.y}
                    y2={bounds.y + bounds.height}
                  />
                )}
              </>
            )}
            {asset && box && (
              <g>
                <image
                  href={new URL(asset.url, `${apiBaseUrl}/`).href}
                  {...box}
                  preserveAspectRatio="xMidYMid meet"
                />
                {controls && (
                  <>
                    <rect
                      className="design-move"
                      {...box}
                      tabIndex={0}
                      role="button"
                      aria-label="Posunout potisk. Táhněte nebo použijte šipky."
                      onPointerDown={(event) => startDrag(event, "move")}
                      onPointerMove={moveDrag}
                      onPointerUp={() => {
                        drag.current = null;
                      }}
                      onPointerCancel={() => {
                        drag.current = null;
                      }}
                      onKeyDown={(event) => keyMove(event, "move")}
                    />
                    <rect
                      className="design-resize"
                      x={box.x + box.width - 22}
                      y={box.y + box.height - 22}
                      width="44"
                      height="44"
                      tabIndex={0}
                      role="button"
                      aria-label="Změnit velikost potisku. Táhněte nebo použijte šipky."
                      onPointerDown={(event) => startDrag(event, "resize")}
                      onPointerMove={moveDrag}
                      onPointerUp={() => {
                        drag.current = null;
                      }}
                      onPointerCancel={() => {
                        drag.current = null;
                      }}
                      onKeyDown={(event) => keyMove(event, "resize")}
                    />
                  </>
                )}
              </g>
            )}
          </svg>
        </div>
        <div className="custom-panel">
          <form
            className="dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!ready || !asset || !mm || busy) {
                setError("Nejprve vyberte variantu, tiskovou plochu a nahrajte podklad.");
                return;
              }
              if (Date.now() - asset.uploadedAt >= 7 * 86400000) {
                setError("Platnost podkladu vypršela. Nahrajte jej znovu.");
                return;
              }
              add({
                kind: "custom",
                name: `Vlastní potisk – ${asset.fileName}`,
                productTypeId: type.id,
                cutId: cut.id,
                colorId: color.id,
                size,
                quantity,
                upload: asset,
                placement: { printAreaId: area.id, ...mm },
                areaWidthMm: area.widthMm,
                areaHeightMm: area.heightMm,
              });
            }}
          >
            <label>
              Typ oblečení
              <select
                value={type?.id ?? ""}
                aria-label="Typ oblečení"
                onChange={(event) => {
                  drag.current = null;
                  setTypeId(event.target.value);
                  setAreaId("");
                }}
                required
                disabled={!types.length}
              >
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Střih
              <select
                value={cut?.id ?? ""}
                aria-label="Střih"
                onChange={(event) => setCutId(event.target.value)}
                required
                disabled={!options.cuts.length}
              >
                {options.cuts.map((cut) => (
                  <option key={cut.id} value={cut.id}>
                    {cut.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Barva
              <select
                value={color?.id ?? ""}
                aria-label="Barva"
                onChange={(event) => setColorId(event.target.value)}
                required
                disabled={!options.colors.length}
              >
                {options.colors.map((color) => (
                  <option key={color.id} value={color.id}>
                    {color.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tisková plocha
              <select
                value={area?.id ?? ""}
                aria-label="Tisková plocha"
                onChange={(event) => {
                  drag.current = null;
                  setAreaId(event.target.value);
                }}
                required
                disabled={!areas.length}
              >
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name} ({area.widthMm} × {area.heightMm} mm)
                  </option>
                ))}
              </select>
            </label>
            <div className="custom-design-actions">
              <Button onClick={() => setGallery(true)} disabled={!ready || busy}>
                Naše potisky
              </Button>
              <Button onClick={() => fileInput.current?.click()} disabled={!ready || busy}>
                Vlastní potisk
              </Button>
            </div>
            <input
              ref={fileInput}
              type="file"
              aria-label="Nahrát vlastní potisk"
              accept="image/png,image/jpeg"
              hidden
              disabled={!ready || busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void selectFile(file);
              }}
            />
            {asset && mm && (
              <>
                <div className="design-dimensions">
                  <span>
                    Vybraný potisk: <b>{asset.fileName}</b>
                  </span>
                  <strong>
                    {mm.width} × {mm.height} mm
                  </strong>
                  <span>
                    Pozice: {mm.x} × {mm.y} mm od levého horního rohu plochy.
                  </span>
                </div>
                <Button
                  color="error"
                  onClick={() => {
                    sequence.current++;
                    controller.current?.abort();
                    upload.reset();
                    setLoadingGallery(false);
                    setAsset(null);
                    setPosition(null);
                    setError("");
                    setStatus(initialHint);
                  }}
                >
                  Odebrat potisk
                </Button>
              </>
            )}
            <p role="status">{status}</p>
            {error && <p role="alert">{error}</p>}
            <label>
              Velikost
              <select
                value={size ?? ""}
                aria-label="Velikost"
                onChange={(event) => setSizeValue(event.target.value)}
                required
                disabled={!options.sizes.length}
              >
                {options.sizes.map((size) => (
                  <option key={size.value} value={size.value}>
                    {size.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Počet kusů
              <input
                aria-label="Počet kusů vlastního potisku"
                type="number"
                min="1"
                max="99"
                required
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
              />
            </label>
            <p>
              Cena vlastního potisku bude k nacenění. U smíšeného košíku se potvrdí konečná cena
              celé objednávky.
            </p>
            <Button
              className="custom-add"
              type="submit"
              variant="contained"
              disabled={!ready || !asset || busy}
            >
              Přidat návrh do košíku k nacenění
            </Button>
          </form>
        </div>
      </div>
      <Dialog open={gallery} onClose={() => setGallery(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Vyberte potisk
          <IconButton
            className="dialog-close"
            aria-label="Zavřít galerii potisků"
            onClick={() => setGallery(false)}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <div className="design-grid">
            {designs.map((item) => (
              <button
                key={item.src}
                disabled={busy}
                aria-label={item.name}
                onClick={() => {
                  setGallery(false);
                  setError("");
                  const request = ++sequence.current;
                  controller.current?.abort();
                  const abort = new AbortController();
                  controller.current = abort;
                  setLoadingGallery(true);
                  void fetch(item.src, { signal: abort.signal })
                    .then(async (response) => {
                      if (!response.ok) throw new Error("Image fetch failed");
                      return new File([await response.blob()], `${item.name}.png`, {
                        type: "image/png",
                      });
                    })
                    .then(async (file) => {
                      if (request === sequence.current) {
                        setLoadingGallery(false);
                        await selectFile(file);
                      }
                    })
                    .catch(() => {
                      if (request === sequence.current && !abort.signal.aborted) {
                        setLoadingGallery(false);
                        setError("Potisk se nepodařilo načíst. Zkuste jiný nebo nahrajte vlastní.");
                      }
                    });
                }}
              >
                <img src={item.src} alt={item.name} />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CustomPrint() {
  const options = useCatalogOptionsRetrieve();
  return (
    <section id="vlastni-potisk" className="custom-section">
      <div className="shell">
        <div className="custom-heading">
          <span className="section-label">02 / Na zakázku</span>
          <h2>Vlastní potisk</h2>
        </div>
        <CatalogFeedback query={options} label="Možnosti vlastního potisku" />
        {options.data && <CustomEditor options={options.data} />}
      </div>
    </section>
  );
}
