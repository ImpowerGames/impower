import styled from "@emotion/styled";
import Divider from "@material-ui/core/Divider";
import ToggleButton from "@material-ui/core/ToggleButton";
import ToggleButtonGroup from "@material-ui/core/ToggleButtonGroup";
import React, { useCallback, useContext, useRef, useState } from "react";
import AlignCenterRegularIcon from "../../../../resources/icons/regular/align-center.svg";
import BoldRegularIcon from "../../../../resources/icons/regular/bold.svg";
import FontRegularIcon from "../../../../resources/icons/regular/font.svg";
import HashtagRegularIcon from "../../../../resources/icons/regular/hashtag.svg";
import HouseRegularIcon from "../../../../resources/icons/regular/house.svg";
import ItalicRegularIcon from "../../../../resources/icons/regular/italic.svg";
import ListCheckRegularIcon from "../../../../resources/icons/regular/list-check.svg";
import ListUlRegularIcon from "../../../../resources/icons/regular/list-ul.svg";
import MessageDotsRegularIcon from "../../../../resources/icons/regular/message-dots.svg";
import PersonRunningRegularIcon from "../../../../resources/icons/regular/person-running.svg";
import UnderlineRegularIcon from "../../../../resources/icons/regular/underline.svg";
import VideoArrowUpRightRegularIcon from "../../../../resources/icons/regular/video-arrow-up-right.svg";
import WandMagicSparklesRegularIcon from "../../../../resources/icons/regular/wand-magic-sparkles.svg";
import { FontIcon } from "../../../impower-icon";
import { colors } from "../../../impower-script-editor";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { panelChangeEditorState } from "../../types/actions/panelActions";

const StyledKeyboardTrigger = styled.input`
  position: fixed;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  font-size: 16px;
  opacity: 0;
  pointer-events: none;
`;

const StyledSnippetToolbar = styled.div`
  width: 100%;
  height: 100%;
  pointer-events: auto;
`;

const StyledSnippetContent = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
  color: white;
`;

const StyledToggleButton = styled(ToggleButton)`
  color: inherit;
  opacity: 1;
  font-size: 18px;

  &.Mui-selected {
    color: inherit;
    opacity: 1;
    background-color: rgba(0, 0, 0, 0.25);
  }

  &.Mui-selected:hover {
    background-color: rgba(0, 0, 0, 0.25);
  }

  &.Mui-disabled {
    color: inherit;
    opacity: 0.25;
  }

  border-left-width: 0;
  border-radius: 0;

  &:first-of-type {
    border-left-width: 1px;
    border-top-left-radius: ${(props): string => props.theme.spacing(1)};
    border-bottom-left-radius: ${(props): string => props.theme.spacing(1)};
  }

  &:last-of-type {
    border-top-right-radius: ${(props): string => props.theme.spacing(1)};
    border-bottom-right-radius: ${(props): string => props.theme.spacing(1)};
  }
`;

const StyledTypeToggleButton = styled(StyledToggleButton)`
  border: none;
  min-width: ${(props): string => props.theme.spacing(4.5)};
`;

const StyledMainToggleButton = styled(StyledToggleButton)`
  flex: 1;
`;

const StyledToggleButtonGroup = styled(ToggleButtonGroup)`
  margin: ${(props): string => props.theme.spacing(0.5)};
  border: 0;
  &.Mui-disabled {
    border: 0;
  }
`;

const StyledMainToggleButtonGroup = styled(StyledToggleButtonGroup)`
  flex: 1;
`;

const SnippetToolbar = React.memo((): JSX.Element => {
  const [state, dispatch] = useContext(ProjectEngineContext);
  const windowType = state?.window?.type;

  const [formatting, setFormatting] = useState(false);
  const keyboardTriggerRef = useRef<HTMLInputElement>();

  const handleFormatting = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();
      if (keyboardTriggerRef.current) {
        keyboardTriggerRef.current.focus();
      }
      setFormatting(!formatting);
    },
    [formatting]
  );
  const handleClick = useCallback(
    (e: React.MouseEvent, value: string): void => {
      e.stopPropagation();
      e.preventDefault();
      if (keyboardTriggerRef.current) {
        keyboardTriggerRef.current.focus();
      }
      dispatch(
        panelChangeEditorState(windowType, { action: value, focus: true })
      );
    },
    [dispatch, windowType]
  );
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();
      if (keyboardTriggerRef.current) {
        keyboardTriggerRef.current.focus();
      }
      dispatch(panelChangeEditorState(windowType, { focus: true }));
    },
    [dispatch, windowType]
  );

  return (
    <StyledSnippetToolbar
      className="snippet-toolbar"
      onClick={handleBackgroundClick}
    >
      <StyledKeyboardTrigger aria-hidden="true" ref={keyboardTriggerRef} />
      <StyledSnippetContent>
        <StyledToggleButtonGroup
          size="small"
          exclusive
          onChange={handleFormatting}
          aria-label="text formatting"
          style={{ color: colors.lineNumber }}
        >
          <StyledTypeToggleButton value="formatting" aria-label="formatting">
            <FontIcon aria-label={`formatting`}>
              {formatting ? (
                <FontRegularIcon />
              ) : (
                <WandMagicSparklesRegularIcon />
              )}
            </FontIcon>
          </StyledTypeToggleButton>
        </StyledToggleButtonGroup>
        <Divider flexItem orientation="vertical" sx={{ mx: 0.5, my: 1 }} />
        <>
          {formatting ? (
            <>
              <StyledMainToggleButtonGroup
                size="small"
                exclusive
                onChange={handleClick}
                aria-label="text formatting"
              >
                <StyledMainToggleButton value="bold" aria-label="bold">
                  <FontIcon aria-label={`bold`}>
                    <BoldRegularIcon />
                  </FontIcon>
                </StyledMainToggleButton>
                <StyledMainToggleButton value="italic" aria-label="italic">
                  <FontIcon aria-label={`italic`}>
                    <ItalicRegularIcon />
                  </FontIcon>
                </StyledMainToggleButton>
                <StyledMainToggleButton
                  value="underline"
                  aria-label="underline"
                >
                  <FontIcon aria-label={`underline`}>
                    <UnderlineRegularIcon />
                  </FontIcon>
                </StyledMainToggleButton>
                <StyledMainToggleButton value="center" aria-label="center">
                  <FontIcon aria-label={`align-center`}>
                    <AlignCenterRegularIcon />
                  </FontIcon>
                </StyledMainToggleButton>
              </StyledMainToggleButtonGroup>
            </>
          ) : (
            <>
              <StyledMainToggleButtonGroup
                size="small"
                exclusive
                onChange={handleClick}
                aria-label="commands"
              >
                <StyledMainToggleButton value="section" aria-label="section">
                  <FontIcon aria-label={`section`}>
                    <HashtagRegularIcon />
                  </FontIcon>
                </StyledMainToggleButton>
                <StyledMainToggleButton value="scene" aria-label="scene">
                  <FontIcon aria-label={`scene`}>
                    <HouseRegularIcon />
                  </FontIcon>
                </StyledMainToggleButton>
                <StyledMainToggleButton value="dialogue" aria-label="dialogue">
                  <FontIcon aria-label={`dialogue`}>
                    <MessageDotsRegularIcon />
                  </FontIcon>
                </StyledMainToggleButton>
                <StyledMainToggleButton value="action" aria-label="action">
                  <FontIcon aria-label={`action`}>
                    <PersonRunningRegularIcon />
                  </FontIcon>
                </StyledMainToggleButton>
                <StyledMainToggleButton
                  value="transition"
                  aria-label="transition"
                >
                  <FontIcon aria-label={`transition`}>
                    <VideoArrowUpRightRegularIcon />
                  </FontIcon>
                </StyledMainToggleButton>
                <StyledMainToggleButton value="choice" aria-label="choice">
                  <FontIcon aria-label={`choice`}>
                    <ListUlRegularIcon />
                  </FontIcon>
                </StyledMainToggleButton>
                <StyledMainToggleButton
                  value="condition"
                  aria-label="condition"
                >
                  <FontIcon aria-label={`condition`}>
                    <ListCheckRegularIcon />
                  </FontIcon>
                </StyledMainToggleButton>
              </StyledMainToggleButtonGroup>
            </>
          )}
        </>
        <Divider flexItem orientation="vertical" sx={{ mx: 0.5, my: 1 }} />
      </StyledSnippetContent>
    </StyledSnippetToolbar>
  );
});

export default SnippetToolbar;
