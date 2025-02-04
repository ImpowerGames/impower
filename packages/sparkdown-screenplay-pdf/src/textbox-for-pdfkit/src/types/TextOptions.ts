export interface TextOptions {
  font?: string;
  fontSize?: number;
  lineHeight?: number;
  newLine?: boolean;
  width?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  oblique?: number;
  underline?: boolean;
  strike?: boolean;
  lineBreak?: boolean;
  highlight?: boolean;
  highlightColor?: string;
  links?: boolean;
  link?: string;
  removeTrailingSpaces?: boolean;
  align?: string;
  baseline?:
    | number
    | "top"
    | "bottom"
    | "svg-middle"
    | "middle"
    | "svg-central"
    | "ideographic"
    | "alphabetic"
    | "mathematical"
    | "hanging";
}
