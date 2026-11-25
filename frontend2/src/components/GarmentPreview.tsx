import { useId } from "react";
import { apiBaseUrl } from "../api/http";
import { printArea } from "./designGeometry";

export const garmentViewBox = "0 0 1131 1390";
const mediaUrl = (src: string) => new URL(src, `${apiBaseUrl}/`).href;

export function GarmentLayer({ color, background }: { color?: string; background?: string }) {
  const id = useId();
  return (
    <>
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feFlood floodColor={color ?? "#ffffff"} result="color" />
          <feBlend in="SourceGraphic" in2="color" mode="multiply" result="tinted" />
          <feComposite in="tinted" in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
      <image
        href={background ? mediaUrl(background) : "/assets/tshirt.png"}
        width="1131"
        height="1390"
        filter={`url(#${id})`}
      />
    </>
  );
}

export function GarmentPreview({
  design,
  color,
  background,
  label,
}: {
  design?: string;
  color?: string;
  background?: string;
  label: string;
}) {
  return (
    <svg className="catalog-garment-preview" viewBox={garmentViewBox} role="img" aria-label={label}>
      <GarmentLayer color={color} background={background} />
      {design && (
        <image
          href={mediaUrl(design)}
          x={printArea.x + printArea.width * 0.1}
          y={printArea.y + printArea.height * 0.1}
          width={printArea.width * 0.8}
          height={printArea.height * 0.8}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
    </svg>
  );
}
