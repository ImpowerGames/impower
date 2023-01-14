export interface Theme {
  breakpoints: Record<string, number>;
  colors: Record<string, string>;
  typography: Record<
    string,
    Record<
      string,
      {
        font: string;
        size: number;
        height: number;
        kerning: number;
        strokeWidth: number | string;
        underlineThickness: number | string;
        underlineOffset: number | string;
      }
    >
  >;
}
