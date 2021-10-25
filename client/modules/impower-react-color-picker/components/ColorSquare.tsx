import styled from "@emotion/styled";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ColorIcon } from "./ColorIcon";

const StyledColorSquare = styled.div`
  touch-action: none;
  position: relative;
  cursor: crosshair;
`;

const StyledGradientArea = styled.div`
  position: relative;
`;

const StyledWhiteGradient = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-image: linear-gradient(
    90deg,
    rgba(255, 255, 255, 1) 0%,
    rgba(255, 255, 255, 0) 100%
  );
`;

const StyledBlackGradient = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background-image: linear-gradient(
    0deg,
    rgba(0, 0, 0, 1) 0%,
    rgba(0, 0, 0, 0) 100%
  );
`;

const StyledCross = styled.div`
  position: absolute;
  display: grid;
  justify-items: center;
  align-items: center;
  svg {
    width: 100%;
    height: 100%;
  }
`;

interface ColorSquareProps {
  h: number;
  s: number;
  l: number;
  squareSize: number;
  crossSize: number;
  delay?: number;
  onChange: (
    e: PointerEvent | React.PointerEvent,
    s: number,
    l: number
  ) => void;
}

export const ColorSquare = React.memo(
  (props: ColorSquareProps): JSX.Element => {
    const { h, s, l, squareSize, crossSize, onChange } = props;

    const computeCursorPosition = useCallback(
      async (sl: {
        saturation: number;
        lightness: number;
      }): Promise<{ x: number; y: number }> => {
        const { saturation, lightness } = sl;
        const getColorHsv = (await import("../utils/getColorHsv")).default;
        const hsv = getColorHsv({ h, s: saturation, l: lightness });
        const hsvSaturation = hsv.s;
        const hsvValue = hsv.v;
        const canvasY = (1 - hsvValue) * squareSize;
        const canvasX = hsvSaturation * squareSize;
        const x = canvasX - crossSize * 0.5;
        const y = canvasY - crossSize * 0.5;
        return { x, y };
      },
      [crossSize, h, squareSize]
    );

    const [cursorPosition, setCursorPosition] =
      useState<{ x: number; y: number }>();

    const pointerDown = useRef(false);
    const squareRef = useRef<HTMLDivElement | null>(null);
    const cursorRef = useRef<HTMLDivElement | null>(null);

    const computePosition = (
      e: PointerEvent | React.PointerEvent
    ): { x: number; y: number } => {
      const squareX = squareRef.current?.getBoundingClientRect().x || 0;
      const squareY = squareRef.current?.getBoundingClientRect().y || 0;
      const minX = -crossSize * 0.5;
      const maxX = squareSize - crossSize * 0.5;
      const minY = -crossSize * 0.5;
      const maxY = squareSize - crossSize * 0.5;
      const cursorOffsetX = e.clientX - squareX - crossSize * 0.5;
      const cursorOffsetY = e.clientY - squareY - crossSize * 0.5;
      const x = Math.min(maxX, Math.max(minX, cursorOffsetX));
      const y = Math.min(maxY, Math.max(minY, cursorOffsetY));
      return { x, y };
    };

    const computeSL = async (
      x: number,
      y: number
    ): Promise<{ saturation: number; lightness: number }> => {
      const canvasX = x + crossSize * 0.5;
      const canvasY = y + crossSize * 0.5;
      const hsvValue = 1 - canvasY / squareSize;
      const hsvSaturation = canvasX / squareSize;
      const getColorHsl = (await import("../utils/getColorHsl")).default;
      const hsl = getColorHsl({ h, s: hsvSaturation, v: hsvValue });
      const lightness = hsl.l;
      const saturation = hsl.s;
      return { saturation, lightness };
    };

    const handleColorChange = async (
      e: PointerEvent | React.PointerEvent
    ): Promise<void> => {
      if (!e) {
        return;
      }
      const { x, y } = computePosition(e);
      cursorRef.current.style.top = `${y}px`;
      cursorRef.current.style.left = `${x}px`;
      const { saturation, lightness } = await computeSL(x, y);
      if (onChange) {
        onChange(e, saturation, lightness);
      }
    };

    const handlePointerDown = (e: PointerEvent | React.PointerEvent): void => {
      handleColorChange(e);
      pointerDown.current = true;
    };

    useEffect(() => {
      const compute = async (): Promise<void> => {
        const cursorPosition = await computeCursorPosition({
          saturation: s,
          lightness: l,
        });
        setCursorPosition(cursorPosition);
      };
      compute();
    }, [s, l, computeCursorPosition]);

    useEffect(() => {
      const handlePointerMove = (
        e: PointerEvent | React.PointerEvent
      ): void => {
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
      <StyledColorSquare
        className={StyledColorSquare.displayName}
        ref={squareRef}
        style={{
          width: squareSize,
          height: squareSize,
        }}
        onPointerDown={handlePointerDown}
      >
        <StyledGradientArea
          className={StyledGradientArea.displayName}
          style={{
            width: squareSize,
            height: squareSize,
            backgroundColor: `hsl(${h}, 100%, 50%)`,
          }}
        >
          <StyledWhiteGradient className={StyledWhiteGradient.displayName} />
          <StyledBlackGradient className={StyledBlackGradient.displayName} />
        </StyledGradientArea>
        {cursorPosition && (
          <StyledCross
            ref={cursorRef}
            className={StyledCross.displayName}
            style={{
              top: cursorPosition?.y || 0,
              left: cursorPosition?.x || 0,
              width: crossSize,
              height: crossSize,
            }}
          >
            <ColorIcon name="cross" />
          </StyledCross>
        )}
      </StyledColorSquare>
    );
  }
);
