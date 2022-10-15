export interface View {
  depth: "top-down" | "side-scroller";
  type: "orthographic" | "perspective";
  width: number;
  height: number;
  fit: "cover" | "contain";
  background: string;
  color: string;
}
