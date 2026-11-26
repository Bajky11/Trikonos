import type { ReactElement } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";

export function AdminAppBarActions({ buttons }: { buttons: readonly ReactElement[] }) {
  const target = useOutletContext<HTMLDivElement | null>();
  return target && createPortal(buttons, target);
}
