import { PrintedInsert } from "./PrintedInsert";
import { ScreenplayTokenType } from "./ScreenplayTokenType";

export interface ScreenplayToken {
  tag: ScreenplayTokenType;
  id?: string;
  text?: string;
  styled?: string;
  scene?: string | number;
  position?: "l" | "r";
  prefix?: string;
  suffix?: string;
  from?: number;
  continued?: boolean;
  source?: number[];
  inserts?: PrintedInsert[];
}
