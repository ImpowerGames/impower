import type { Layout } from "./breakpoints";

export type MenuForm = "menu" | "sheet";

export type MenuSheetOn = "phone" | "phone-or-touch";

export const touchPointer = (pointer: string | undefined) => pointer === "touch" || pointer === "pen";

export const menuFormFor = (
  layout: Layout,
  openingPointer: string | undefined,
  sheetOn: MenuSheetOn = "phone",
): MenuForm =>
  layout === "phone" || (sheetOn === "phone-or-touch" && touchPointer(openingPointer)) ? "sheet" : "menu";
