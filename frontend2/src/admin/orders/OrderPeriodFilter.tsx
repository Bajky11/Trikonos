import { Button } from "@mui/material";
import { months, periodRange, selectedPeriod } from "./orderPeriod";

export function OrderPeriodFilter({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const selected = selectedPeriod(from, to);
  const currentYear = new Date().getFullYear();
  const year = selected?.year ?? (Number(from.slice(0, 4)) || currentYear);
  const years = [
    ...new Set([year, ...Array.from({ length: 8 }, (_, index) => currentYear - index)]),
  ].sort((a, b) => b - a);
  const select = (nextYear: number, month?: number) => {
    const range = periodRange(nextYear, month);
    onChange(range.start, range.end);
  };
  return (
    <div className="orders-period" role="group" aria-label="Období objednávek">
      <div role="group" aria-label="Rok">
        {years.map((value) => (
          <Button
            key={value}
            size="small"
            aria-pressed={selected?.year === value}
            onClick={() => select(value, selected?.month)}
          >
            {value}
          </Button>
        ))}
        <Button size="small" aria-pressed={!from && !to} onClick={() => onChange("", "")}>
          Všechna období
        </Button>
      </div>
      <div role="group" aria-label="Měsíc">
        {months.map((month, index) => (
          <Button
            key={month}
            size="small"
            aria-pressed={selected?.month === index}
            onClick={() => select(year, index)}
          >
            {month}
          </Button>
        ))}
        <Button
          size="small"
          aria-pressed={!!selected && selected.month === undefined}
          onClick={() => select(year)}
        >
          Celý rok
        </Button>
      </div>
    </div>
  );
}
