import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import { InputProps } from "@mui/material/Input";
import InputLabel from "@mui/material/InputLabel";
import { TextFieldProps as MuiTextFieldProps } from "@mui/material/TextField";
import React, { useCallback, useMemo, useState } from "react";

export interface TextFieldProps
  extends Omit<MuiTextFieldProps, "select" | "SelectProps" | "children"> {
  InputComponent?: React.ComponentType<InputProps>;
}

const TextField = React.forwardRef(
  (props: TextFieldProps, ref: React.Ref<HTMLDivElement>): JSX.Element => {
    const { InputComponent, ...textFieldProps } = props;
    const {
      autoComplete,
      autoFocus = false,
      className,
      color = "primary",
      defaultValue,
      disabled = false,
      error = false,
      FormHelperTextProps,
      fullWidth = false,
      helperText,
      id,
      InputLabelProps,
      inputProps,
      InputProps,
      inputRef,
      label,
      maxRows,
      minRows,
      multiline = false,
      name,
      onBlur,
      onChange,
      onFocus,
      placeholder,
      required = false,
      rows,
      type,
      value = "",
      variant = "outlined",
      ...other
    } = textFieldProps;

    const helperTextId = helperText && id ? `${id}-helper-text` : undefined;
    const inputLabelId = label && id ? `${id}-label` : undefined;

    const [focused, setFocused] = useState(false);

    const handleFocus = useCallback(
      (e) => {
        setFocused(true);
        if (onFocus) {
          onFocus(e);
        }
      },
      [onFocus]
    );

    const handleBlur = useCallback(
      (e) => {
        setFocused(false);
        if (onBlur) {
          onBlur(e);
        }
      },
      [onBlur]
    );

    const InputMore: Record<string, unknown> = useMemo(() => {
      const more: Record<string, unknown> = {};
      if (variant === "outlined") {
        if (InputLabelProps && typeof InputLabelProps.shrink !== "undefined") {
          more.notched = InputLabelProps.shrink;
        }
        if (label) {
          const displayRequired = InputLabelProps?.required ?? required;
          more.label = (
            <>
              {label}
              {displayRequired && "\u00a0*"}
            </>
          );
        }
      }
      if (placeholder && label && !value && !focused) {
        more.placeholder = "";
      }
      return more;
    }, [
      InputLabelProps,
      focused,
      label,
      placeholder,
      required,
      value,
      variant,
    ]);

    if (!InputComponent) {
      console.warn("Provide InputComponent prop");
      return null;
    }

    return (
      <FormControl
        className={["MuiTextField-root", className].filter(Boolean).join(" ")}
        disabled={disabled}
        error={error}
        fullWidth={fullWidth}
        ref={ref}
        required={required}
        color={color}
        variant={variant}
        {...other}
      >
        {label && (
          <InputLabel htmlFor={id} id={inputLabelId} {...InputLabelProps}>
            {label}
          </InputLabel>
        )}
        <InputComponent
          aria-describedby={helperTextId}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          defaultValue={defaultValue}
          fullWidth={fullWidth}
          multiline={multiline}
          name={name}
          rows={rows}
          maxRows={maxRows}
          minRows={minRows}
          type={type}
          value={value}
          id={id}
          inputRef={inputRef}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          inputProps={inputProps}
          {...InputMore}
          {...InputProps}
        />
        {helperText && (
          <FormHelperText id={helperTextId} {...FormHelperTextProps}>
            {helperText}
          </FormHelperText>
        )}
      </FormControl>
    );
  }
);

export default TextField;
