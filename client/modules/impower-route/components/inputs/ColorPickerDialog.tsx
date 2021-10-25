import styled from "@emotion/styled";
import Dialog from "@material-ui/core/Dialog";
import OutlinedInput from "@material-ui/core/OutlinedInput";
import React, { useCallback } from "react";
import { Color } from "../../../impower-core";
import {
  ColorPicker,
  TextFieldDefaultProps,
} from "../../../impower-react-color-picker";
import StringInput from "./StringInput";

const StyledColorPickerDialog = styled(Dialog)`
  will-change: transform;

  & .MuiDialog-paper {
    margin: 0;
    max-height: none;
  }
`;

const TextFieldComponent = React.memo(
  (props: TextFieldDefaultProps): JSX.Element => {
    const { label, type, value, onChange, onBlur } = props;
    return (
      <StringInput
        id={label}
        label={label}
        type={type}
        variant="outlined"
        InputComponent={OutlinedInput}
        size="small"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        style={{ marginTop: -4, marginBottom: -4 }}
      />
    );
  }
);

export interface ColorPickerDialogProps {
  open: boolean;
  color: Color;
  debounceInterval?: number;
  onClose: () => void;
  onChange: (e: React.ChangeEvent, value?: Color) => void;
  onDebouncedChange: (value: Color) => void;
}

const ColorPickerDialog = (props: ColorPickerDialogProps): JSX.Element => {
  const {
    open,
    color,
    debounceInterval,
    onClose,
    onChange,
    onDebouncedChange,
  } = props;
  const handleColorPickerChange = useCallback(
    (e: React.ChangeEvent, { hsla }): void => {
      if (onChange) {
        onChange(e, hsla);
      }
    },
    [onChange]
  );
  const handleDebouncedColorPickerChange = useCallback(
    ({ hsla }): void => {
      if (onDebouncedChange) {
        onDebouncedChange(hsla);
      }
    },
    [onDebouncedChange]
  );
  return (
    <StyledColorPickerDialog
      className={StyledColorPickerDialog.displayName}
      open={open}
      onClose={onClose}
    >
      <ColorPicker
        value={color}
        onChange={handleColorPickerChange}
        onDebouncedChange={handleDebouncedColorPickerChange}
        onClose={onClose}
        debounceInterval={debounceInterval}
        textField={(props: TextFieldDefaultProps): JSX.Element => (
          <TextFieldComponent {...props} />
        )}
      />
    </StyledColorPickerDialog>
  );
};

export default ColorPickerDialog;
