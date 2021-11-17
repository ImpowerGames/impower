import styled from "@emotion/styled";
import Card from "@material-ui/core/Card";
import CardActionArea from "@material-ui/core/CardActionArea";
import React, { useCallback } from "react";
import { AuthorAttributes } from "../../impower-auth";
import { ConfigParameters } from "../../impower-config";
import { PitchGoal } from "../../impower-data-store";
import { LazyHydrate } from "../../impower-hydration";
import { SvgData } from "../../impower-icon";
import PitchCardContent from "./PitchCardContent";
import PitchCardHeader from "./PitchCardHeader";
import PostCardActions from "./PostCardActions";

const StyledCard = styled(Card)`
  flex-shrink: 0;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  transition: none;
  will-change: transform;
  box-shadow: none;
  border-radius: 0;
`;

const StyledCardActionArea = styled(CardActionArea)<{
  component?: string;
}>`
  transition: none;
  display: flex;
  flex-direction: row;

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

const StyledScrollbarSpacer = styled.div`
  pointer-events: none;

  overflow-x: hidden;
  overflow-y: scroll;

  &::-webkit-scrollbar-track {
    background-color: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background-color: transparent;
  }
  scrollbar-color: transparent transparent;
`;

interface PitchCardLayoutProps {
  cardRef?: React.Ref<HTMLDivElement>;
  buttonRef?: React.Ref<HTMLButtonElement>;
  scrollbarSpacerRef?: React.Ref<HTMLDivElement>;
  titleRef?: React.Ref<HTMLDivElement>;
  openedActionsRef?: React.Ref<HTMLDivElement>;
  closedActionsRef?: React.Ref<HTMLDivElement>;
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  kudoed?: boolean;
  contributed?: boolean;
  liked?: boolean;
  disliked?: boolean;
  connectedTo?: boolean;
  connectedFrom?: boolean;
  preview?: boolean;
  connectionCount?: number;
  kudoCount?: number;
  contributionCount?: number;
  createdBy?: string;
  author?: AuthorAttributes;
  projectType?: string;
  name?: string;
  summary?: string;
  tags?: string[];
  delisted?: boolean;
  archived?: boolean;
  pitchedAt?: string;
  score?: number;
  pitchGoal?: PitchGoal;
  style?: React.CSSProperties;
  buttonStyle?: React.CSSProperties;
  scrollbarSpacerStyle?: React.CSSProperties;
  openedActionsStyle?: React.CSSProperties;
  closedActionsStyle?: React.CSSProperties;
  onOpen?: (e: React.MouseEvent, action: "contribute" | "kudo") => void;
  onOpenPostMenu?: (e: React.MouseEvent) => void;
  onOpenShareMenu?: (e: React.MouseEvent) => void;
  onLike?: (e: React.MouseEvent, liked: boolean) => void;
  onDislike?: (e: React.MouseEvent, disliked: boolean) => void;
  onChangeScore?: (e: React.MouseEvent, score: number) => void;
  onConnect?: (e: React.MouseEvent, connected: boolean) => void;
}

const PitchCardLayout = React.memo(
  (props: PitchCardLayoutProps): JSX.Element => {
    const {
      cardRef,
      buttonRef,
      scrollbarSpacerRef,
      titleRef,
      openedActionsRef,
      closedActionsRef,
      config,
      icons,
      createdBy,
      author,
      projectType,
      name,
      summary,
      tags,
      delisted,
      archived,
      pitchedAt,
      score,
      pitchGoal,
      kudoed,
      contributed,
      liked,
      disliked,
      connectedTo,
      connectedFrom,
      connectionCount,
      kudoCount,
      contributionCount,
      preview,
      style,
      buttonStyle,
      scrollbarSpacerStyle,
      openedActionsStyle,
      closedActionsStyle,
      onOpen,
      onOpenPostMenu,
      onOpenShareMenu,
      onLike,
      onDislike,
      onChangeScore,
      onConnect,
    } = props;

    const handleOpen = useCallback(
      (e: React.MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        if (onOpen) {
          onOpen(e, "contribute");
        }
      },
      [onOpen]
    );

    return (
      <LazyHydrate whenVisible>
        <StyledCard ref={cardRef} style={style}>
          <StyledCardActionArea
            ref={buttonRef}
            component="div"
            disableTouchRipple
            onClick={onOpen ? handleOpen : undefined}
            disabled={preview || !onOpen}
            style={buttonStyle}
          >
            <StyledCardActionAreaContent>
              <PitchCardHeader
                config={config}
                icons={icons}
                author={author}
                tags={tags}
                delisted={delisted}
                archived={archived}
                pitchedAt={pitchedAt}
                pitchGoal={pitchGoal}
                connectionCount={connectionCount}
                preview={preview}
                onOpenPostMenu={onOpenPostMenu}
              />
              <PitchCardContent
                titleRef={titleRef}
                config={config}
                projectType={projectType}
                name={name}
                summary={summary}
                tags={tags}
                delisted={delisted}
                archived={archived}
              />
              {!preview && (
                <PostCardActions
                  openedActionsRef={openedActionsRef}
                  closedActionsRef={closedActionsRef}
                  createdBy={createdBy}
                  score={score}
                  kudoed={kudoed}
                  contributed={contributed}
                  liked={liked}
                  disliked={disliked}
                  connectedTo={connectedTo}
                  connectedFrom={connectedFrom}
                  kudoCount={kudoCount}
                  contributionCount={contributionCount}
                  allowConnect={pitchGoal === PitchGoal.Collaboration}
                  allowContribute
                  allowKudo
                  openedActionsStyle={openedActionsStyle}
                  closedActionsStyle={closedActionsStyle}
                  onOpen={onOpen}
                  onOpenShareMenu={onOpenShareMenu}
                  onLike={onLike}
                  onDislike={onDislike}
                  onChangeScore={onChangeScore}
                  onConnect={onConnect}
                />
              )}
            </StyledCardActionAreaContent>
            <StyledScrollbarSpacer
              ref={scrollbarSpacerRef}
              style={scrollbarSpacerStyle}
            />
          </StyledCardActionArea>
        </StyledCard>
      </LazyHydrate>
    );
  }
);

export default PitchCardLayout;
