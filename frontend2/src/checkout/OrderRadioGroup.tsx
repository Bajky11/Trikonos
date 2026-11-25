import { useId } from "react";
import { FormControl, FormControlLabel, FormLabel, Radio, RadioGroup } from "@mui/material";

export function OrderRadioGroup({
  label,
  name,
  value,
  onChange,
  choices,
  disabled,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  choices: { value: string; label: string }[];
  disabled: boolean;
}) {
  const labelId = useId();
  return (
    <FormControl component="fieldset" disabled={disabled}>
      <FormLabel component="legend" id={labelId}>
        {label}
      </FormLabel>
      <RadioGroup
        aria-labelledby={labelId}
        aria-required="true"
        name={name}
        value={value}
        onChange={(_, next) => onChange(next)}
      >
        {choices.map((choice) => (
          <FormControlLabel
            key={choice.value}
            value={choice.value}
            control={<Radio required />}
            label={choice.label}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}
