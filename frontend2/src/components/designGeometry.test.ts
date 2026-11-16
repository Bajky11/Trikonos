import { describe, expect, it } from "vite-plus/test";
import { fitDesign, moveDesign, resizeDesign, previewArea, placementInMm } from "./designGeometry";

describe("print editor geometry", () => {
  it("fits portrait and landscape images inside the print area", () => {
    for (const [width, height] of [
      [200, 2000],
      [2000, 200],
      [100, 100],
    ]) {
      const box = fitDesign(width!, height!);
      expect(box.x).toBeGreaterThanOrEqual(330);
      expect(box.x + box.width).toBeLessThanOrEqual(800);
      expect(box.y + box.height).toBeLessThanOrEqual(980);
    }
  });
  it("clamps dragging and optionally snaps to the center", () => {
    const box = fitDesign(100, 100);
    expect(moveDesign(box, -1000, -1000)).toMatchObject({ x: 330, y: 330 });
    expect(moveDesign(box, 1000, 1000)).toMatchObject({ x: 460, y: 640 });
    expect(moveDesign(box, 10, 0).x).toBe(box.x);
    expect(moveDesign(box, 10, 0, false).x).toBe(box.x + 10);
  });
  it("keeps aspect ratio and bounds when resizing", () => {
    const box = fitDesign(100, 200);
    const large = resizeDesign(box, 2000);
    expect(large.x + large.width).toBeLessThanOrEqual(800);
    expect(large.y + large.height).toBeLessThanOrEqual(980);
    expect(large.height / large.width).toBe(2);
    expect(resizeDesign(box, -1000).width).toBeGreaterThan(0);
  });
  it("preserves physical aspect ratio and rounds placements inside differently sized backend areas", () => {
    for (const [width, height] of [
      [300, 400],
      [100, 100],
      [120, 200],
      [1, 1],
    ]) {
      const area = previewArea(width!, height!);
      expect(area.width / area.height).toBeCloseTo(width! / height!);
      const box = fitDesign(1200, 700, area);
      const moved = moveDesign(box, 100000, 100000, false, area);
      const scaled = resizeDesign(moved, 100000, area);
      const mm = placementInMm(scaled, area, width!, height!);
      expect(mm.x).toBeGreaterThanOrEqual(0);
      expect(mm.y).toBeGreaterThanOrEqual(0);
      expect(mm.width).toBeGreaterThan(0);
      expect(mm.height).toBeGreaterThan(0);
      expect(mm.x + mm.width).toBeLessThanOrEqual(width!);
      expect(mm.y + mm.height).toBeLessThanOrEqual(height!);
    }
  });
});
