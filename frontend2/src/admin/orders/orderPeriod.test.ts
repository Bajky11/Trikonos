import { describe, expect, it } from "vite-plus/test";
import { periodRange, selectedPeriod } from "./orderPeriod";

describe("calendar order periods", () => {
  it("uses inclusive calendar boundaries, including leap years", () => {
    expect(periodRange(2024, 1)).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(periodRange(2026, 1)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(periodRange(2026, 3)).toEqual({ start: "2026-04-01", end: "2026-04-30" });
    expect(periodRange(2026)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });
  it("recognizes only exact whole months or years", () => {
    expect(selectedPeriod("2026-04-01", "2026-04-30")).toEqual({ year: 2026, month: 3 });
    expect(selectedPeriod("2026-01-01", "2026-12-31")).toEqual({ year: 2026, month: undefined });
    expect(selectedPeriod("2026-04-02", "2026-04-30")).toBeNull();
    expect(selectedPeriod("", "")).toBeNull();
    expect(selectedPeriod("2026-04-01", "")).toBeNull();
  });
});
