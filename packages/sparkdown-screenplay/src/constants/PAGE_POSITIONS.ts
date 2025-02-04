import { PagePosition } from "../types/PagePosition";
import { MetadataTokenType } from "../types/ScreenplayTokenType";

export const PAGE_POSITIONS: Record<MetadataTokenType, PagePosition> = {
  title: "cc",
  credit: "cc",
  author: "cc",
  source: "cc",
  notes: "bl",
  date: "br",
  contact: "br",
  revision: "br",
  copyright: "br",
  header: "header",
  footer: "footer",
  watermark: "watermark",
  tl: "tl",
  tc: "tc",
  tr: "tr",
  cc: "cc",
  bl: "bl",
  br: "br",
  l: "l",
  r: "r",
};
