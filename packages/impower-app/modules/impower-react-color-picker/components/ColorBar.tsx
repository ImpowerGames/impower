import styled from "@emotion/styled";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ColorIcon } from "./ColorIcon";
import { TransparencyPattern } from "./TransparencyPattern";

const StyledColorAlpha = styled.div`
  touch-action: none;
  position: relative;
  cursor: ew-resize;
`;

const StyledBar = styled.div`
  position: relative;
`;

const StyledHandle = styled.div`
  position: absolute;
  top: 0px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
  svg {
    width: 100%;
    height: 100%;
  }
`;

interface ColorBarProps {
  value: number;
  maxValue: number;
  barWidth: number;
  barHeight: number;
  handleWidth: number;
  backgroundImage: string;
  onChange: (e: React.PointerEvent | PointerEvent, a: number) => void;
}

export const ColorBar = React.memo((props: ColorBarProps): JSX.Element => {
  const {
    value,
    maxValue,
    barWidth,
    barHeight,
    handleWidth,
    backgroundImage,
    onChange,
  } = props;

  const computeCursorPosition = useCallback(
    (v: number): number => {
      return (barWidth / maxValue) * v - handleWidth * 0.5;
    },
    [barWidth, maxValue, handleWidth]
  );

  const [cursorPosition, setCursorPosition] = useState(
    computeCursorPosition(value)
  );

  const pointerDown = useRef(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);

  const computePosition = (e: PointerEvent | React.PointerEvent): number => {
    const barX = barRef.current?.getBoundingClientRect().x || 0;
    const minX = -handleWidth * 0.5;
    const maxX = barWidth - handleWidth * 0.5;
    const cursorOffsetX = e.clientX - barX - handleWidth * 0.5;
    const x = Math.min(maxX, Math.max(minX, cursorOffsetX));
    return x;
  };

  const computeHue = (x: number): number => {
    return Math.min(maxValue, (x + handleWidth * 0.5) * (maxValue / barWidth));
  };

  const handleColorChange = (e: PointerEvent | React.PointerEvent): void => {
    if (!e) {
      return;
    }
    const x = computePosition(e);
    const hue = computeHue(x);
    cursorRef.current.style.left = `${x}px`;
    if (onChange) {
      onChange(e, hue);
    }
  };

  const handlePointerDown = (e: PointerEvent | React.PointerEvent): void => {
    handleColorChange(e);
    pointerDown.current = true;
  };

  useEffect(() => {
    setCursorPosition(computeCursorPosition(value));
  }, [value, computeCursorPosition]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent | React.PointerEvent): void => {
      if (pointerDown.current) {
        handleColorChange(e);
      }
    };
    const handlePointerUp = (e: PointerEvent | React.PointerEvent): void => {
      if (pointerDown.current) {
        handleColorChange(e);
        pointerDown.current = false;
      }
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return (): void => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  });

  return (
    <StyledColorAlpha
      className={StyledColorAlpha.displayName}
      ref={barRef}
      style={{
        width: barWidth,
        height: barHeight,
      }}
      onPointerDown={handlePointerDown}
    >
      <TransparencyPattern />
      <StyledBar
        className={StyledBar.displayName}
        style={{
          width: barWidth,
          height: barHeight,
          backgroundImage,
        }}
      />
      <StyledHandle
        className={StyledHandle.displayName}
        ref={cursorRef}
        style={{
          left: cursorPosition,
          width: handleWidth,
          height: barHeight,
        }}
      >
        <ColorIcon name="handle" />
      </StyledHandle>
    </StyledColorAlpha>
  );
});
