import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Checkbox from "@material-ui/core/Checkbox";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Switch from "@material-ui/core/Switch";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { debounce } from "../../../impower-core";
import { StringInputProps } from "./StringInput";

const disabledOpacity = 0.8;

const StyledBooleanInput = styled.div`
  flex: 1;
  display: flex;
`;

const StyledFormControlLabel = styled(FormControlLabel)`
  color: inherit;

  & .MuiFormControlLabel-label.Mui-disabled {
    color: inherit;
    opacity: ${disabledOpacity};
  }

  &.MuiFormControlLabel-labelPlacementTop {
    margin: 0;
    display: flex;
    align-items: flex-start;
  }

  &.MuiFormControlLabel-labelPlacementStart {
    margin-left: 0;
    margin-right: 0;
    display: flex;
    flex: 1;
  }

  & .MuiTypography-root.MuiFormControlLabel-label {
    flex: 1;
  }
`;

const StyledSwitch = styled(Switch)<{ mixed?: string }>`
  .Mui-disabled &.MuiSwitch-root {
    opacity: ${disabledOpacity};
  }

  &.inset .MuiSwitch-thumb {
    background-color: ${(props): string => props.theme.palette.secondary.light};
    box-shadow: ${(props): string => props.theme.shadows[1]};
    ${(props): string => (props.mixed ? `opacity: 0;` : ``)}
  }

  &.inset .MuiSwitch-switchBase.Mui-checked .MuiSwitch-thumb {
    background-color: white;
  }

  &.inset .MuiSwitch-track {
    background-color: ${(props): string => props.theme.palette.secondary.light};
    box-shadow: ${(props): string => props.theme.boxShadow.inset};
  }

  &.inset .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track {
    background-color: white;
    opacity: 0.6;
    box-shadow: none;
  }

  ${(props): string =>
    props.mixed
      ? `& .MuiSwitch-track::after {
    content: "${props.mixed}";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    color: black;
    font-family: ${props.theme.fontFamily.main};
  }`
      : ``}
`;

const StyledCheckbox = styled(Checkbox)<{ mixed?: string }>`
  .Mui-disabled &.MuiCheckbox-root {
    opacity: ${disabledOpacity};
  }

  &.MuiCheckbox-root.MuiButtonBase-root {
    color: ${(props): string => props.theme.colors.subtitle};
    min-width: ${(props): string => props.theme.spacing(6)};
    min-height: ${(props): string => props.theme.spacing(6)};
    max-width: ${(props): string => props.theme.spacing(6)};
    max-height: ${(props): string => props.theme.spacing(6)};
  }
`;

export interface BooleanInputProps
  extends Omit<StringInputProps, "InputComponent"> {
  value: boolean;
  controlType?: "checkbox" | "switch";
  displayValueInverted?: boolean;
  onChange?: (e: React.ChangeEvent, value?: boolean) => void;
  onDebouncedChange?: (value?: boolean) => void;
  onBlur?: (e: React.FocusEvent, value?: boolean) => void;
}

const BooleanInput = React.memo(
  (props: BooleanInputProps): JSX.Element | null => {
    const {
      id,
      size,
      variant,
      inset,
      color,
      label,
      disabled,
      autoFocus,
      value,
      mixed,
      controlType = "switch",
      debounceInterval,
      displayValueInverted,
      onChange,
      onDebouncedChange,
      onBlur,
    } = props;

    const [state, setState] = useState(displayValueInverted ? !value : value);
    const stateRef = useRef(displayValueInverted ? !value : value);
    const onDebouncedChangeRef = useRef(onDebouncedChange);

    const theme = useTheme();

    useEffect(() => {
      stateRef.current = value;
      setState(displayValueInverted ? !value : value);
    }, [displayValueInverted, value]);

    useEffect(() => {
      onDebouncedChangeRef.current = onDebouncedChange;
    }, [onDebouncedChange]);

    const handleChange = useCallback((): void => {
      const newValue = stateRef.current;
      onDebouncedChangeRef.current(displayValueInverted ? !newValue : newValue);
    }, [displayValueInverted]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const onDelayedChange = useCallback(
      debounce(handleChange, debounceInterval),
      [handleChange]
    );

    const handleDelayedChange = useCallback((): void => {
      onDelayedChange();
    }, [onDelayedChange]);

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>, newValue: boolean) => {
        stateRef.current = newValue;
        setState(newValue);
        if (onChange) {
          onChange(e, displayValueInverted ? !newValue : newValue);
        }
        handleDelayedChange();
      },
      [displayValueInverted, handleDelayedChange, onChange]
    );

    const handleBlur = useCallback(
      (e: React.FocusEvent) => {
        if (onBlur) {
          onBlur(e, displayValueInverted ? !state : state);
        }
      },
      [displayValueInverted, onBlur, state]
    );

    return (
      <StyledBooleanInput
        style={{
          minHeight: theme.spacing(6),
        }}
      >
        <StyledFormControlLabel
          label={label}
          disabled={disabled}
          labelPlacement={controlType === "switch" ? "start" : "end"}
          control={
            controlType === "switch" ? (
              <StyledSwitch
                id={id}
                className={inset ? "inset" : variant}
                disabled={disabled}
                autoFocus={autoFocus}
                checked={state}
                name={String(label)}
                value={state}
                size={size}
                color={inset ? "default" : color}
                inputProps={{ "aria-label": String(label) }}
                mixed={mixed ? "~" : undefined}
                onChange={handleInputChange}
                onBlur={handleBlur}
              />
            ) : (
              <StyledCheckbox
                id={id}
                className={inset ? "inset" : variant}
                disabled={disabled}
                autoFocus={autoFocus}
                checked={state}
                name={String(label)}
                value={state}
                size={size}
                color={inset ? "default" : color}
                inputProps={{ "aria-label": String(label) }}
                mixed={mixed ? "~" : undefined}
                onChange={handleInputChange}
                onBlur={handleBlur}
              />
            )
          }
        />
      </StyledBooleanInput>
    );
  }
);

export default BooleanInput;
