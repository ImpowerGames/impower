import React, { useCallback } from "react";

export interface TextFieldDefaultProps {
  label: string;
  value: string | number;
  type: "number" | "text";
  onChange: (e: React.ChangeEvent<HTMLInputElement>, value: string) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>, value: string) => void;
}

export const TextFieldDefault = React.memo(
  (props: TextFieldDefaultProps): JSX.Element => {
    const { label, value, onChange, onBlur } = props;
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>): void => {
        const inputValue = e.target.value;
        if (onChange) {
          onChange(e, inputValue);
        }
      },
      [onChange]
    );

    const handleBlur = useCallback(
      (e: React.FocusEvent<HTMLInputElement>): void => {
        const inputValue = e.target.value;
        if (onBlur) {
          onBlur(e, inputValue);
        }
      },
      [onBlur]
    );

    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <label htmlFor={label}>{label}</label>
        <input
          id={label}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
        />
      </div>
    );
  }
);
