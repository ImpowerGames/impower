import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import React, { useCallback, useState } from "react";
import LighbulbOnSolidIcon from "../../../../resources/icons/solid/lightbulb-on.svg";
import { useDialogNavigation } from "../../../impower-dialog";
import { FontIcon } from "../../../impower-icon";
import FadeAnimation from "../animations/FadeAnimation";
import DynamicLoadingButton from "../inputs/DynamicLoadingButton";

const PhrasePromptDialog = dynamic(() => import("./PhrasePromptDialog"), {
  ssr: false,
});

const StyledSuggestionsButton = styled(DynamicLoadingButton)`
  min-width: 0;
  pointer-events: auto;
  min-width: 56px;
  min-height: 56px;
  margin-right: -6px;
`;

interface GamePromptButtonProps {
  chosenTitle?: string;
  sortedTags?: string[];
  relevancyFilteredTags?: string[];
  relevantTitles?: [string, number][];
  terms?: { [term: string]: string[] };
  style?: React.CSSProperties;
  onRelevancyFilter?: (filteredTags: string[]) => void;
  onOpenTitleSuggestions?: () => void;
  onChooseTitle?: (title: string) => void;
  onAddPhrase?: (phrase: string, tags: string[]) => void;
  onDeletePhrase?: (phrase: string, tags: string[]) => void;
  onEditPhrase?: (original: string, phrase: string) => void;
  onChangeTags?: (tags: string[]) => void;
}

const GamePromptButton = React.memo(
  (props: GamePromptButtonProps): JSX.Element => {
    const {
      chosenTitle,
      sortedTags,
      relevancyFilteredTags,
      relevantTitles,
      terms,
      style,
      onRelevancyFilter,
      onOpenTitleSuggestions,
      onChooseTitle,
      onAddPhrase,
      onDeletePhrase,
      onEditPhrase,
      onChangeTags,
    } = props;

    const theme = useTheme();

    const [open, setOpen] = useState<boolean>();

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.h !== prevState?.h) {
          setOpen(currState?.h === "title");
        }
      },
      []
    );
    const [openHelpDialog, closeHelpDialog] = useDialogNavigation(
      "h",
      handleBrowserNavigation
    );

    const handleOpenDialog = useCallback((): void => {
      if (onOpenTitleSuggestions) {
        onOpenTitleSuggestions();
      }
      setOpen(true);
      openHelpDialog("title");
    }, [openHelpDialog, onOpenTitleSuggestions]);

    const handleCloseHelpDialog = useCallback((): void => {
      setOpen(false);
      closeHelpDialog();
    }, [closeHelpDialog]);

    const handleChooseTitle = useCallback(
      (title: string) => {
        if (onChooseTitle) {
          onChooseTitle(title);
        }
        handleCloseHelpDialog();
      },
      [handleCloseHelpDialog, onChooseTitle]
    );

    const label = `Suggest More Titles`;

    if (!sortedTags || sortedTags.length === 0) {
      return null;
    }

    if (!terms || !relevantTitles) {
      return (
        <StyledSuggestionsButton loading style={style}>
          <FontIcon aria-label={label} size={24} />
        </StyledSuggestionsButton>
      );
    }

    return (
      <FadeAnimation initial={0} animate={1}>
        <StyledSuggestionsButton onClick={handleOpenDialog} style={style}>
          <FontIcon aria-label={label} color={theme.colors.subtitle} size={24}>
            <LighbulbOnSolidIcon />
          </FontIcon>
        </StyledSuggestionsButton>
        {open !== undefined && (
          <PhrasePromptDialog
            open={open}
            chosenTitle={chosenTitle}
            sortedTags={sortedTags}
            relevancyFilteredTags={relevancyFilteredTags}
            relevantTitles={relevantTitles}
            terms={terms}
            onRelevancyFilter={onRelevancyFilter}
            onAddPhrase={onAddPhrase}
            onDeletePhrase={onDeletePhrase}
            onEditPhrase={onEditPhrase}
            onChangeTags={onChangeTags}
            onClose={handleCloseHelpDialog}
            onChooseTitle={handleChooseTitle}
          />
        )}
      </FadeAnimation>
    );
  }
);

export default GamePromptButton;
