import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { IconButton, Slider, Typography } from "@material-ui/core";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { debounce } from "../../../impower-core";
import { StringDialogProps } from "./StringDialog";
import StringInput, { StringInputProps } from "./StringInput";

const NumberDialog = dynamic(() => import("./NumberDialog"), { ssr: false });

const disabledOpacity = 0.8;

const StyledNumberInput = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const StyledGrid = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    align-items: stretch;
    flex-direction: column;
    justify-content: center;
  }
`;

const StyledTextGrid = styled.div`
  display: flex;
`;

const StyledSliderGrid = styled.div`
  display: flex;
  flex: 1;
  padding-left: ${(props): string => props.theme.spacing(3)};
  padding-right: ${(props): string => props.theme.spacing(2)};
  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding-left: 0;
    padding-right: 0;
  }
`;

const StyledLabelTypography = styled(Typography)`
  padding-top: ${(props): string => props.theme.spacing(1)};

  .inset &.MuiFormLabel-root {
    color: white;
  }
`;

const StyledSlider = styled(Slider)`
  flex: 1;

  &.inset {
    color: white;
  }

  margin-bottom: 0;
  .Mui-disabled &.MuiSlider-root {
    opacity: ${disabledOpacity};
  }

  & .MuiSlider-thumb {
    width: ${(props): string => props.theme.spacing(3)};
    height: ${(props): string => props.theme.spacing(3)};
    margin-top: -${(props): string => props.theme.spacing(1)};
    margin-left: -${(props): string => props.theme.spacing(1.5)};
    background-color: white;
    border: 2px solid currentColor;
    box-shadow: ${(props): string => props.theme.shadows[1]};
    &:focus {
      box-shadow: inherit;
    }
    &:hover {
      box-shadow: inherit;
    }
    &:active {
      box-shadow: inherit;
    }
  }

  &.inset .MuiSlider-thumb {
    width: 16px;
    height: 16px;
    margin-top: -4px;
    margin-left: -8px;
    border: none;
  }

  & .MuiSlider-rail {
    box-shadow: ${(props): string => props.theme.boxShadow.inset};
    height: ${(props): string => props.theme.spacing(1)};
    border-radius: ${(props): string => props.theme.spacing(1)};
  }

  &.inset .MuiSlider-rail {
    background-color: ${(props): string => props.theme.palette.secondary.light};
  }

  & .MuiSlider-track {
    opacity: 0.6;
    box-shadow: none;
    height: ${(props): string => props.theme.spacing(1)};
    border-radius: ${(props): string => props.theme.spacing(1)};
  }

  & .MuiSlider-valueLabel {
    left: calc(-50%);
    top: ${(props): string => props.theme.spacing(3)};
    & * {
      background: transparent;
      color: inherit;
    }
  }

  & .MuiSlider-mark {
    width: ${(props): string => props.theme.spacing(1)};
    height: ${(props): string => props.theme.spacing(1)};
    margin-left: -${(props): string => props.theme.spacing(0.5)};
    border-radius: ${(props): string => props.theme.spacing(1)};
  }

  &.inset .MuiSlider-mark {
    color: ${(props): string => props.theme.palette.secondary.main};
  }

  &.inset .MuiSlider-markLabel {
    color: white;
  }

  ${(props): string => props.theme.breakpoints.down("sm")} {
    &.inset .MuiSlider-markLabel {
      display: none;
    }
  }

  @media (pointer: coarse) {
    & .MuiSlider-markLabel {
      top: 33px;
    }
  }
`;

const StyledUnitIconArea = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const StyledAdornmentTypography = styled(Typography)``;

export interface NumberInputProps extends StringInputProps {
  backgroundColor?: string;
  tooltip?: string;
  value?: number;
  mixed?: boolean;
  valueBounds?: {
    min?: number;
    max?: number;
    step?: number | null;
    marks?: { value: number; label: string }[];
    force?: boolean;
    disableArbitraryInput?: boolean;
  };
  unit?: string;
  possibleUnits?: string[];
  moreInfoPopup?: {
    icon?: string;
    title?: string;
    description?: string;
    caption?: string;
    alignment?: "flex-start" | "center" | "flex-end";
  };
  loading?: boolean;
  endAdornmentPosition?: "before" | "after" | "replace";
  debounceInterval?: number;
  onChange?: (e: React.ChangeEvent, value?: number) => void;
  getDisplayValue?: (option: number) => string;
  onDebouncedChange?: (value: number) => void;
  onBlur?: (e: React.FocusEvent, value?: number) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onChangeUnit?: (value: string) => void;
}

const NumberInput = React.memo(
  (props: NumberInputProps): JSX.Element | null => {
    const {
      id,
      variant,
      inset,
      InputComponent,
      size,
      backgroundColor,
      label,
      placeholder,
      tooltip,
      disabled,
      required,
      autoFocus,
      value,
      mixed,
      valueBounds,
      unit,
      possibleUnits,
      InputProps,
      helperText,
      moreInfoPopup,
      loading,
      endAdornmentPosition = "after",
      debounceInterval = 0,
      getDisplayValue,
      onChange,
      onDebouncedChange,
      onBlur,
      onKeyDown,
      onChangeUnit,
    } = props;
    const editingSlider = useRef(false);
    const [state, setState] = useState(value);
    const stateRef = useRef(value);
    const onDebouncedChangeRef = useRef(onDebouncedChange);
    const [selectedUnitIndex, setSelectedUnitIndex] = useState<number>(
      possibleUnits?.indexOf(unit || "") || 0
    );

    useEffect(() => {
      stateRef.current = value;
      setState(value);
    }, [value]);

    useEffect(() => {
      onDebouncedChangeRef.current = onDebouncedChange;
    }, [onDebouncedChange]);

    const handleChange = useCallback((): void => {
      const newValue = stateRef.current;
      if (onDebouncedChangeRef.current) {
        onDebouncedChangeRef.current(newValue);
      }
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const onDelayedChange = useCallback(
      debounce(handleChange, debounceInterval),
      [handleChange]
    );

    const handleDelayedChange = useCallback((): void => {
      onDelayedChange();
    }, [onDelayedChange]);

    const handleSliderChange = useCallback(
      (event: Event, newValue: number | number[]) => {
        editingSlider.current = true;
        stateRef.current = newValue as number;
        setState(newValue as number);
        if (onChange) {
          onChange(event as unknown as React.ChangeEvent, newValue as number);
        }
        handleDelayedChange();
      },
      [handleDelayedChange, onChange]
    );
    const handleSliderBlur = useCallback(
      (e: React.FocusEvent): void => {
        editingSlider.current = false;
        if (onBlur) {
          onBlur(e, state);
        }
      },
      [onBlur, state]
    );
    const getValidValue = useCallback(
      (newValue: string): number | string => {
        if (newValue === "") {
          return "";
        }
        let validNewValue = Number(newValue);
        if (Number.isNaN(validNewValue)) {
          return valueBounds?.min || 0;
        }
        if (valueBounds?.force) {
          if (valueBounds?.min !== undefined) {
            validNewValue = Math.max(validNewValue, valueBounds?.min);
          }
          if (valueBounds?.max !== undefined) {
            validNewValue = Math.min(validNewValue, valueBounds?.max);
          }

          if (valueBounds?.step) {
            const min = valueBounds?.min || 0;
            const step = valueBounds?.step || 1;
            validNewValue =
              Math.ceil((validNewValue - min) / step) * step + min;
          }
          if (valueBounds?.marks) {
            validNewValue = valueBounds?.marks
              .map((mark) => mark.value)
              .reduce((prev, curr) =>
                Math.abs(curr - validNewValue) < Math.abs(prev - validNewValue)
                  ? curr
                  : prev
              );
          }
          return validNewValue;
        }
        return validNewValue;
      },
      [
        valueBounds?.force,
        valueBounds?.marks,
        valueBounds?.max,
        valueBounds?.min,
        valueBounds?.step,
      ]
    );
    const handleInputChange = useCallback(
      (e: React.ChangeEvent, newValue: string) => {
        const validNewValue = getValidValue(newValue);
        if (typeof validNewValue === "number") {
          stateRef.current = validNewValue as number;
          setState(validNewValue);
          if (onChange) {
            onChange(e, validNewValue);
          }
          handleDelayedChange();
        }
      },
      [getValidValue, onChange, handleDelayedChange]
    );
    const handleInputBlur = useCallback(
      (e: React.FocusEvent, newValue: string) => {
        const validNewValue = getValidValue(newValue);
        if (typeof validNewValue === "number") {
          if (onBlur) {
            onBlur(e, validNewValue);
          }
        }
      },
      [onBlur, getValidValue]
    );
    const onWindowPointerUp = (e: PointerEvent): void => {
      if (editingSlider.current) {
        if (onBlur) {
          onBlur(e as unknown as React.FocusEvent, state);
        }
        editingSlider.current = false;
      }
    };

    const valueLabelDisplay =
      valueBounds?.disableArbitraryInput && !valueBounds?.marks?.[0]
        ? "on"
        : undefined;

    const theme = useTheme();

    const NumberInputProps = useMemo(
      () => ({
        endAdornment: (
          <>
            {endAdornmentPosition === "before" && InputProps?.endAdornment}
            {endAdornmentPosition === "replace"
              ? InputProps?.endAdornment
              : possibleUnits && (
                  <StyledUnitIconArea
                    className={StyledUnitIconArea.displayName}
                  >
                    <IconButton
                      onClick={(): void => {
                        if (
                          !possibleUnits ||
                          selectedUnitIndex >= possibleUnits.length - 1
                        ) {
                          const newIndex = 0;
                          setSelectedUnitIndex(newIndex);
                          const newUnit = possibleUnits?.[newIndex];
                          if (newUnit) {
                            if (onChangeUnit) {
                              onChangeUnit(newUnit);
                            }
                          }
                        } else {
                          const newIndex = selectedUnitIndex + 1;
                          setSelectedUnitIndex(newIndex);
                          const newUnit = possibleUnits?.[newIndex];
                          if (newUnit) {
                            if (onChangeUnit) {
                              onChangeUnit(newUnit);
                            }
                          }
                        }
                      }}
                    >
                      <StyledAdornmentTypography
                        style={{
                          color: theme.colors.subtitle,
                          fontWeight: "bold",
                          fontSize: theme.fontSize.adornmentIcon,
                          width: theme.fontSize.adornmentIcon,
                          height: theme.fontSize.adornmentIcon,
                        }}
                      >
                        {possibleUnits?.[selectedUnitIndex] || unit}
                      </StyledAdornmentTypography>
                    </IconButton>
                  </StyledUnitIconArea>
                )}
            {endAdornmentPosition === "after" && InputProps?.endAdornment}
          </>
        ),
      }),
      [
        InputProps?.endAdornment,
        endAdornmentPosition,
        onChangeUnit,
        possibleUnits,
        selectedUnitIndex,
        theme.colors.subtitle,
        theme.fontSize.adornmentIcon,
        unit,
      ]
    );

    const DialogProps = useMemo(
      () =>
        ({
          valueLabelDisplay,
          max: valueBounds?.max,
          min: valueBounds?.min,
          step: valueBounds?.step,
          marks: valueBounds?.marks,
        } as Partial<StringDialogProps>),
      [
        valueBounds?.marks,
        valueBounds?.max,
        valueBounds?.min,
        valueBounds?.step,
        valueLabelDisplay,
      ]
    );

    useEffect(() => {
      stateRef.current = value as number;
      setState(value);
    }, [value]);
    useEffect(() => {
      window.addEventListener("pointerup", onWindowPointerUp);
      return (): void => {
        window.removeEventListener("pointerup", onWindowPointerUp);
      };
    });

    const displayValue = getDisplayValue
      ? getDisplayValue(state)
      : state.toString();

    const inputValue = displayValue !== state.toString() ? "" : state;

    return (
      <StyledNumberInput
        className={inset ? "inset" : undefined}
        style={{
          minHeight: theme.spacing(6),
        }}
      >
        {valueBounds?.disableArbitraryInput && (
          <StyledLabelTypography
            className={`MuiFormLabel-root MuiInputLabel-root MuiInputLabel-formControl MuiInputLabel-animated MuiInputLabel-shrink MuiFormLabel-filled ${
              variant === "outlined"
                ? `MuiInputLabel-outlined`
                : variant === "filled"
                ? `MuiInputLabel-filled`
                : ""
            }`}
          >
            {label}
          </StyledLabelTypography>
        )}
        <StyledGrid>
          {!valueBounds?.disableArbitraryInput && (
            <StyledTextGrid
              className={StyledTextGrid.displayName}
              style={{ flex: 1 }}
            >
              <StringInput
                id={id}
                type="number"
                variant={variant}
                inset={inset}
                InputComponent={InputComponent}
                size={size}
                backgroundColor={backgroundColor}
                label={label}
                placeholder={
                  placeholder || displayValue !== state.toString()
                    ? displayValue
                    : undefined
                }
                InputLabelProps={
                  displayValue !== state.toString()
                    ? {
                        shrink: true,
                        disableAnimation: true,
                      }
                    : undefined
                }
                inputProps={{ inputMode: "decimal", pattern: "[0-9]*" }}
                tooltip={tooltip}
                disabled={disabled}
                required={required}
                autoFocus={autoFocus}
                multiline={false}
                value={inputValue}
                mixed={mixed}
                debounceInterval={debounceInterval}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={onKeyDown}
                InputProps={NumberInputProps}
                helperText={helperText}
                moreInfoPopup={moreInfoPopup}
                loading={loading}
                DialogComponent={NumberDialog}
                DialogProps={DialogProps}
              />
            </StyledTextGrid>
          )}
          <StyledSliderGrid>
            <StyledSlider
              className={inset ? "inset" : undefined}
              value={typeof state === "number" ? state : 0}
              disabled={disabled}
              onChange={handleSliderChange}
              onBlur={handleSliderBlur}
              valueLabelDisplay={valueLabelDisplay}
              max={valueBounds?.max}
              min={valueBounds?.min}
              step={valueBounds?.step}
              marks={valueBounds?.marks}
              aria-label={label as string}
              style={{
                paddingTop: valueBounds?.disableArbitraryInput
                  ? theme.spacing(3.25)
                  : theme.spacing(1),
                paddingBottom: valueBounds?.disableArbitraryInput
                  ? theme.spacing(1.5)
                  : theme.spacing(1.5),
              }}
            />
          </StyledSliderGrid>
        </StyledGrid>
      </StyledNumberInput>
    );
  }
);

export default NumberInput;
