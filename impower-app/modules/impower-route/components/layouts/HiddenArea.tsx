import styled from "@emotion/styled";
import { PropsWithChildren } from "react";

const StyledHiddenArea = styled.div`
  visibility: hidden;
`;

interface HiddenAreaProps {
  pointerEvents?:
    | "fill"
    | "stroke"
    | "none"
    | "auto"
    | "inherit"
    | "initial"
    | "-moz-initial"
    | "revert"
    | "unset"
    | "all"
    | "painted"
    | "visible"
    | "visibleFill"
    | "visiblePainted"
    | "visibleStroke";
}

const HiddenArea = (props: PropsWithChildren<HiddenAreaProps>): JSX.Element => {
  const { pointerEvents = "none", children } = props;

  return (
    <StyledHiddenArea
      className={StyledHiddenArea.displayName}
      style={{ pointerEvents }}
    >
      {children}
    </StyledHiddenArea>
  );
};

export default HiddenArea;
