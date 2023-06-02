import { DataDocument, StorageFile, Timestamp } from "../../../impower-core";
import { Alignment } from "../enums/alignment";
import { AccessDocument } from "./accessDocument";
import { FlaggableDocument } from "./flaggableDocument";

export interface PageDocument<T extends string = string>
  extends DataDocument<T>,
    AccessDocument<T>,
    FlaggableDocument {
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

  readonly terms?: string[];
  readonly hoursWhenDayOld?: number[];
  readonly daysWhenWeekOld?: number[];
  readonly weeksWhenMonthOld?: number[];
  readonly monthsWhenYearOld?: number[];
}
