import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import { CSSProperties, PropsWithChildren } from "react";

const MoreButton = dynamic(() => import("./MoreButton"));

const StyledFieldArea = styled.div`
  display: flex;
  flex: 1;
  position: relative;
`;

interface ValueFieldAreaProps {
  spacing: number;
  propertyPath?: string;
  moreIcon?: string;
  moreTooltip?: string;
  moreIconSize?: string;
  style?: CSSProperties;
  onMore?: (id: string, target: HTMLElement) => void;
}

const ValueFieldArea = (
  props: PropsWithChildren<ValueFieldAreaProps>
): JSX.Element => {
  const {
    spacing,
    propertyPath,
    moreIcon,
    moreTooltip,
    moreIconSize,
    style,
    onMore,
    children,
  } = props;
  return (
    <StyledFieldArea
      className={StyledFieldArea.displayName}
      style={{
        paddingTop: spacing * 0.5,
        paddingBottom: spacing * 0.5,
        ...style,
      }}
    >
      {children}
      {moreIcon && onMore && (
        <MoreButton
          propertyPath={propertyPath}
          moreTooltip={moreTooltip}
          moreIconSize={moreIconSize}
          onMore={onMore}
        />
      )}
    </StyledFieldArea>
  );
};

export default ValueFieldArea;
