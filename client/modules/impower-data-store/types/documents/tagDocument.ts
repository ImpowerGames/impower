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

  readonly studios?: number;
  readonly projects?: number;
  readonly game?: number;
  readonly story?: number;
  readonly character?: number;
  readonly setting?: number;
  readonly prop?: number;
  readonly interface?: number;
  readonly music?: number;
  readonly sound?: number;
  readonly voice?: number;
  readonly users?: number;
}
