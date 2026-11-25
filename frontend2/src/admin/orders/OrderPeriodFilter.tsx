import { MenuItem, TextField } from "@mui/material";
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
    ...new Set([year, ...Array.from({ length: 15 }, (_, index) => currentYear - index)]),
  ].sort((a, b) => b - a);
  const select = (nextYear: number, month?: number) => {
    const range = periodRange(nextYear, month);
    onChange(range.start, range.end);
  };
  return (
    <div className="orders-period" role="group" aria-label="Období objednávek">
      <TextField
        select
        size="small"
        label="Rok"
        value={from || to ? year : ""}
        onChange={(event) =>
          event.target.value
            ? select(Number(event.target.value), selected?.month)
            : onChange("", "")
        }
      >
        <MenuItem value="">Všechny roky</MenuItem>
        {years.map((value) => (
          <MenuItem key={value} value={value}>
            {value}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Měsíc"
        value={selected ? (selected.month ?? "") : from || to ? "custom" : ""}
        onChange={(event) =>
          select(year, event.target.value === "" ? undefined : Number(event.target.value))
        }
      >
        <MenuItem value="">{from || to ? "Celý rok" : "Všechny měsíce"}</MenuItem>
        {!selected && (from || to) && <MenuItem value="custom">Vlastní období</MenuItem>}
        {months.map((month, index) => (
          <MenuItem key={month} value={index}>
            {month}
          </MenuItem>
        ))}
      </TextField>
    </div>
  );
}
