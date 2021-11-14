import styled from "@emotion/styled";
import React, { PropsWithChildren } from "react";
import CircleBackground from "../../../../resources/mascot/professor-background.svg";

const StyledMascotIllustration = styled.div`
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: ${(props): string => props.theme.spacing(0, 4)};
  min-width: 0;
  margin-top: ${(props): string => props.theme.spacing(-2)};
`;

const StyledChildrenArea = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  margin-top: 100%;
`;

const StyledIllustrationArea = styled.div<{ size: number }>`
  min-width: ${(props): number => props.size}px;
  min-height: ${(props): number => props.size}px;
  position: relative;
  transition: opacity 0.2s ease;
`;

const StyledIllustration = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;

interface MascotIllustrationProps {
  image?: React.ReactNode;
  size?: number;
  style?: React.CSSProperties;
}

const MascotIllustration = React.memo(
  (props: PropsWithChildren<MascotIllustrationProps>): JSX.Element => {
    const { image, size = 300, style, children } = props;

    return (
      <StyledMascotIllustration style={style}>
        <StyledIllustrationArea size={size}>
          <CircleBackground />
          <StyledIllustration>
            {image}
            <StyledChildrenArea>{children}</StyledChildrenArea>
          </StyledIllustration>
        </StyledIllustrationArea>
      </StyledMascotIllustration>
    );
  }
);

export default MascotIllustration;
