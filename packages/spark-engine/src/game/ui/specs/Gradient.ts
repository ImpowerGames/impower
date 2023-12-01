export interface Gradient {
  type: "linear" | "radial";
  angle: number;
  stops: {
    color: string;
    opacity: number;
    position?: number | string;
  }[];
}
