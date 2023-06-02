import type { IRenderer as _IRenderer } from "@pixi/core";

export interface IRenderer extends _IRenderer {
  /** the backgroundColor of the screen */
  backgroundColor?: number;
}
