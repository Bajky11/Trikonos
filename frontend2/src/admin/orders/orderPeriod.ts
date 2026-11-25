export const months = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

export function periodRange(year: number, month?: number) {
  const start = `${year}-${String((month ?? 0) + 1).padStart(2, "0")}-01`;
  const endMonth = month ?? 11;
  const end = `${year}-${String(endMonth + 1).padStart(2, "0")}-${new Date(year, endMonth + 1, 0).getDate()}`;
  return { start, end };
}

export function selectedPeriod(from: string, to: string) {
  const year = Number(from.slice(0, 4));
  if (!year || !from || !to) return null;
  const wholeYear = periodRange(year);
  if (from === wholeYear.start && to === wholeYear.end) return { year, month: undefined };
  const month = Number(from.slice(5, 7)) - 1;
  if (month < 0 || month > 11) return null;
  const range = periodRange(year, month);
  return from === range.start && to === range.end ? { year, month } : null;
}
