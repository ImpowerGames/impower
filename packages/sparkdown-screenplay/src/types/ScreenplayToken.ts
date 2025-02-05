import { ScreenplayTokenType } from "./ScreenplayTokenType";

export interface ScreenplayToken {
  tag: ScreenplayTokenType;
  text?: string;
  scene?: string | number;
  position?: "l" | "r";
  prefix?: string;
  suffix?: string;
}
