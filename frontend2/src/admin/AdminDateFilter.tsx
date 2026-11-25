import dayjs from "dayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";

const apiFormat = "YYYY-MM-DD";

export function AdminDateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <DatePicker
      label={label}
      value={value ? dayjs(value, apiFormat, true) : null}
      onChange={(next, { validationError }) => {
        if (!validationError) onChange(next ? next.format(apiFormat) : "");
      }}
      slotProps={{ field: { clearable: true }, textField: { size: "small" } }}
    />
  );
}
