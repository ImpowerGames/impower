import styled from "@emotion/styled";
import React, { PropsWithChildren, useMemo } from "react";
import FadeAnimation from "../../impower-route/components/animations/FadeAnimation";

const StyledQueryHeader = styled(FadeAnimation)`
  display: flex;
  height: ${(props): string => props.theme.minHeight.filterToolbar};
  width: 100%;
  position: relative;
`;

const StyledQueryHeaderContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
  padding-top: 13px;
  padding-bottom: 7px;
  padding-left: ${(props): string => props.theme.spacing(2)};
  padding-right: ${(props): string => props.theme.spacing(2)};
  display: flex;
  color: black;
  contain: paint size layout style;
`;

interface QueryHeaderProps {
  id?: string;
  contentRef?: React.Ref<HTMLDivElement>;
  disabled?: boolean;
  style?: React.CSSProperties;
}

const QueryHeader = React.memo(
  (props: PropsWithChildren<QueryHeaderProps>): JSX.Element => {
    const { id, contentRef, disabled, style, children } = props;
    const headerStyle: React.CSSProperties = useMemo(
      () => ({ pointerEvents: disabled ? "none" : undefined, ...style }),
      [disabled, style]
    );
    return (
      <StyledQueryHeader
        initial={disabled ? 0 : 1}
        animate={disabled ? 0 : 1}
        duration={0.15}
        style={headerStyle}
      >
        <StyledQueryHeaderContent id={id} ref={contentRef}>
          {children}
        </StyledQueryHeaderContent>
      </StyledQueryHeader>
    );
  }
);

export default QueryHeader;
