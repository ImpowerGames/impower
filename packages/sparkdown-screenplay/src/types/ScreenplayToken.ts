import { ScreenplayTokenType } from "./ScreenplayTokenType";

export interface ScreenplayToken {
  tag: ScreenplayTokenType;
  /**
   * Stable key for translation export. Nothing populates this yet, so
   * `generateScreenplayCsvData` currently emits an empty KEY column.
   */
  id?: string;
  text?: string;
  scene?: string | number;
  position?: "l" | "r";
  prefix?: string;
  suffix?: string;
}
