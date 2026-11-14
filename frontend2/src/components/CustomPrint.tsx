import { useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Button, Dialog, DialogContent, DialogTitle, IconButton } from "@mui/material";
import Close from "@mui/icons-material/Close";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import AlignHorizontalCenter from "@mui/icons-material/AlignHorizontalCenter";
import { customColors, designs, money, shirtTypes } from "../data/catalog";
import { useShop } from "./ShopContext";
import type { Design } from "./ShopContext";
import { fitDesign, moveDesign, resizeDesign } from "./designGeometry";

const initialHint =
  "Vlastní obrázek: PNG, JPG nebo WebP, max. 15 MB. Zůstává jen ve vašem prohlížeči.";
export function CustomPrint() {
  const { add } = useShop();
  const filterId = useId();
  const [type, setType] = useState("male");
  const [color, setColor] = useState(customColors[0]!);
  const [size, setSize] = useState("M");
  const [quantity, setQuantity] = useState(1);
  const [design, setDesign] = useState<Design | null>(null);
  const [controls, setControls] = useState(true);
  const [snap, setSnap] = useState(true);
  const [gallery, setGallery] = useState(false);
  const [status, setStatus] = useState(initialHint);
  const fileInput = useRef<HTMLInputElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ mode: "move" | "resize"; x: number; y: number; box: Design } | null>(null);
  const loadRequest = useRef(0);
  const point = (event: PointerEvent<SVGElement>) => {
    const matrix = svg.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      : { x: 0, y: 0 };
  };
  const startDrag = (event: PointerEvent<SVGRectElement>, mode: "move" | "resize") => {
    if (!design) return;
    event.preventDefault();
    const p = point(event);
    drag.current = { mode, x: p.x, y: p.y, box: design };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<SVGRectElement>) => {
    if (!drag.current) return;
    const p = point(event),
      start = drag.current;
    setDesign({
      ...start.box,
      ...(start.mode === "move"
        ? moveDesign(start.box, p.x - start.x, p.y - start.y, snap)
        : resizeDesign(start.box, p.x - start.x)),
    });
  };
  const keyMove = (event: KeyboardEvent<SVGRectElement>, mode: "move" | "resize") => {
    if (!design || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 20 : 5;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    setDesign({
      ...design,
      ...(mode === "move" ? moveDesign(design, dx, dy, snap) : resizeDesign(design, dx || dy)),
    });
  };
  const selectDesign = (src: string, name: string) => {
    const request = ++loadRequest.current;
    const image = new Image();
    image.onload = () => {
      if (request !== loadRequest.current) return;
      setDesign({ src, name, ...fitDesign(image.naturalWidth, image.naturalHeight) });
      setStatus("Potisk posuňte tažením. Velikost změňte úchytem v rohu.");
    };
    image.onerror = () => {
      if (request === loadRequest.current)
        setStatus("Obrázek se nepodařilo načíst. Zkuste jiný soubor.");
    };
    image.src = src;
  };
  return (
    <section id="vlastni-potisk" className="custom-section">
      <div className="shell">
        <div className="custom-heading">
          <span className="section-label">02 / Na zakázku</span>
          <h2>Vlastní potisk</h2>
        </div>
        <div className="custom-body">
          <div
            className={`shirt-preview ${controls ? "" : "controls-hidden"}`}
            role="group"
            aria-label={`Náhled trička – ${color.name}`}
          >
            <div className="preview-toolbar">
              <Button
                variant={controls ? "contained" : "outlined"}
                startIcon={<VisibilityOutlined />}
                aria-pressed={controls}
                onClick={() => setControls((value) => !value)}
              >
                {controls ? "Skrýt" : "Zobrazit"} ovládací prvky
              </Button>
              {controls && (
                <Button
                  variant={snap ? "contained" : "outlined"}
                  startIcon={<AlignHorizontalCenter />}
                  aria-pressed={snap}
                  onClick={() => setSnap((value) => !value)}
                >
                  {snap ? "Vypnout" : "Zapnout"} centrování
                </Button>
              )}
            </div>
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
                  <feFlood floodColor={color.hex} result="color" />
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
              {controls && (
                <>
                  <rect className="print-area" x="330" y="330" width="470" height="650" />
                  {snap && <line className="print-center" x1="565" y1="300" x2="565" y2="1010" />}
                </>
              )}
              {design && (
                <g>
                  <image
                    href={design.src}
                    x={design.x}
                    y={design.y}
                    width={design.width}
                    height={design.height}
                    preserveAspectRatio="xMidYMid meet"
                  />
                  {controls && (
                    <>
                      <rect
                        className="design-move"
                        x={design.x}
                        y={design.y}
                        width={design.width}
                        height={design.height}
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
                        x={design.x + design.width - 22}
                        y={design.y + design.height - 22}
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
              {controls && (
                <text className="design-hint" x="565" y="1025" textAnchor="middle">
                  <tspan x="565">Tisková oblast</tspan>
                  <tspan x="565" dy="34">
                    Potisk posuňte tažením.
                  </tspan>
                  <tspan x="565" dy="34">
                    Velikost změňte úchytem v rohu.
                  </tspan>
                </text>
              )}
            </svg>
          </div>
          <div className="custom-panel">
            <div className="custom-controls">
              <fieldset className="choice-field garment-field">
                <legend>01 / Typ trička</legend>
                <div>
                  {shirtTypes.map((option) => (
                    <label key={option.id}>
                      <input
                        type="radio"
                        name="customType"
                        checked={type === option.id}
                        onChange={() => {
                          setType(option.id);
                          setSize(option.sizes.includes("M") ? "M" : option.sizes[0]!);
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="custom-panel-section">
                <div className="custom-control-heading">
                  <h3>02 / Barva trička</h3>
                  <span>{color.name}</span>
                </div>
                <div className="custom-swatches" role="group" aria-label="Barvy trička">
                  {customColors.map((option) => (
                    <button
                      key={option.name}
                      type="button"
                      className="color-swatch"
                      style={{ background: option.hex }}
                      aria-label={option.name}
                      aria-pressed={color.name === option.name}
                      onClick={() => setColor(option)}
                    />
                  ))}
                </div>
              </div>
              <div className="custom-panel-section">
                <h3>03 / Váš potisk</h3>
                <div className="custom-design-actions">
                  <Button variant="outlined" onClick={() => setGallery(true)}>
                    Naše potisky
                  </Button>
                  <Button variant="outlined" onClick={() => fileInput.current?.click()}>
                    Vlastní potisk
                  </Button>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  aria-label="Nahrát vlastní potisk"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    if (
                      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
                      file.size > 15 * 1024 * 1024
                    ) {
                      setStatus("Vyberte PNG, JPG nebo WebP do 15 MB.");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string") selectDesign(reader.result, file.name);
                    };
                    reader.onerror = () => setStatus("Soubor se nepodařilo přečíst.");
                    reader.readAsDataURL(file);
                  }}
                />
                {design && (
                  <>
                    <div className="design-dimensions">
                      <span>
                        Vybraný potisk: <b>{design.name}</b>
                      </span>
                      <span>Rozměry potisku · šířka × výška</span>
                      <strong>
                        {((design.width * 30) / 470).toFixed(1)} ×{" "}
                        {((design.height * 30) / 470).toFixed(1)} cm
                      </strong>
                    </div>
                    <Button
                      className="remove-design"
                      variant="contained"
                      color="error"
                      onClick={() => {
                        ++loadRequest.current;
                        setDesign(null);
                        setStatus(initialHint);
                      }}
                    >
                      Odebrat potisk
                    </Button>
                  </>
                )}
                <p className="design-status" role="status">
                  {status}
                </p>
              </div>
            </div>
            <form
              className="custom-order-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!design) {
                  setStatus("Nejprve vyberte nebo nahrajte potisk.");
                  return;
                }
                add({
                  id: "custom-print",
                  name: "Vlastní potisk",
                  quantity,
                  size,
                  color: color.name,
                  type,
                  price: 456,
                  design,
                });
              }}
            >
              <label>
                Velikost
                <select value={size} onChange={(event) => setSize(event.target.value)} required>
                  {shirtTypes
                    .find((option) => option.id === type)!
                    .sizes.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                </select>
              </label>
              <label>
                Počet kusů
                <div className="quantity-stepper">
                  <button
                    type="button"
                    aria-label="Odebrat jeden kus"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  >
                    −
                  </button>
                  <input
                    aria-label="Počet kusů vlastního potisku"
                    type="number"
                    min="1"
                    max="99"
                    required
                    value={quantity}
                    onChange={(event) => setQuantity(Number(event.target.value))}
                  />
                  <button
                    type="button"
                    aria-label="Přidat jeden kus"
                    onClick={() => setQuantity((value) => Math.min(99, value + 1))}
                  >
                    +
                  </button>
                </div>
              </label>
              <Button className="custom-add" type="submit" variant="contained">
                <span>Do košíku za</span>
                <strong>{money(456 * quantity)}</strong>
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
                  aria-label={item.name}
                  aria-pressed={design?.src === item.src}
                  onClick={() => {
                    selectDesign(item.src, item.name);
                    setGallery(false);
                  }}
                >
                  <img src={item.src} alt={item.name} />
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
