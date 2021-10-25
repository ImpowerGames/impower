import styled from "@emotion/styled";
import React, { PropsWithChildren } from "react";

const StyledInstructionTooltipContent = styled.div`
  display: flex;
  white-space: pre;
  align-items: center;
  padding: ${(props): string => props.theme.spacing(1)}
    ${(props): string => props.theme.spacing(1.5)};
`;

interface InstructionTooltipContentProps {
  instruction: string;
}

const InstructionTooltipContent = (
  props: PropsWithChildren<InstructionTooltipContentProps>
): JSX.Element => {
  const { instruction, children } = props;

  return (
    <StyledInstructionTooltipContent
      className={StyledInstructionTooltipContent.displayName}
    >
      {instruction.split("{button}")[0]}
      {children}
      {instruction.split("{button}")[1]}
    </StyledInstructionTooltipContent>
  );
};

export default InstructionTooltipContent;
