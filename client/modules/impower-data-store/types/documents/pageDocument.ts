import { DataDocument, StorageFile, Timestamp } from "../../../impower-core";
import { Alignment } from "../enums/alignment";
import { AccessDocument } from "./accessDocument";

export interface PageDocument<T extends string = string>
  extends DataDocument<T>,
    AccessDocument<T> {
  published: boolean;
  publishedAt: string | Timestamp;
  republishedAt: string | Timestamp;
  name: string;
  summary: string;
  description: string;
  tags: string[];
  icon: StorageFile;
  cover: StorageFile;
  logo: StorageFile;
  logoAlignment: Alignment;
  patternScale: number;
  hex: string;
  backgroundHex: string;
  status: string;
  statusInformation: string;

  score?: number;
  likes?: number;
  dislikes?: number;

  follows?: number;
  kudos?: number;
  comments?: number;
  notes?: number;
  reports?: number;

  readonly rank?: number;
  readonly rating?: number;

  readonly delisted?: boolean;
  readonly removed?: boolean;
  readonly nsfw?: boolean;
  readonly terms?: string[];
  readonly hoursWhenDayOld?: number[];
  readonly daysWhenWeekOld?: number[];
  readonly weeksWhenMonthOld?: number[];
  readonly monthsWhenYearOld?: number[];
}
