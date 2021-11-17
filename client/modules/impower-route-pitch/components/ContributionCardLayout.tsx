import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Card from "@material-ui/core/Card";
import CardActionArea from "@material-ui/core/CardActionArea";
import Divider from "@material-ui/core/Divider";
import Typography from "@material-ui/core/Typography";
import React, { useCallback, useContext, useMemo } from "react";
import { AuthorAttributes } from "../../impower-auth";
import ConfigCache from "../../impower-config/classes/configCache";
import format from "../../impower-config/utils/format";
import { StorageFile } from "../../impower-core";
import { ContributionType } from "../../impower-data-store";
import { LazyHydrate } from "../../impower-hydration";
import { UserContext } from "../../impower-user";
import getContributionPostOptionLabels from "../utils/getContributionPostOptionLabels";
import { getTruncatedContent } from "../utils/getTruncatedContent";
import ContributionCardContent from "./ContributionCardContent";
import ContributionCardHeader from "./ContributionCardHeader";
import PostCardActions from "./PostCardActions";

const StyledCard = styled(Card)`
  pointer-events: auto;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  overflow: unset;
  will-change: transform;
`;

const StyledCardActionArea = styled(CardActionArea)<{
  component?: string;
}>`
  display: flex;
  transition: none;

  & .MuiCardActionArea-focusHighlight {
    display: none;
  }

  &.MuiTouchRipple-root {
    display: none;
  }

  &.Mui-focusVisible .MuiCardActionArea-focusHighlight {
    display: block;
  }

  @media (hover: hover) and (pointer: coarse) {
    &.MuiCardActionArea-root:hover .MuiCardActionArea-focusHighlight {
      display: none;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    &.Mui-disabled.MuiCardActionArea-root:hover
      .MuiCardActionArea-focusHighlight {
      display: none;
    }
    &.MuiCardActionArea-root:hover .MuiCardActionArea-focusHighlight {
      display: block;
    }
  }
`;

const StyledCardActionAreaContent = styled.div`
  pointer-events: auto;
  flex: 1;
  max-width: 100%;
`;

const StyledDivider = styled(Divider)``;

const StyledRelativeArea = styled.div`
  position: relative;
`;

const StyledFooterBottomDividerArea = styled.div`
  position: relative;
  bottom: 0;
  will-change: opacity;
`;

const StyledAbsoluteHeaderSentinel = styled.div`
  min-height: ${(props): string => props.theme.minHeight.titleBar};
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
`;

const StyledAbsoluteFooterCover = styled.div`
  pointer-events: none;
  width: 100%;
  height: 100vh;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: white;
  display: none;
`;

const StyledStickyHeaderArea = styled.div<{
  elevation?: number;
  preview?: boolean;
}>`
  min-height: calc(
    ${(props): string => props.theme.minHeight.titleBar} +
      ${(props): string => props.theme.spacing(1)}
  );
  position: sticky;
  top: ${(props): string => props.theme.spacing(-1)};
  left: 0;
  right: 0;
  z-index: 1;
  will-change: transform;

  &:before,
  &:after {
    content: "";
    display: block;
    height: ${(props): string => props.theme.spacing(1)};
    position: sticky;
  }

  &:before {
    top: calc(
      ${(props): string => props.theme.minHeight.titleBar} -
        ${(props): string => props.theme.spacing(1)}
    );
    ${(props): string =>
      props.preview
        ? ""
        : `box-shadow: ${props.theme.shadows[props.elevation]};`};
  }

  &:after {
    ${(props): string =>
      props.preview || props.elevation <= 0 ? "" : `background-color: white;`}
    top: 0;
    z-index: 2;
  }
`;

const StyledStickyHeaderContent = styled.div<{ preview?: boolean }>`
  ${(props): string => (props.preview ? "" : "background-color: white;")};
  height: ${(props): string => props.theme.minHeight.titleBar};
  position: sticky;
  top: 0;
  margin-top: ${(props): string => props.theme.spacing(-1)};
  z-index: 3;
`;

const StyledStickyFooterArea = styled.div`
  min-height: ${(props): string => props.theme.minHeight.titleBar};
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  will-change: transform;
`;

const StyledTruncationArea = styled.div`
  position: relative;
`;

const StyledContentArea = styled.div``;

const StyledTruncatedContent = styled.div`
  width: 100%;
`;

const StyledTruncatedIndicator = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: ${(props): string => props.theme.spacing(0, 1)};
  margin-top: ${(props): string => props.theme.spacing(-0.5)};
  margin-bottom: ${(props): string => props.theme.spacing(-0.5)};
`;

const StyledReadMoreTypography = styled(Typography)<{ component?: string }>`
  font-weight: 600;
  color: ${(props): string => props.theme.palette.secondary.main};
`;

interface ContributionCardLayoutProps {
  cardRef?: React.Ref<HTMLDivElement>;
  avatarUserRef?: React.Ref<HTMLDivElement>;
  avatarBackRef?: React.Ref<HTMLDivElement>;
  truncationAreaRef?: React.Ref<HTMLDivElement>;
  truncationContentRef?: React.Ref<HTMLDivElement>;
  headerRef?: React.Ref<HTMLDivElement>;
  headerSentinelRef?: React.Ref<HTMLDivElement>;
  footerRef?: React.Ref<HTMLDivElement>;
  footerCoverRef?: React.Ref<HTMLDivElement>;
  buttonRef?: React.Ref<HTMLButtonElement>;
  closedActionsRef?: React.Ref<HTMLDivElement>;
  openedActionsRef?: React.Ref<HTMLDivElement>;
  contentRef?: React.Ref<HTMLDivElement>;
  pitchId?: string;
  projectType?: string;
  liked?: boolean;
  disliked?: boolean;
  connectedTo?: boolean;
  connectedFrom?: boolean;
  followedUser?: boolean;
  admin?: boolean;
  author?: AuthorAttributes;
  targetCreatedBy?: string;
  createdBy?: string;
  contributionType?: ContributionType;
  content?: string;
  file?: StorageFile;
  waveform?: number[];
  aspectRatio?: number;
  square?: boolean;
  crop?: number;
  tags?: string[];
  createdAt?: string;
  score?: number;
  delisted?: boolean;
  showBackButton?: boolean;
  preview?: boolean;
  hideFooterCover?: boolean;
  style?: React.CSSProperties;
  buttonStyle?: React.CSSProperties;
  buttonContentStyle?: React.CSSProperties;
  openedActionsStyle?: React.CSSProperties;
  closedActionsStyle?: React.CSSProperties;
  onConnect?: (e: React.MouseEvent, connected: boolean) => void;
  onLike?: (e: React.MouseEvent, liked: boolean) => void;
  onDislike?: (e: React.MouseEvent, disliked: boolean) => void;
  onChangeScore?: (e: React.MouseEvent, score: number) => void;
  onOpen?: (e: React.MouseEvent) => void;
  onClose?: (e: React.MouseEvent) => void;
  onOpenPostMenu?: (e: React.MouseEvent) => void;
}

const ContributionCardLayout = React.memo(
  (props: ContributionCardLayoutProps): JSX.Element => {
    const {
      cardRef,
      avatarUserRef,
      avatarBackRef,
      truncationAreaRef,
      truncationContentRef,
      headerRef,
      headerSentinelRef,
      footerRef,
      footerCoverRef,
      buttonRef,
      closedActionsRef,
      openedActionsRef,
      contentRef,
      pitchId,
      projectType,
      author,
      targetCreatedBy,
      createdBy,
      contributionType,
      content,
      file,
      waveform,
      aspectRatio,
      square,
      crop,
      tags,
      createdAt,
      score,
      connectedTo,
      connectedFrom,
      followedUser,
      liked,
      disliked,
      delisted,
      showBackButton,
      preview,
      hideFooterCover,
      style,
      buttonStyle,
      buttonContentStyle,
      openedActionsStyle,
      closedActionsStyle,
      onConnect,
      onLike,
      onDislike,
      onChangeScore,
      onOpen,
      onClose,
      onOpenPostMenu,
    } = props;

    const [userState] = useContext(UserContext);
    const { uid } = userState;

    const isCreator = createdBy === uid;

    const handleOpen = useCallback(
      (e: React.MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        if (onOpen) {
          onOpen(e);
        }
      },
      [onOpen]
    );

    const theme = useTheme();
    const maxWidth = theme.breakpoints.values.sm;

    const isOP = targetCreatedBy === createdBy;

    const authorColor = isOP ? "primary" : "inherit";

    const authorStyle: React.CSSProperties = useMemo(
      () => ({
        opacity: isOP ? 1 : 0.9,
      }),
      [isOP]
    );

    const postOptions = getContributionPostOptionLabels({
      delisted,
      isCreator,
      followedUser,
    });

    const hasPostMenu = Object.keys(postOptions || {}).length > 0;

    const cardStyle: React.CSSProperties = useMemo(
      () => ({
        maxWidth,
        ...style,
      }),
      [maxWidth, style]
    );

    const cardActionsStyle: React.CSSProperties = useMemo(
      () => ({ padding: theme.spacing(1.5, 0, 1.5, 2) }),
      [theme]
    );

    const preamble =
      ConfigCache.instance.params?.messages[
        `pitched_${projectType}_preamble`
      ] || ConfigCache.instance.params?.messages.pitched_games_preamble;
    const truncationLimit = 300;
    const truncatedContent = getTruncatedContent(content, truncationLimit);
    const isTruncated =
      contributionType === "story" &&
      preview &&
      content.length > truncationLimit;
    const prefix =
      contributionType === "pitch"
        ? `${format(preamble, { tag: tags?.[0] })} `
        : undefined;
    const formattedContent = isTruncated ? `${truncatedContent}...` : content;

    const isImage = file?.fileUrl && file.fileType === "image/*";

    const headerElevation = isImage ? 0 : 2;

    return (
      <>
        <LazyHydrate whenVisible>
          <StyledCard ref={cardRef} elevation={0} style={cardStyle}>
            <StyledCardActionArea
              ref={buttonRef}
              component="div"
              disableTouchRipple
              onClick={onOpen ? handleOpen : undefined}
              disabled={!onOpen}
              style={buttonStyle}
            >
              <StyledCardActionAreaContent style={buttonContentStyle}>
                <StyledRelativeArea>
                  <StyledAbsoluteHeaderSentinel ref={headerSentinelRef} />
                </StyledRelativeArea>
                <StyledTruncationArea ref={truncationAreaRef}>
                  <StyledContentArea>
                    <StyledTruncatedContent ref={truncationContentRef}>
                      <StyledStickyHeaderArea
                        elevation={headerElevation}
                        ref={headerRef}
                        preview={preview}
                      >
                        <StyledStickyHeaderContent preview={preview}>
                          <ContributionCardHeader
                            avatarBackRef={avatarBackRef}
                            avatarUserRef={avatarUserRef}
                            pitchId={pitchId}
                            authorColor={authorColor}
                            authorStyle={authorStyle}
                            author={author}
                            createdAt={createdAt}
                            hasPostMenu={hasPostMenu}
                            showBackButton={showBackButton}
                            onOpenPostMenu={onOpenPostMenu}
                            onClose={onClose}
                          />
                        </StyledStickyHeaderContent>
                      </StyledStickyHeaderArea>
                      <ContributionCardContent
                        contributionType={contributionType}
                        contentRef={contentRef}
                        prefix={prefix}
                        content={formattedContent}
                        file={file}
                        waveform={waveform}
                        aspectRatio={aspectRatio}
                        square={square}
                        crop={crop}
                        preview={preview}
                      />
                      {isTruncated && (
                        <StyledTruncatedIndicator>
                          {" "}
                          <StyledReadMoreTypography variant="body2">{`READ MORE`}</StyledReadMoreTypography>
                        </StyledTruncatedIndicator>
                      )}
                      <StyledStickyFooterArea ref={footerRef}>
                        {!hideFooterCover && (
                          <StyledAbsoluteFooterCover ref={footerCoverRef} />
                        )}
                        <PostCardActions
                          closedActionsRef={closedActionsRef}
                          openedActionsRef={openedActionsRef}
                          createdBy={createdBy}
                          score={score}
                          liked={liked}
                          disliked={disliked}
                          connectedTo={connectedTo}
                          connectedFrom={connectedFrom}
                          style={cardActionsStyle}
                          openedActionsStyle={openedActionsStyle}
                          closedActionsStyle={closedActionsStyle}
                          allowConnect
                          allowKudo
                          onConnect={onConnect}
                          onLike={onLike}
                          onDislike={onDislike}
                          onChangeScore={onChangeScore}
                        />
                        <StyledFooterBottomDividerArea>
                          <StyledDivider absolute />
                        </StyledFooterBottomDividerArea>
                      </StyledStickyFooterArea>
                    </StyledTruncatedContent>
                  </StyledContentArea>
                </StyledTruncationArea>
              </StyledCardActionAreaContent>
            </StyledCardActionArea>
          </StyledCard>
        </LazyHydrate>
      </>
    );
  }
);

export default ContributionCardLayout;
