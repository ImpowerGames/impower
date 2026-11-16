export type MenuForm = "menu" | "sheet";

export const menuFormFor = (openingPointer: string | undefined): MenuForm =>
  openingPointer === "touch" || openingPointer === "pen" ? "sheet" : "menu";
