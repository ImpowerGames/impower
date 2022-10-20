import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Typography from "@mui/material/Typography";
import React, { useMemo } from "react";
import LogoFlatColor from "../../../resources/logos/logo-flat-color.svg";
import { ProjectDocument } from "../../impower-data-store";
import { layout } from "../../impower-route";
import Logo from "../../impower-route/components/elements/Logo";
import PostBackButton from "./PostBackButton";
import StickyTitle from "./StickyTitle";

const StyledAbsoluteArea = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  height: 100%;
  will-change: transform;
  z-index: 1;
  pointer-events: none;
`;

const StyledStickySpacer = styled.div`
  position: sticky;
  top: 0;
  min-height: ${(props): string => props.theme.minHeight.titleBar};
  pointer-events: none;
  z-index: 1;
`;

const StyledStickyBackground = styled.div`
  position: sticky;
  top: 0;
  bottom: 0;
  width: 100%;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
`;

const StyledAbsoluteBackground = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: white;
  height: ${(props): string => props.theme.minHeight.titleBar};
`;

const StyledHeader = styled.div`
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  height: ${(props): string => props.theme.minHeight.titleBar};
  position: sticky;
  top: 0;
  display: flex;
  align-items: flex-start;
  padding: ${(props): string => props.theme.spacing(0, 1)};
  pointer-events: none;
`;

const StyledTopWrapper = styled.div`
  pointer-events: none;
  position: absolute;
  top: 0;
  left: ${(props): string => props.theme.minHeight.titleBar};
  right: 0;
  height: 100%;
`;

const StyledTopStickyContent = styled.div`
  position: sticky;
  top: 0;
  padding: ${(props): string => props.theme.spacing(0, 1)};
`;

const StyledLabelArea = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
`;

const StyledLabelTypography = styled(Typography)<{ component?: string }>`
  font-weight: bold;
  overflow: hidden;
  line-height: 1;
`;

const StyledLogoArea = styled.div`
  padding: ${(props): string => props.theme.spacing(0, 1)};
  display: flex;
  align-items: center;
  pointer-events: auto;
`;

interface PostHeaderProps {
  headerRef?: React.Ref<HTMLDivElement>;
  titleRef?: React.Ref<HTMLDivElement>;
  spacerRef?: React.Ref<HTMLDivElement>;
  backgroundRef?: React.Ref<HTMLDivElement>;
  wrapperRef?: React.Ref<HTMLDivElement>;
  initiallyHidden?: boolean;
  label?: string;
  elevation?: number;
  fontSize?: number;
  titleY?: number;
  titleHeight?: number;
  delisted?: boolean;
  pitchDoc?: ProjectDocument;
  style?: React.CSSProperties;
  spacerStyle?: React.CSSProperties;
  onBack?: (e: React.MouseEvent) => void;
}

const PostHeader = React.memo((props: PostHeaderProps): JSX.Element => {
  const {
    headerRef,
    titleRef,
    spacerRef,
    backgroundRef,
    wrapperRef,
    initiallyHidden = false,
    label,
    elevation = 2,
    fontSize = 18,
    titleY = 135,
    titleHeight,
    pitchDoc,
    delisted,
    style,
    spacerStyle,
    onBack,
  } = props;

  const theme = useTheme();

  // add a little extra height to cover up descender letters that extend below the font's baseline like p's and q's
  const titleBarHeight = 56;
  const extraHeight = 2;
  const coverHeight = fontSize + extraHeight;
  const stickyTitleOffset =
    titleHeight !== undefined ? titleY + titleHeight - extraHeight : undefined;

  const currentHeaderStyle: React.CSSProperties = useMemo(
    () => ({
      display: initiallyHidden ? "none" : undefined,
      ...style,
    }),
    [initiallyHidden, style]
  );

  const currentTitleStyle: React.CSSProperties = useMemo(
    () => ({
      display: initiallyHidden ? "none" : undefined,
    }),
    [initiallyHidden]
  );

  const currentSpacerStyle: React.CSSProperties = useMemo(
    () => ({
      display: initiallyHidden ? "none" : undefined,
      boxShadow: theme.shadows[elevation],
      ...spacerStyle,
    }),
    [elevation, initiallyHidden, spacerStyle, theme.shadows]
  );

  const topWrapperOffset = (titleBarHeight - fontSize) * 0.5;

  const topWrapperStyle = useMemo(
    () => ({
      top: topWrapperOffset - 1,
      height:
        stickyTitleOffset !== undefined
          ? stickyTitleOffset - coverHeight - topWrapperOffset
          : undefined,
    }),
    [coverHeight, stickyTitleOffset, topWrapperOffset]
  );
  const logoAreaStyle = useMemo(() => ({ height: coverHeight }), [coverHeight]);
  const logoStyle = useMemo(
    () => ({ width: theme.spacing(4.5), height: theme.spacing(4.5) }),
    [theme]
  );
  const typographyStyle = useMemo(
    () => ({ fontSize, height: coverHeight }),
    [coverHeight, fontSize]
  );
  const stickyContentStyle = useMemo(
    () => ({
      top: `calc((${layout.size.minHeight.titleBar}px - ${coverHeight}px) * 0.5)`,
      height: fontSize,
    }),
    [coverHeight, fontSize]
  );
  const heightStyle = useMemo(() => ({ height: fontSize }), [fontSize]);

  return (
    <>
      <StyledAbsoluteArea ref={headerRef} style={currentHeaderStyle}>
        <StyledStickyBackground ref={backgroundRef}>
          <StyledAbsoluteBackground />
        </StyledStickyBackground>
        <StyledTopWrapper ref={wrapperRef} style={topWrapperStyle}>
          <StyledTopStickyContent style={stickyContentStyle}>
            <StyledLabelArea style={heightStyle}>
              <StyledLabelTypography
                variant="h6"
                component="h2"
                style={typographyStyle}
              >
                {label}
              </StyledLabelTypography>
              <StyledLogoArea style={logoAreaStyle}>
                <Logo href="/" style={logoStyle}>
                  <LogoFlatColor />
                </Logo>
              </StyledLogoArea>
            </StyledLabelArea>
          </StyledTopStickyContent>
        </StyledTopWrapper>
        <StyledHeader>
          <PostBackButton
            backUrl={`/pitch/${pitchDoc?.projectType}`}
            onBack={onBack}
          />
        </StyledHeader>
      </StyledAbsoluteArea>
      <StyledAbsoluteArea ref={titleRef} style={currentTitleStyle}>
        {stickyTitleOffset !== undefined && !delisted && (
          <StickyTitle
            title={pitchDoc?.name}
            fontSize={fontSize}
            titleOffset={stickyTitleOffset}
          />
        )}
      </StyledAbsoluteArea>
      <StyledStickySpacer ref={spacerRef} style={currentSpacerStyle} />
    </>
  );
});

export default PostHeader;
