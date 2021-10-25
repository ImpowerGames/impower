import { DataDocument } from "../../../impower-core";

export interface TagDocument extends DataDocument<"TagDocument"> {
  readonly name?: string;
  readonly summary?: string;
  readonly nsfw?: boolean;
  readonly terms?: string[];
  readonly hoursWhenDayOld?: number[];
  readonly daysWhenWeekOld?: number[];
  readonly weeksWhenMonthOld?: number[];
  readonly monthsWhenYearOld?: number[];

  readonly games?: number;
  readonly resources?: number;
  readonly studios?: number;
  readonly users?: number;
}
