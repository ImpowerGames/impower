import styled from "@emotion/styled";
import React, { useCallback, useState } from "react";
import DataStringInput from "./DataStringInput";

const StyledHiddenTextFieldSpacer = styled.div`
  line-height: ${(props): React.ReactText =>
    props.theme.typography.body1.lineHeight};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  font-size: ${(props): React.ReactText =>
    props.theme.typography.body1.fontSize};
  letter-spacing: 0;
  padding: 0;
  white-space: nowrap;
  visibility: hidden;
`;

const StyledDataNameInput = styled.div`
  flex: 1 1 auto;
  position: absolute;
  width: 100%;

  display: flex;
  align-items: center;
`;

interface DataNameInputProps {
  name: string;
  onChange?: (e: React.ChangeEvent, name: string) => void;
  onBlur?: (e: React.FocusEvent, name: string) => void;
}

const DataNameInput = React.memo(
  (props: DataNameInputProps): JSX.Element | null => {
    const { name, onChange, onBlur } = props;

    const [state, setState] = useState(name);

    const handleChange = useCallback(
      (e: React.ChangeEvent, newValue: string) => {
        setState(newValue);
        if (onChange) {
          onChange(e, newValue);
        }
      },
      [onChange]
    );

    return (
      <>
        <StyledHiddenTextFieldSpacer
          className={StyledHiddenTextFieldSpacer.displayName}
        >
          {state}
        </StyledHiddenTextFieldSpacer>
        <StyledDataNameInput className={StyledDataNameInput.displayName}>
          <DataStringInput
            placeholder={name}
            defaultValue={name}
            onChange={handleChange}
            onBlur={onBlur}
          />
        </StyledDataNameInput>
      </>
    );
  }
);

export default DataNameInput;
