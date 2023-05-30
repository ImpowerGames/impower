export interface TextOptions {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  lineBreak?: boolean;
  highlight?: boolean;
  highlightColor?: string;
  links?: boolean;
  width?: number;
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
