import styled from "@emotion/styled";
import Input, { InputProps } from "@material-ui/core/Input";
import { InputBaseComponentProps } from "@material-ui/core/InputBase";
import { InputLabelProps } from "@material-ui/core/InputLabel";
import React, { useCallback, useState } from "react";
import TextField from "./TextField";

const StyledTextField = styled(TextField)`
  flex: 1 1 auto;

  & .MuiInputBase-input {
    font-size: ${(props): string => props.theme.fontSize.regular};
    font-family: ${(props): string => props.theme.typography.fontFamily};
    line-height: ${(props): React.ReactText =>
      props.theme.typography.body1.lineHeight};
    font-weight: ${(props): number => props.theme.fontWeight.semiBold};
    letter-spacing: 0;
    padding: 0;
    white-space: nowrap;
  }
`;

interface DataStringInputProps {
  inputRef?: React.Ref<HTMLInputElement>;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  id?: string;
  InputLabelProps?: InputLabelProps;
  InputProps?: InputProps;
  helperText?: React.ReactNode;
  loading?: boolean;
  inputProps?: InputBaseComponentProps;
  onChange?: (e: React.ChangeEvent, value: string) => void;
  onBlur?: (e: React.FocusEvent, value: string) => void;
}

const DataStringInput = React.memo(
  (props: DataStringInputProps): JSX.Element | null => {
    const {
      inputRef,
      id,
      placeholder,
      value = "",
      defaultValue = "",
      InputLabelProps,
      InputProps,
      helperText,
      inputProps,
      onChange,
      onBlur,
    } = props;

    const [state, setState] = useState(value);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setState(newValue);
        if (onChange) {
          onChange(e, newValue);
        }
      },
      [onChange]
    );
    const handleBlur = useCallback(
      (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const validValue = e.target.value || state || value || defaultValue;
        if (onBlur) {
          onBlur(e, validValue);
        }
      },
      [onBlur, state, defaultValue, value]
    );

    return (
      <StyledTextField
        className={StyledTextField.displayName}
        inputRef={inputRef}
        id={id}
        variant="standard"
        InputComponent={Input}
        size="small"
        value={state}
        placeholder={placeholder}
        multiline={false}
        autoFocus
        fullWidth
        inputProps={{
          ...inputProps,
          // Turn off default browser auto-complete
          autoComplete: "new-password",
          maxLength: 50,
        }}
        InputLabelProps={InputLabelProps}
        // eslint-disable-next-line react/jsx-no-duplicate-props
        InputProps={{
          ...InputProps,
          disableUnderline: true,
        }}
        helperText={helperText}
        onChange={handleChange}
        onKeyDown={(e): void => {
          if (e.key === "Enter") {
            (e.target as HTMLElement).blur();
          }
        }}
        onFocus={(e): void => {
          e.target.select();
        }}
        onBlur={(e): void => {
          handleBlur(e);
        }}
      />
    );
  }
);

export default DataStringInput;
