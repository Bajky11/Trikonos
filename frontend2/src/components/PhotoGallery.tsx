import { useState } from "react";
import { Dialog, DialogContent, IconButton } from "@mui/material";
import Close from "@mui/icons-material/Close";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ArrowForward from "@mui/icons-material/ArrowForward";
import { workPhotos } from "../data/content";

export function PhotoGallery() {
  const [selected, setSelected] = useState<number | null>(null);
  const move = (direction: number) =>
    setSelected((index) => ((index ?? 0) + direction + workPhotos.length) % workPhotos.length);
  return (
    <>
      <div className="section-heading work-heading">
        <div>
          <h2>Naše práce</h2>
          <p className="muted">Každý potisk má svůj příběh.</p>
        </div>
        <button className="plain-button work-view-all" onClick={() => setSelected(0)}>
          Prohlédnout vše <span>→</span>
        </button>
      </div>
      <div
        className={`work-marquee ${selected !== null ? "paused" : ""}`}
        role="region"
        aria-label="Fotografie realizací"
      >
        <div className="work-track">
          {[0, 1].map((group) => (
            <div className="work-group" key={group} aria-hidden={group === 1 ? true : undefined}>
              {workPhotos.map(([file, alt], index) => (
                <button
                  key={file}
                  className="work-photo"
                  tabIndex={group ? -1 : 0}
                  aria-label={`Zvětšit: ${alt}`}
                  onClick={() => setSelected(index)}
                >
                  <img
                    src={`/assets/nase-prace/${file}.webp`}
                    alt={group ? "" : alt}
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <Dialog
        open={selected !== null}
        onClose={() => setSelected(null)}
        fullWidth
        maxWidth="lg"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") move(-1);
          if (event.key === "ArrowRight") move(1);
        }}
        slotProps={{ paper: { className: "gallery-dialog" } }}
      >
        <IconButton
          className="dialog-close"
          aria-label="Zavřít galerii"
          onClick={() => setSelected(null)}
        >
          <Close />
        </IconButton>
        {selected !== null && (
          <DialogContent>
            <div className="gallery-stage">
              <IconButton onClick={() => move(-1)} aria-label="Předchozí fotografie">
                <ArrowBack />
              </IconButton>
              <img src={`/ourwork/${workPhotos[selected]![2]}`} alt={workPhotos[selected]![1]} />
              <IconButton onClick={() => move(1)} aria-label="Další fotografie">
                <ArrowForward />
              </IconButton>
            </div>
            <p className="gallery-caption">
              {selected + 1} / {workPhotos.length} · {workPhotos[selected]![1]}
            </p>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
