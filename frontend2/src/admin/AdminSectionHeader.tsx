import type { ReactNode } from "react";
import SearchIcon from "@mui/icons-material/Search";
import { InputAdornment, TextField } from "@mui/material";
import "./AdminSectionHeader.css";

type Props = {
  title?: string;
  titleId?: string;
  level?: 1 | 2;
  className?: string;
  search?: {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
  };
  actions?: ReactNode;
};

export function AdminSectionHeader({
  title,
  titleId,
  level = 2,
  className,
  search,
  actions,
}: Props) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className={className ? `admin-section-header ${className}` : "admin-section-header"}>
      {title && <Heading id={titleId}>{title}</Heading>}
      {search && (
        <TextField
          className="admin-section-search"
          type="search"
          size="small"
          label={search.label}
          placeholder={search.placeholder}
          value={search.value}
          onChange={(event) => search.onChange(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      )}
      {actions && <div className="admin-section-actions">{actions}</div>}
    </header>
  );
}
