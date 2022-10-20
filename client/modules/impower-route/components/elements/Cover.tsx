import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { PropsWithChildren, useCallback, useState } from "react";
import CheckSolidIcon from "../../../../resources/icons/solid/check.svg";
import PlusSolidIcon from "../../../../resources/icons/solid/plus.svg";
import { hexToHsla, hslaToHex } from "../../../impower-core";
import { Alignment, getAlignmentStyle } from "../../../impower-data-store";
import { FontIcon } from "../../../impower-icon";
import { Pattern, PatternName } from "../../../impower-pattern";
import { Breakpoint } from "../../styles/breakpoint";
import RotateAnimation from "../animations/RotateAnimation";
import { LazyImage } from "./LazyImage";

const StyledCoverArea = styled.div`
  position: relative;
  width: 100%;
  padding-bottom: 40%;
  overflow: hidden;

  margin-bottom: -8%;
`;

const StyledCoverBackgroundCorner = styled.div<{ bgcolor: string }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;

  &:before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    border-style: solid;
    border-color: #ffffff00 ${(props): string => props.bgcolor};
    border-width: 0 0 ${(props): string => props.theme.spacing(8)}
      ${(props): string => props.theme.spacing(8)};
    pointer-events: none;
  }

  &.folded:after {
    border-width: 0 0 ${(props): string => props.theme.spacing(8)}
      ${(props): string => props.theme.spacing(8)};
  }

  &:after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    border-style: solid;
    border-color: ${(props): string => props.bgcolor}
      ${(props): string => props.bgcolor};
    border-width: 0;
    transition: border-width 0.2s;
    pointer-events: none;
  }
`;

const StyledCoverBackground = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;

const StyledCoverForeground = styled.div<{ bgcolor: string }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;

  &.folded:before {
    border-width: 0 0 ${(props): string => props.theme.spacing(8)}
      ${(props): string => props.theme.spacing(8)};
  }

  &:before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    border-style: solid;
    border-color: ${(props): string => props.theme.colors.black20}
      ${(props): string => props.theme.colors.black50};
    pointer-events: none;
    box-shadow: ${(props): string => props.theme.shadows[6]};
    border-width: 0;
    transition: border-width 0.2s;
  }
`;

const StyledDarkOverlay = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;
`;

const StyledLogoArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  padding: ${(props): string => props.theme.spacing(2)};
  margin-bottom: 8%;
  pointer-events: none;
`;

const StyledLogoTypography = styled(Typography)`
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  color: white;
  text-align: center;
  padding: 0 ${(props): string => props.theme.spacing(4)};
`;

const StyledCoverButton = styled(Button)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  text-align: center;
  white-space: pre;
  line-height: 1.2rem;
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  color: white;
  padding: 0;

  position: relative;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledLikeButton = styled(Button)`
  position: absolute;
  top: 0;
  left: 0;
  width: ${(props): string => props.theme.spacing(8)};
  height: ${(props): string => props.theme.spacing(8)};
  border-radius: inherit;
  text-align: center;
  white-space: pre;
  line-height: 1.2rem;
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  color: white;
  padding: 0;

  position: relative;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledFontIconArea = styled.div`
  padding-bottom: ${(props): string => props.theme.spacing(1)};
  position: relative;
`;

interface CoverProps {
  backgroundColor?: string;
  pattern?: string;
  patternScale?: number;
  logoSrc?: string;
  coverSrc?: string;
  logoAlignment?: Alignment;
  folded?: boolean;
  breakpoint?: Breakpoint;
  scrollY?: number;
  name?: string;
  logoWidth?: string | number;
  onFolded?: (folded: boolean) => void;
  onClick?: () => void;
  getPlaceholderUrl?: (fileUrl: string) => string;
}

const Cover = (props: PropsWithChildren<CoverProps>): JSX.Element => {
  const {
    backgroundColor,
    pattern,
    patternScale = 1,
    logoSrc,
    coverSrc,
    logoAlignment = Alignment.MiddleCenter,
    folded,
    breakpoint,
    name,
    logoWidth = "70%",
    children,
    onFolded = (): void => null,
    onClick,
    getPlaceholderUrl = (): string => "",
  } = props;
  const theme = useTheme();
  const [internalFolded, setInternalFolded] = useState(false);

  const handleFolded = useCallback(
    (folded: boolean): void => {
      setInternalFolded(folded);
      onFolded(folded);
    },
    [onFolded]
  );

  const isFolded = folded !== undefined ? folded : internalFolded;

  const animationClass = backgroundColor ? "" : "MuiSkeleton-pulse";
  const foldedClass = isFolded ? "folded" : "";
  const validBackgroundColor = backgroundColor || "#FFFFFF";

  return (
    <StyledCoverArea
      className={StyledCoverArea.displayName}
      style={{
        marginBottom: breakpoint <= Breakpoint.sm ? 0 : undefined,
      }}
    >
      <StyledCoverBackground
        className={[animationClass, foldedClass].join(" ")}
        style={{
          backgroundColor: coverSrc
            ? hslaToHex({ ...hexToHsla(validBackgroundColor), a: 0 })
            : validBackgroundColor,
        }}
      >
        {!coverSrc && pattern && patternScale > 0 && (
          <Pattern pattern={pattern as PatternName} size={patternScale} />
        )}
        <StyledDarkOverlay
          className={StyledDarkOverlay.displayName}
          style={{
            backgroundColor: coverSrc ? undefined : theme.colors.black20,
          }}
        >
          {coverSrc && (
            <LazyImage
              src={coverSrc}
              placeholder={getPlaceholderUrl(coverSrc)}
              objectFit="cover"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
              }}
            />
          )}
        </StyledDarkOverlay>
      </StyledCoverBackground>
      <StyledLogoArea
        style={{
          ...getAlignmentStyle(logoAlignment),
          marginBottom: breakpoint <= Breakpoint.sm ? 0 : undefined,
        }}
      >
        {logoSrc && (
          <LazyImage
            src={logoSrc}
            placeholder={getPlaceholderUrl(logoSrc)}
            style={{
              maxWidth: logoWidth,
              pointerEvents: "none",
            }}
          />
        )}
        {!logoSrc && name && (
          <StyledLogoTypography
            variant="h3"
            style={{
              fontSize:
                breakpoint <= Breakpoint.sm
                  ? theme.typography.h4.fontSize
                  : undefined,
            }}
          >
            {name}
          </StyledLogoTypography>
        )}
      </StyledLogoArea>
      <StyledCoverBackgroundCorner
        className={isFolded ? "folded" : undefined}
        bgcolor={validBackgroundColor}
      />
      <StyledCoverForeground
        className={isFolded ? "folded" : undefined}
        bgcolor={validBackgroundColor}
      >
        {children}
        {!children && (
          <>
            {onClick && (
              <StyledCoverButton
                className={StyledCoverButton.displayName}
                onClick={onClick}
              />
            )}
            <StyledLikeButton
              className={StyledCoverButton.displayName}
              onClick={(): void => handleFolded(!isFolded)}
            >
              <StyledFontIconArea>
                {isFolded ? (
                  <RotateAnimation
                    key={`Remove From Library`}
                    initial={180}
                    animate={0}
                    exit={180}
                    duration={0.1}
                    style={{ width: 20, height: 20 }}
                  >
                    <FontIcon
                      aria-label={`Remove From Library`}
                      size={theme.fontSize.smallIcon}
                    >
                      <CheckSolidIcon />
                    </FontIcon>
                  </RotateAnimation>
                ) : (
                  <RotateAnimation
                    key={`Add To Library`}
                    initial={-180}
                    animate={0}
                    exit={-180}
                    duration={0.1}
                    style={{ width: 20, height: 20 }}
                  >
                    <FontIcon
                      aria-label={`Add To Library`}
                      size={theme.fontSize.smallIcon}
                    >
                      <PlusSolidIcon />
                    </FontIcon>
                  </RotateAnimation>
                )}
              </StyledFontIconArea>
            </StyledLikeButton>
          </>
        )}
      </StyledCoverForeground>
    </StyledCoverArea>
  );
};

export default Cover;
