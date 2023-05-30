import styled from "@emotion/styled";
import React, { useCallback, useEffect, useState } from "react";
import { TextFieldDefault, TextFieldDefaultProps } from "./TextField.default";

const StyledColorInput = styled.div`
  display: flex;
  user-select: none;
`;

interface ColorInputProps {
  label?: string;
  type: "number" | "text";
  value: number | string;
  max?: number;
  min?: number;
  onChange: (e: React.ChangeEvent, value: number | string) => void;
  children?: (props: TextFieldDefaultProps) => JSX.Element | null;
}

export const ColorInput = React.memo((props: ColorInputProps): JSX.Element => {
  const {
    label,
    type,
    value,
    max,
    min,
    onChange,
    children = TextFieldDefault,
  } = props;

  const getDisplayValue = useCallback(
    (v: number | string): number | string => {
      if (typeof v === "string") {
        if (v && !v.startsWith("#")) {
          return `#${v}`;
        }
        return v;
      }
      if (max === 100) {
        return Math.round(v * 100);
      }
      return Math.round(v);
    },
    [max]
  );

  const getSelectedValue = useCallback(
    (v: number | string): number | string => {
      if (typeof v === "string") {
        return v;
      }
      if (max === 100) {
        return v / 100;
      }
      return v;
    },
    [max]
  );

  const [displayValue, setDisplayValue] = useState(getDisplayValue(value));

  useEffect(() => {
    setDisplayValue(getDisplayValue(value));
  }, [value, getDisplayValue]);

  const handleChange = useCallback(
    (e: React.ChangeEvent, inputValue: string): void => {
      if (type === "text" || typeof inputValue === "string") {
        setDisplayValue(inputValue);
      } else {
        const newValue = Math.max(min, Math.min(max, Number(inputValue)));
        const selectedValue = getSelectedValue(newValue);
        setDisplayValue(getDisplayValue(selectedValue));
      }
    },
    [getDisplayValue, getSelectedValue, max, min, type]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent, inputValue: string): void => {
      if (type === "text") {
        setDisplayValue(inputValue);
        if (onChange) {
          onChange(e, inputValue);
        }
      } else {
        const newValue = Math.max(min, Math.min(max, Number(inputValue)));
        const selectedValue = getSelectedValue(newValue);
        setDisplayValue(getDisplayValue(selectedValue));
        if (onChange) {
          onChange(e, selectedValue);
        }
      }
    },
    [getDisplayValue, getSelectedValue, max, min, onChange, type]
  );

  return (
    <StyledColorInput className={StyledColorInput.displayName}>
      {children({
        label,
        type,
        value: displayValue,
        onChange: handleChange,
        onBlur: handleBlur,
      })}
    </StyledColorInput>
  );
});
