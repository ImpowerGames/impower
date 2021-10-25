import styled from "@emotion/styled";
import FormControl from "@material-ui/core/FormControl";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import FormLabel from "@material-ui/core/FormLabel";
import Radio from "@material-ui/core/Radio";
import RadioGroup from "@material-ui/core/RadioGroup";
import React, { useCallback, useMemo } from "react";
import { StyledOptionArea } from "./RadioOptionArea";
import SelectOption, { getOptionHeight } from "./SelectOption";
import { StringInputProps } from "./StringInput";

const StyledFormControl = styled(FormControl)<{ component?: string }>``;

const StyledFormLabel = styled(FormLabel)<{ component?: string }>`
  margin-bottom: ${(props): string => props.theme.spacing(1)};
`;

const StyledRadioGroup = styled(RadioGroup)<{ component?: string }>``;

const StyledFormControlLabel = styled(FormControlLabel)`
  width: 100%;
  & .MuiFormControlLabel-label {
    width: 100%;
  }
`;

export interface RadioInputProps extends StringInputProps {
  options?: unknown[];
  actions?: unknown[];
  endAdornmentPosition?: "before" | "after" | "replace";
  getOptionLabel?: (option: unknown) => string;
  getOptionDescription?: (option: unknown) => string;
  getOptionIcon?: (option: unknown) => string;
  getOptionIconStyle?: (option: unknown) => {
    color?: string;
    fontSize?: string | number;
  };
  getOptionGroup?: (option: unknown) => string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  isOptionEqualToValue?: (option: unknown, other: unknown) => boolean;
  renderOptionIcon?: (option: unknown, icon: string) => React.ReactNode;
}

const RadioInput = React.memo((props: RadioInputProps): JSX.Element | null => {
  const {
    id,
    label,
    value,
    options,
    getOptionLabel,
    getOptionIcon,
    getOptionIconStyle,
    getOptionDescription,
    onChange,
    onDebouncedChange,
    isOptionEqualToValue,
    renderOptionIcon,
  } = props;

  const handleRadioChange = useCallback(
    (e: React.ChangeEvent, newValue: string | number): void => {
      if (onChange) {
        onChange(e, newValue);
      }
      if (onDebouncedChange) {
        onDebouncedChange(newValue);
      }
    },
    [onChange, onDebouncedChange]
  );

  const handleIsOptionEqualToValue = useCallback(
    (option: unknown, other: unknown): boolean => {
      if (isOptionEqualToValue) {
        return isOptionEqualToValue(option, other);
      }
      return option === other;
    },
    [isOptionEqualToValue]
  );

  const optionHeight = useMemo(
    () => getOptionHeight({ getOptionDescription, getOptionIcon, options }),
    [getOptionDescription, getOptionIcon, options]
  );

  return (
    <StyledFormControl id={id} component="fieldset" fullWidth>
      {label && <StyledFormLabel component="legend">{label}</StyledFormLabel>}
      <StyledRadioGroup
        aria-label={String(label)}
        name={String(label)}
        value={value}
        onChange={handleRadioChange}
      >
        {options.map((option) => (
          <StyledFormControlLabel
            key={JSON.stringify(option)}
            value={option}
            control={<Radio />}
            label={
              <StyledOptionArea style={{ minHeight: optionHeight }}>
                <SelectOption
                  option={option}
                  selected={handleIsOptionEqualToValue(value, option)}
                  getOptionLabel={getOptionLabel}
                  getOptionDescription={getOptionDescription}
                  getOptionIcon={getOptionIcon}
                  getOptionIconStyle={getOptionIconStyle}
                  renderOptionIcon={renderOptionIcon}
                  style={{ padding: 0 }}
                />
              </StyledOptionArea>
            }
          />
        ))}
      </StyledRadioGroup>
    </StyledFormControl>
  );
});

export default RadioInput;
