import React from "react";
import { Vector2 } from "../../types/generics";

export interface CanvasDefaultProps {
  size: Vector2;
  gridColor: string;
  gridSize: number;
  children?: React.ReactNode;
}

export const CanvasDefault = (props: CanvasDefaultProps): JSX.Element => {
  const { gridColor, gridSize, children } = props;
  const lineStroke = 2;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundImage: `linear-gradient(
            90deg,
            ${gridColor} ${lineStroke}px,
            transparent 0
          ),
          linear-gradient(
            180deg,
            ${gridColor} ${lineStroke}px,
            transparent 0
          )`,
        outline: `${lineStroke}px dashed ${gridColor}`,
      }}
    >
      {children}
    </div>
  );
};
