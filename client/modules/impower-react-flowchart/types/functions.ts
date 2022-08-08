import React from "react";
import { Vector2 } from "./generics";

export interface OnTapNodeInput {
  id: string;
  event?: PointerEvent | React.PointerEvent;
  position: Vector2;
}
export type OnTapNode = (input: OnTapNodeInput) => void;

export interface OnDragNodeInput {
  id: string;
  event?: PointerEvent | React.PointerEvent;
  position?: Vector2;
}
export type OnDragNode = (input: OnDragNodeInput) => void;

export interface OnMultiDragNodeInput {
  id: string;
  event?: PointerEvent | React.PointerEvent;
  positions: { [id: string]: Vector2 };
}
export type OnMultiDragNode = (input: OnMultiDragNodeInput) => void;

export interface OnNodeSizeInput {
  id: string;
  size: Vector2;
}
export type OnNodeSizeDetermined = (input: OnNodeSizeInput) => void;
export type OnNodeSizeChanged = (input: OnNodeSizeInput) => void;

export interface OnPanCanvasInput {
  offset: Vector2;
  event?: Event;
}
export type OnPanCanvas = (input: OnPanCanvasInput) => void;

export interface OnZoomCanvasInput {
  scale: number;
  event?: React.UIEvent | UIEvent;
}
export type OnZoomCanvas = (input: OnZoomCanvasInput) => void;
