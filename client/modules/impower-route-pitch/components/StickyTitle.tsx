import styled from "@emotion/styled";
import Typography from "@material-ui/core/Typography";
import React, { useMemo } from "react";
import { layout } from "../../impower-route";

const StyledCoverWrapper = styled.div`
  z-index: 1;
  pointer-events: none;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100%;
`;

const StyledBottomStickyContent = styled.div`
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  padding: ${(props): string => props.theme.spacing(0, 1)};
  margin-left: ${(props): string => props.theme.minHeight.titleBar};
`;

const StyledStickyCover = styled.div`
  position: sticky;
  top: ${(props): string => props.theme.minHeight.titleBar};
  background-color: white;
  z-index: 1;
`;

const StyledTitleArea = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
`;

const StyledTitleTypography = styled(Typography)<{
  component?: string;
}>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
`;

const StyledSpacer = styled.div``;

interface StickyTitleProps {
  titleRef?: React.Ref<HTMLDivElement>;
  coverRef?: React.Ref<HTMLDivElement>;
  title?: React.ReactNode;
  fontSize?: number;
  titleOffset?: number;
}

const StickyTitle = React.memo((props: StickyTitleProps): JSX.Element => {
  const { titleRef, coverRef, title, fontSize = 18, titleOffset } = props;

  const coverHeight = fontSize + 2;

  const bottomSpacerStyle = useMemo(
    () => ({ minHeight: titleOffset }),
    [titleOffset]
  );
  const coverWrapperStyle = useMemo(
    () => ({
      height: titleOffset + coverHeight * 2,
      clipPath: `inset(0px 0px ${coverHeight}px 0px)`,
    }),
    [coverHeight, titleOffset]
  );
  const coverSpacerStyle = useMemo(
    () => ({ minHeight: titleOffset }),
    [titleOffset]
  );
  const coverStyle = useMemo(() => ({ height: coverHeight }), [coverHeight]);
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

  return (
    <>
      <StyledSpacer style={bottomSpacerStyle} />
      <StyledBottomStickyContent ref={titleRef} style={stickyContentStyle}>
        <StyledTitleArea>
          <StyledTitleTypography
            variant="h6"
            component="h2"
            style={typographyStyle}
          >
            {title}
          </StyledTitleTypography>
        </StyledTitleArea>
      </StyledBottomStickyContent>
      <StyledCoverWrapper ref={coverRef} style={coverWrapperStyle}>
        <StyledSpacer style={coverSpacerStyle} />
        <StyledStickyCover style={coverStyle} />
      </StyledCoverWrapper>
    </>
  );
});

export default StickyTitle;
