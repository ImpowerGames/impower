import { TextAlignment } from "../../enums/alignment";

export interface TextProps {
  fontFamily: string;
  alignment: TextAlignment;
  size: number;
  lineHeight: number;
  letterSpacing: number;
  wrap: boolean;
}
