import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import React from "react";
import GamepadSolidIcon from "../../../../resources/icons/solid/gamepad.svg";
import { ProjectDocument } from "../../../impower-data-store";
import { FontIcon } from "../../../impower-icon";
import FadeAnimation from "../animations/FadeAnimation";

const StyledPlayerPreviewArea = styled(FadeAnimation)`
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  left: 0;
`;

const StyledButtonBackground = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  left: 0;
  background-color: ${(props): string => props.theme.colors.black50};
  display: flex;
  align-items: stretch;
`;

const StyledForeground = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;

  border-radius: ${(props): string => props.theme.spacing(10)};
  padding: ${(props): string => props.theme.spacing(2)}
    ${(props): string => props.theme.spacing(4)};
  background-color: ${(props): string => props.theme.colors.black70};
  ${StyledPlayerPreviewArea}:hover & {
    background-color: ${(props): string => props.theme.colors.black80};
  }
  transition: background-color 0.2s ease;
  z-index: 1;
`;

const StyledPlayerPreviewButtonContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const StyledPlayerPreviewTypography = styled(Typography)`
  white-space: nowrap;
  color: white;
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  white-space: pre;
  padding-left: ${(props): string => props.theme.spacing(3)};
`;

const StyledButton = styled(Button)`
  flex: 1;
`;

interface PlayerPreviewProps {
  doc?: ProjectDocument;
  backgroundPosition?: "left top" | "center" | "center top" | "left center";
  backgroundSize?:
    | "auto"
    | "100% auto"
    | "auto 100%"
    | "contain"
    | "cover"
    | "100% 100%";
  onPlay?: () => void;
}

const PlayerPreview = React.memo((props: PlayerPreviewProps) => {
  const {
    doc,
    backgroundPosition = "center",
    backgroundSize = "cover",
    onPlay,
  } = props;
  const playGameText = "Play Game";
  return (
    <StyledPlayerPreviewArea
      className={StyledPlayerPreviewArea.displayName}
      initial={0}
      animate={1}
      exit={0}
      delay={0.5}
      duration={0.3}
      style={{
        backgroundImage: doc ? `url(${doc?.preview?.fileUrl})` : undefined,
        backgroundPosition,
        backgroundSize,
        backgroundRepeat: "no-repeat",
      }}
    >
      <StyledButtonBackground>
        {doc && (
          <StyledButton onClick={onPlay}>
            <StyledPlayerPreviewButtonContent
              className={StyledPlayerPreviewButtonContent.displayName}
            >
              <StyledForeground>
                <FontIcon aria-label={playGameText} color="white" size={30}>
                  <GamepadSolidIcon />
                </FontIcon>
                <StyledPlayerPreviewTypography
                  className={StyledPlayerPreviewTypography.displayName}
                  variant="button"
                  style={{ fontSize: "1.5rem" }}
                >
                  {playGameText}
                </StyledPlayerPreviewTypography>
              </StyledForeground>
            </StyledPlayerPreviewButtonContent>
          </StyledButton>
        )}
      </StyledButtonBackground>
    </StyledPlayerPreviewArea>
  );
});

export default PlayerPreview;
