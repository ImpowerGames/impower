export interface Graphic {
  width?: number | string;
  height?: number | string;
  shapes?: {
    d?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number | string;
    strokeLinejoin?: string;
    strokeLinecap?: string;
  }[];
}
