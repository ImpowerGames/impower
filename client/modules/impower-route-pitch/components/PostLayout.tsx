import styled from "@emotion/styled";
import React, { PropsWithChildren } from "react";

const StyledPostLayout = styled.div<{ compact?: boolean }>`
  pointer-events: auto;
  flex: 1;
  width: 100%;
  margin: auto;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  display: flex;
  min-height: 0;
  max-height: 100%;
  position: relative;
  backface-visibility: hidden;
  border-radius: ${(props): string =>
    props.compact ? "0" : props.theme.spacing(1)};
  background-color: white;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    border-radius: 0;
    max-width: 100%;
  }

  &.hide-scrollbar::-webkit-scrollbar-track {
    background-color: transparent;
  }
  &.hide-scrollbar::-webkit-scrollbar-thumb {
    background-color: transparent;
  }
  .hide-scrollbar {
    scrollbar-color: transparent transparent;
  }
`;
const StyledPostContent = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  height: fit-content;
  min-height: 100%;
  max-width: 100%;
`;

const StyledForceOverflow = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  min-height: calc(100% + 1px);
`;

const StyledScrollbarSpacer = styled.div`
  pointer-events: none;

  overflow-x: hidden;
  overflow-y: scroll;

  height: 100%;
  display: none;

  &::-webkit-scrollbar-track {
    background-color: #ababab;
  }
  &::-webkit-scrollbar-thumb {
    background-color: transparent;
  }
  scrollbar-color: #ababab transparent;
`;

interface PostLayoutProps {
  scrollbarSpacerRef?: React.Ref<HTMLDivElement>;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  scrollbarSpacerStyle?: React.CSSProperties;
  compact?: boolean;
}

const PostLayout = React.forwardRef(
  (
    props: PropsWithChildren<PostLayoutProps>,
    ref: React.ForwardedRef<HTMLDivElement>
  ): JSX.Element => {
    const {
      children,
      scrollbarSpacerRef,
      scrollbarSpacerStyle,
      style,
      compact,
    } = props;

    return (
      <StyledPostLayout ref={ref} style={style} compact={compact}>
        <StyledForceOverflow />
        <StyledPostContent>{children}</StyledPostContent>
        <StyledScrollbarSpacer
          ref={scrollbarSpacerRef}
          style={scrollbarSpacerStyle}
        />
      </StyledPostLayout>
    );
  }
);

export default PostLayout;
