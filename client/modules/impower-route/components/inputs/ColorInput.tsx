import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Color, hexToHsla, hslaToHex, isColor } from "../../../impower-core";
import ColorMiniPreview from "./ColorMiniPreview";
import { StringDialogProps } from "./StringDialog";
import StringInput, { StringInputProps } from "./StringInput";

export interface ColorInputProps extends StringInputProps {
  value?: Color | string;
  endAdornmentPosition?: "before" | "after" | "replace";
  onChange?: (e: React.ChangeEvent, value?: Color | string) => void;
  onDebouncedChange?: (value?: Color | string) => void;
  onBlur?: (e: React.FocusEvent, value?: Color | string) => void;
}

const ColorInput = React.memo((props: ColorInputProps): JSX.Element | null => {
  const {
    variant,
    inset,
    InputComponent,
    size,
    backgroundColor,
    label,
    tooltip,
    disabled,
    autoFocus,
    value,
    mixed,
    characterCountLimit,
    InputProps,
    helperText,
    moreInfoPopup,
    loading,
    endAdornmentPosition = "after",
    debounceInterval,
    onChange,
    onDebouncedChange,
    onBlur,
    onKeyDown,
  } = props;

  const [state, setState] = useState<Color>(
    typeof value === "string" ? hexToHsla(value) : value
  );
  const [hexValue, setHexValue] = useState<string>(
    typeof value === "string" ? value : hslaToHex(value)
  );

  useEffect(() => {
    setState(typeof value === "string" ? hexToHsla(value) : value);
    setHexValue(typeof value === "string" ? value : hslaToHex(value));
  }, [value]);

  const type = typeof value === "string" ? "string" : "object";

  const handleChange = useCallback(
    (e: React.ChangeEvent, newValue: Color): void => {
      if (isColor(newValue)) {
        if (type === "object") {
          if (onChange) {
            onChange(e, newValue);
          }
        }
        if (type === "string") {
          if (onChange) {
            onChange(e, hslaToHex(newValue));
          }
        }
      }
    },
    [onChange, type]
  );

  const handleDebouncedChange = useCallback(
    (newValue: Color): void => {
      if (isColor(newValue)) {
        if (type === "object") {
          if (onDebouncedChange) {
            onDebouncedChange(newValue);
          }
        }
        if (type === "string") {
          if (onDebouncedChange) {
            onDebouncedChange(hslaToHex(newValue));
          }
        }
      }
    },
    [onDebouncedChange, type]
  );

  const handleBlurStringValue = useCallback(
    async (e: React.FocusEvent, newValue: string): Promise<void> => {
      const getColorHsl = (
        await import("../../../impower-react-color-picker/utils/getColorHsl")
      ).default;
      const getColorHex = (
        await import("../../../impower-react-color-picker/utils/getColorHex")
      ).default;
      const newColor = getColorHsl(newValue);
      const newHex = getColorHex(newValue);
      setState(newColor);
      setHexValue(newHex);
      if (isColor(newColor)) {
        if (type === "object") {
          if (onDebouncedChange) {
            onDebouncedChange(newColor);
          }
          if (onBlur) {
            onBlur(e, newColor);
          }
        }
        if (type === "string") {
          if (onDebouncedChange) {
            onDebouncedChange(newHex);
          }
          if (onBlur) {
            onBlur(e, newHex);
          }
        }
      }
    },
    [onBlur, onDebouncedChange, type]
  );

  const ColorInputProps = useMemo(
    () => ({
      endAdornment: (
        <>
          {endAdornmentPosition === "before" && InputProps?.endAdornment}
          {endAdornmentPosition === "replace" ? (
            InputProps?.endAdornment
          ) : (
            <ColorMiniPreview
              value={state}
              interactable={true}
              debounceInterval={debounceInterval}
              onChange={handleChange}
              onDebouncedChange={handleDebouncedChange}
            />
          )}
          {endAdornmentPosition === "after" && InputProps?.endAdornment}
        </>
      ),
    }),
    [
      InputProps?.endAdornment,
      state,
      debounceInterval,
      endAdornmentPosition,
      handleChange,
      handleDebouncedChange,
    ]
  );

  const DialogProps = useMemo(
    () =>
      ({
        autoSave: true,
      } as Partial<StringDialogProps>),
    []
  );

  return (
    <>
      <StringInput
        variant={variant}
        inset={inset}
        InputComponent={InputComponent}
        size={size}
        backgroundColor={backgroundColor}
        label={label}
        tooltip={tooltip}
        disabled={disabled}
        autoFocus={autoFocus}
        value={hexValue}
        characterCountLimit={characterCountLimit}
        InputProps={ColorInputProps}
        helperText={helperText}
        moreInfoPopup={moreInfoPopup}
        loading={loading}
        mixed={mixed}
        DialogProps={DialogProps}
        textTransform="lowercase"
        onBlur={handleBlurStringValue}
        onKeyDown={onKeyDown}
      />
    </>
  );
});

export default ColorInput;
