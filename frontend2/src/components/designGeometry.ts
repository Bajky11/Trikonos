export interface DesignBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const printArea = { x: 330, y: 330, width: 470, height: 650 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
export function fitDesign(width: number, height: number, area = printArea): DesignBox {
  const scale = Math.min((area.width * 340) / 470 / width, (area.height * 470) / 650 / height);
  const box = { width: width * scale, height: height * scale };
  return {
    ...box,
    x: area.x + area.width / 2 - box.width / 2,
    y: area.y + (area.height * 70) / 650,
  };
}
export function moveDesign(
  box: DesignBox,
  dx: number,
  dy: number,
  snap = true,
  area = printArea,
): DesignBox {
  const center = area.x + area.width / 2;
  let x = clamp(box.x + dx, area.x, area.x + area.width - box.width);
  if (snap && Math.abs(x + box.width / 2 - center) < 14) x = center - box.width / 2;
  return {
    ...box,
    x,
    y: clamp(box.y + dy, area.y, area.y + area.height - box.height),
  };
}
export function resizeDesign(box: DesignBox, delta: number, area = printArea): DesignBox {
  const ratio = box.height / box.width;
  const maximum = Math.min(area.x + area.width - box.x, (area.y + area.height - box.y) / ratio);
  const width = clamp(box.width + delta, Math.min((area.width * 70) / 470, maximum), maximum);
  return { ...box, width, height: width * ratio };
}

export function previewScale(areas: { widthMm: number; heightMm: number }[]): number {
  // Start with a standard full-front print. Larger areas reduce the scale for all previews.
  return areas.reduce(
    (scale, area) =>
      Math.min(scale, printArea.width / area.widthMm, printArea.height / area.heightMm),
    Math.min(printArea.width / 300, printArea.height / 400),
  );
}

export function previewArea(widthMm: number, heightMm: number, scale: number): DesignBox {
  const width = widthMm * scale,
    height = heightMm * scale;
  return {
    x: printArea.x + (printArea.width - width) / 2,
    y: printArea.y + (printArea.height - height) / 2,
    width,
    height,
  };
}

export function placementInMm(box: DesignBox, area: DesignBox, widthMm: number, heightMm: number) {
  const x = clamp(Math.round(((box.x - area.x) / area.width) * widthMm), 0, widthMm - 1);
  const y = clamp(Math.round(((box.y - area.y) / area.height) * heightMm), 0, heightMm - 1);
  return {
    x,
    y,
    width: clamp(Math.round((box.width / area.width) * widthMm), 1, widthMm - x),
    height: clamp(Math.round((box.height / area.height) * heightMm), 1, heightMm - y),
    rotationDeg: 0,
  };
}
