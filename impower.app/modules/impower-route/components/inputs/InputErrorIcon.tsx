import styled from "@emotion/styled";
import { PropsWithChildren } from "react";
import ExclamationSolidIcon from "../../../../resources/icons/solid/exclamation.svg";
import { FontIcon } from "../../../impower-icon";

const StyledErrorIconArea = styled.div`
  position: absolute;
  top: 0;
  left: -24px;
  bottom: 0;
  display: flex;
  align-items: center;
  color: ${(props): string => props.theme.palette.error.light};
`;

interface InputErrorIconProps {
  error: string | null;
}

const InputErrorIcon = (
  props: PropsWithChildren<InputErrorIconProps>
): JSX.Element => {
  const { error } = props;
  return (
    <>
      {error && (
        <StyledErrorIconArea className={StyledErrorIconArea.displayName}>
          <FontIcon aria-label="Error" size={16}>
            <ExclamationSolidIcon />
          </FontIcon>
        </StyledErrorIconArea>
      )}
    </>
  );
};

export default InputErrorIcon;
