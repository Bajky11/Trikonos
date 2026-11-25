import type { ReactNode, DragEventHandler } from "react";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import {
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import "./DataTable.css";

export type DataTableColumn = {
  label: ReactNode;
  /** Accessible name for an icon-only or visually empty heading. */
  ariaLabel?: string;
  align?: "left" | "center" | "right";
  compact?: boolean;
  /** Preferred column width in the automatic table layout. */
  width?: string | number;
  minWidth?: number;
};

type DataTableProps = {
  label: string;
  columns: readonly DataTableColumn[];
  children?: ReactNode;
  page?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  paginationDisabled?: boolean;
  paginationLabel?: string;
  alwaysShowPagination?: boolean;
  /** Pass only when there are no rows to display. */
  empty?: ReactNode;
  density?: "comfortable" | "compact";
  /** Constrains the scrolling region and keeps the column headings visible. */
  maxHeight?: number | string;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
};

export function DataTable({
  label,
  columns,
  children,
  page,
  pageCount,
  onPageChange,
  paginationDisabled,
  paginationLabel,
  alwaysShowPagination = false,
  empty,
  density = "comfortable",
  maxHeight,
  onDragLeave,
}: DataTableProps) {
  const hasEmptyState = empty != null && typeof empty !== "boolean";

  return (
    <div className="data-table-root" data-density={density}>
      <TableContainer
        className="data-table-scroll"
        role="region"
        aria-label={`Zobrazení tabulky: ${label}`}
        tabIndex={0}
        style={{ maxHeight }}
        onDragLeave={onDragLeave}
      >
        <Table aria-label={label} className="data-table" stickyHeader={maxHeight !== undefined}>
          <colgroup>
            {columns.map((column, index) => (
              <col
                key={index}
                style={{ width: column.width ?? (column.compact ? "1%" : undefined) }}
              />
            ))}
          </colgroup>
          <TableHead>
            <TableRow>
              {columns.map((column, index) => (
                <TableCell
                  key={index}
                  scope="col"
                  aria-label={column.ariaLabel}
                  align={column.align}
                  style={{
                    minWidth: column.minWidth,
                    whiteSpace: column.compact ? "nowrap" : undefined,
                  }}
                >
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {hasEmptyState ? (
              <TableRow className="data-table-empty-row">
                <TableCell colSpan={columns.length}>
                  <div className="data-table-empty" role="status">
                    <span className="data-table-empty-icon">
                      <InboxOutlinedIcon fontSize="small" />
                    </span>
                    <div>{empty}</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              children
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {page !== undefined &&
        pageCount !== undefined &&
        (pageCount > 1 || alwaysShowPagination) &&
        onPageChange && (
          <div className="data-table-pagination">
            <span className="data-table-page-status" aria-live="polite">
              {pageCount > 0 ? (
                <>
                  Strana <strong>{page}</strong> z {pageCount}
                </>
              ) : (
                "Žádné stránky"
              )}
            </span>
            <Pagination
              shape="rounded"
              disabled={paginationDisabled || pageCount <= 1}
              aria-label={paginationLabel ?? `Stránkování: ${label}`}
              page={page}
              count={Math.max(1, pageCount)}
              getItemAriaLabel={(type, number, selected) => {
                if (type === "page")
                  return selected ? `Strana ${number}` : `Přejít na stranu ${number}`;
                if (type === "previous") return "Předchozí strana";
                if (type === "next") return "Další strana";
                if (type === "first") return "První strana";
                if (type === "last") return "Poslední strana";
                return "Vynechané strany";
              }}
              onChange={(_, value) => onPageChange(value)}
            />
          </div>
        )}
    </div>
  );
}
