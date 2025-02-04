import { PagePosition } from "../types/PagePosition";

export const PAGE_ALIGNMENTS: Record<
  PagePosition,
  "left" | "right" | "center"
> = {
  tl: "left",
  tc: "center",
  tr: "right",
  cc: "center",
  bl: "left",
  br: "right",
  l: "left",
  r: "left",
  header: "left",
  footer: "left",
  watermark: "center",
};
