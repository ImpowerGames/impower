import styled from "@emotion/styled";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ColorResult, HSLAColor, RGBAColor } from "../types/formats";
import { debounce } from "../utils/debounce";
import { ColorBar } from "./ColorBar";
import { ColorInput } from "./ColorInput";
import { ColorSquare } from "./ColorSquare";
import { TextFieldDefaultProps } from "./TextField.default";
import { TransparencyPattern } from "./TransparencyPattern";

const StyledColorPicker = styled.div`
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 3px 3px rgba(0, 0, 0, 0.3);
  max-width: 320px;
`;

const StyledInnerPicker = styled.div`
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const StyledControlArea = styled.div`
  padding-top: 8px;
  flex: 1;
  display: flex;
  align-items: center;
  width: 100%;
`;

const StyledRightInputArea = styled.div`
  flex: 1;
  position: relative;
  padding-left: 8px;
  display: flex;
`;

const StyledBottomInputArea = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
`;

const StyledSpacer = styled.div`
  position: relative;
  flex: 1;
`;

const StyledSwatch = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  cursor: pointer;
`;

const StyledLabelArea = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
`;

interface ColorPickerProps {
  value?: string | HSLAColor | RGBAColor;
  squareSize?: number;
  barHeight?: number;
  handleWidth?: number;
  crossSize?: number;
  debounceInterval?: number;
  onChange?: (e: React.ChangeEvent, value: ColorResult) => void;
  onDebouncedChange?: (value: ColorResult) => void;
  onClose?: () => void;
  textField?: (props: TextFieldDefaultProps) => JSX.Element | null;
}

export const ColorPicker = React.memo(
  (props: ColorPickerProps): JSX.Element => {
    const {
      value = { h: 0, s: 0, l: 0, a: 1 },
      squareSize = 280,
      barHeight = 38,
      handleWidth = 20,
      crossSize = 15,
      debounceInterval = 0,
      onChange,
      onDebouncedChange,
      onClose,
      textField,
    } = props;

    const [state, setState] = useState<ColorResult>();
    const stateRef = useRef<ColorResult>();
    const onDebouncedChangeRef = useRef(onDebouncedChange);

    useEffect(() => {
      const setup = async (): Promise<void> => {
        const getColorResult = (await import("../utils/getColorResult"))
          .default;
        stateRef.current = getColorResult(value);
        setState(getColorResult(value));
      };
      setup();
    }, [value]);

    useEffect(() => {
      onDebouncedChangeRef.current = onDebouncedChange;
    }, [onDebouncedChange]);

    const handleChange = useCallback((): void => {
      const newValue = stateRef.current;
      onDebouncedChangeRef.current(newValue);
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const onDelayedChange = useCallback(
      debounce(handleChange, debounceInterval),
      [handleChange]
    );

    const handleDelayedChange = useCallback((): void => {
      onDelayedChange();
    }, [onDelayedChange]);

    const handleSLChange = useCallback(
      async (
        e: React.ChangeEvent | React.PointerEvent | PointerEvent,
        newS: number,
        newL: number
      ): Promise<void> => {
        const getColorResult = (await import("../utils/getColorResult"))
          .default;
        const hsla = {
          ...(state?.hsla || { h: 0, s: 0, l: 0, a: 1 }),
          s: newS,
          l: newL,
        };
        const colorResult = getColorResult(hsla);
        stateRef.current = colorResult;
        setState(colorResult);
        if (onChange) {
          onChange(e as React.ChangeEvent, colorResult);
        }
        handleDelayedChange();
      },
      [state.hsla, onChange, handleDelayedChange]
    );

    const handleHChange = useCallback(
      async (
        e: React.ChangeEvent | React.PointerEvent | PointerEvent,
        newH: number
      ): Promise<void> => {
        const getColorResult = (await import("../utils/getColorResult"))
          .default;
        const hsla = {
          ...(state?.hsla || { h: 0, s: 0, l: 0, a: 1 }),
          h: newH,
        };
        const colorResult = getColorResult(hsla);
        stateRef.current = colorResult;
        setState(colorResult);
        if (onChange) {
          onChange(e as React.ChangeEvent, colorResult);
        }
        handleDelayedChange();
      },
      [state.hsla, onChange, handleDelayedChange]
    );

    const handleSChange = useCallback(
      async (
        e: React.ChangeEvent | React.PointerEvent | PointerEvent,
        newS: number
      ): Promise<void> => {
        const getColorResult = (await import("../utils/getColorResult"))
          .default;
        const hsla = {
          ...(state?.hsla || { h: 0, s: 0, l: 0, a: 1 }),
          s: newS,
        };
        const colorResult = getColorResult(hsla);
        stateRef.current = colorResult;
        setState(colorResult);
        if (onChange) {
          onChange(e as React.ChangeEvent, colorResult);
        }
        handleDelayedChange();
      },
      [state.hsla, onChange, handleDelayedChange]
    );

    const handleLChange = useCallback(
      async (
        e: React.ChangeEvent | React.PointerEvent | PointerEvent,
        newL: number
      ): Promise<void> => {
        const getColorResult = (await import("../utils/getColorResult"))
          .default;
        const hsla = {
          ...(state?.hsla || { h: 0, s: 0, l: 0, a: 1 }),
          l: newL,
        };
        const colorResult = getColorResult(hsla);
        stateRef.current = colorResult;
        setState(colorResult);
        if (onChange) {
          onChange(e as React.ChangeEvent, colorResult);
        }
        handleDelayedChange();
      },
      [state.hsla, onChange, handleDelayedChange]
    );

    const handleAChange = useCallback(
      async (
        e: React.ChangeEvent | React.PointerEvent | PointerEvent,
        newA: number
      ): Promise<void> => {
        const getColorResult = (await import("../utils/getColorResult"))
          .default;
        const rgba = {
          ...(state?.rgba || { r: 0, g: 0, b: 0, a: 1 }),
          a: newA,
        };
        const colorResult = getColorResult(rgba);
        stateRef.current = colorResult;
        setState(colorResult);
        if (onChange) {
          onChange(e as React.ChangeEvent, colorResult);
        }
        handleDelayedChange();
      },
      [state.rgba, onChange, handleDelayedChange]
    );

    const handleColorChange = useCallback(
      async (
        e: React.ChangeEvent | React.PointerEvent | PointerEvent,
        newColor: string
      ): Promise<void> => {
        const getColorResult = (await import("../utils/getColorResult"))
          .default;
        const colorResult = getColorResult(newColor);
        stateRef.current = colorResult;
        setState(colorResult);
        if (onChange) {
          onChange(e as React.ChangeEvent, colorResult);
        }
        handleDelayedChange();
      },
      [onChange, handleDelayedChange]
    );

    const { h, s, l, a } = state?.hsla || { h: 0, s: 0, l: 0, a: 1 };
    const { hex } = state;

    const inputWidth = 82;

    return (
      <StyledColorPicker>
        <StyledInnerPicker>
          <ColorSquare
            h={h}
            s={s}
            l={l}
            squareSize={squareSize}
            crossSize={crossSize}
            delay={debounceInterval}
            onChange={handleSLChange}
          />
          <StyledControlArea>
            <ColorBar
              value={h}
              maxValue={360}
              backgroundImage={`linear-gradient(
                90deg,
                hsl(360, 100%, 50%) 0%,
                hsl(61.2, 100%, 50%) 17%,
                hsl(118.8, 100%, 50%) 33%,
                hsl(180, 100%, 50%) 50%,
                hsl(241.2, 100%, 50%) 67%,
                hsl(298.8, 100%, 50%) 83%,
                hsl(0, 100%, 50%) 100%
              )`}
              barWidth={squareSize - inputWidth}
              barHeight={barHeight}
              handleWidth={handleWidth}
              onChange={handleHChange}
            />
            <StyledRightInputArea style={{ width: inputWidth }}>
              <ColorInput
                label="H"
                type="number"
                value={h}
                min={0}
                max={359}
                onChange={handleHChange}
              >
                {textField}
              </ColorInput>
            </StyledRightInputArea>
          </StyledControlArea>
          <StyledControlArea>
            <ColorBar
              value={s}
              maxValue={1}
              backgroundImage={`linear-gradient(
                90deg, 
                hsla(${Math.round(h)},${0}%,${l * 100}%,1) 0%, 
                hsla(${Math.round(h)},${s * 100}%,${l * 100}%,1) 100%
                )`}
              barWidth={squareSize - inputWidth}
              barHeight={barHeight}
              handleWidth={handleWidth}
              onChange={handleSChange}
            />
            <StyledRightInputArea style={{ width: inputWidth }}>
              <ColorInput
                label="S"
                type="number"
                value={s}
                min={0}
                max={100}
                onChange={handleSChange}
              >
                {textField}
              </ColorInput>
            </StyledRightInputArea>
          </StyledControlArea>
          <StyledControlArea>
            <ColorBar
              value={l}
              maxValue={1}
              backgroundImage={`linear-gradient(
                90deg, 
                hsla(${Math.round(h)},${s * 100}%,${l * 0}%,1) 0%, 
                hsla(${Math.round(h)},${s * 100}%,${l * 100}%,1) 100%
                )`}
              barWidth={squareSize - inputWidth}
              barHeight={barHeight}
              handleWidth={handleWidth}
              onChange={handleLChange}
            />
            <StyledRightInputArea style={{ width: inputWidth }}>
              <ColorInput
                label="L"
                type="number"
                value={l}
                min={0}
                max={100}
                onChange={handleLChange}
              >
                {textField}
              </ColorInput>
            </StyledRightInputArea>
          </StyledControlArea>
          <StyledControlArea>
            <ColorBar
              value={a}
              maxValue={1}
              backgroundImage={`linear-gradient(
                90deg, 
                hsla(${Math.round(h)},${s * 100}%,${l * 100}%,0) 0%, 
                hsla(${Math.round(h)},${s * 100}%,${l * 100}%,1) 100%
                )`}
              barWidth={squareSize - inputWidth}
              barHeight={barHeight}
              handleWidth={handleWidth}
              onChange={handleAChange}
            />
            <StyledRightInputArea style={{ width: inputWidth }}>
              <ColorInput
                label="A"
                type="number"
                value={a}
                min={0}
                max={100}
                onChange={handleAChange}
              >
                {textField}
              </ColorInput>
            </StyledRightInputArea>
          </StyledControlArea>
          <StyledControlArea>
            <StyledBottomInputArea
              style={{
                width: squareSize - inputWidth,
              }}
            >
              <ColorInput
                label="Color"
                type="text"
                value={hex}
                onChange={handleColorChange}
              >
                {textField}
              </ColorInput>
            </StyledBottomInputArea>
            <StyledRightInputArea>
              <StyledSpacer
                style={{
                  height: barHeight,
                }}
              >
                <TransparencyPattern
                  style={{
                    borderRadius: 4,
                  }}
                />
                <StyledSwatch
                  style={{
                    backgroundColor: `#${state.hex}`,
                    borderRadius: 4,
                  }}
                  onClick={onClose}
                >
                  <StyledLabelArea
                    style={{
                      fontSize: "1.25rem",
                      color: "black",
                      WebkitTextFillColor: "white",
                      WebkitTextStrokeWidth: "1px",
                      WebkitTextStrokeColor: "black",
                    }}
                  >
                    ✔
                  </StyledLabelArea>
                </StyledSwatch>
              </StyledSpacer>
            </StyledRightInputArea>
          </StyledControlArea>
        </StyledInnerPicker>
      </StyledColorPicker>
    );
  }
);
