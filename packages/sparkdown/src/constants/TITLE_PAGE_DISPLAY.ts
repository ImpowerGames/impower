import { SparkFrontMatterKeyword } from "../types/SparkFrontMatterKeyword";
import { SparkTitlePagePosition } from "../types/SparkTitlePagePosition";

export const TITLE_PAGE_DISPLAY: Record<
  SparkFrontMatterKeyword | SparkTitlePagePosition,
  {
    position: SparkTitlePagePosition;
    order: number;
  }
> = {
  title: { position: "cc", order: 0 },
  credit: { position: "cc", order: 1 },
  author: { position: "cc", order: 2 },
  authors: { position: "cc", order: 3 },
  source: { position: "cc", order: 4 },

  notes: { position: "bl", order: 0 },
  copyright: { position: "bl", order: 1 },

  revision: { position: "br", order: 0 },
  date: { position: "br", order: 1 },
  draft_date: { position: "br", order: 2 },
  "draft date": { position: "br", order: 2 },
  contact: { position: "br", order: 3 },
  contact_info: { position: "br", order: 4 },
  "contact info": { position: "br", order: 4 },

  watermark: { position: "hidden", order: -1 },
  font: { position: "hidden", order: -1 },
  language: { position: "hidden", order: -1 },

  cc: { position: "cc", order: -1 },
  bl: { position: "bl", order: -1 },
  br: { position: "br", order: -1 },
  tc: { position: "tc", order: -1 },
  tl: { position: "tl", order: -1 },
  tr: { position: "tr", order: -1 },
  hidden: { position: "hidden", order: -1 },

  header: { position: "hidden", order: -1 },
  footer: { position: "hidden", order: -1 },
};
