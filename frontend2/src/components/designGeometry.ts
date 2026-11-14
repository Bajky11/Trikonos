export interface DesignBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const printArea = { x: 330, y: 330, width: 470, height: 650 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));
export function fitDesign(width: number, height: number): DesignBox {
  const scale = Math.min(340 / width, 470 / height);
  const box = { width: width * scale, height: height * scale };
  return { ...box, x: 565 - box.width / 2, y: 400 };
}
export function moveDesign(box: DesignBox, dx: number, dy: number, snap = true): DesignBox {
  let x = clamp(box.x + dx, printArea.x, printArea.x + printArea.width - box.width);
  if (snap && Math.abs(x + box.width / 2 - 565) < 14) x = 565 - box.width / 2;
  return {
    ...box,
    x,
    y: clamp(box.y + dy, printArea.y, printArea.y + printArea.height - box.height),
  };
}
export function resizeDesign(box: DesignBox, delta: number): DesignBox {
  const ratio = box.height / box.width;
  const maximum = Math.min(800 - box.x, (980 - box.y) / ratio);
  const width = clamp(box.width + delta, Math.min(70, maximum), maximum);
  return { ...box, width, height: width * ratio };
}
