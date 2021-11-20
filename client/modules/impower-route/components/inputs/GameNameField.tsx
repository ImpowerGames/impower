import dynamic from "next/dynamic";
import React from "react";
import DataField, { RenderPropertyProps } from "./DataField";

const GamePromptButton = dynamic(() => import("../elements/GamePromptButton"), {
  ssr: false,
});

export interface GameNameFieldProps extends RenderPropertyProps {
  chosenTitle?: string;
  sortedTags?: string[];
  relevancyFilteredTags?: string[];
  relevantTitles?: [string, number][];
  terms?: { [term: string]: string[] };
  onRelevancyFilter?: (filteredTags: string[]) => void;
  onOpenTitleSuggestions?: () => void;
  onChooseTitle?: (title: string) => void;
  onAddPhrase?: (phrase: string, tags: string[]) => void;
  onDeletePhrase?: (phrase: string, tags: string[]) => void;
  onEditPhrase?: (original: string, phrase: string) => void;
  onChangeTags?: (tags: string[]) => void;
}

export const GameNameField = (
  props: GameNameFieldProps
): JSX.Element | null => {
  const {
    chosenTitle,
    sortedTags,
    relevancyFilteredTags,
    relevantTitles,
    terms,
    onRelevancyFilter,
    onOpenTitleSuggestions,
    onChooseTitle,
    onAddPhrase,
    onDeletePhrase,
    onEditPhrase,
    onChangeTags,
  } = props;

  return (
    <DataField
      {...props}
      renderProperty={undefined}
      defaultValue={chosenTitle}
      InputProps={{
        endAdornment: (
          <GamePromptButton
            chosenTitle={chosenTitle}
            sortedTags={sortedTags}
            relevancyFilteredTags={relevancyFilteredTags}
            relevantTitles={relevantTitles}
            terms={terms}
            onRelevancyFilter={onRelevancyFilter}
            onOpenTitleSuggestions={onOpenTitleSuggestions}
            onChooseTitle={onChooseTitle}
            onAddPhrase={onAddPhrase}
            onDeletePhrase={onDeletePhrase}
            onEditPhrase={onEditPhrase}
            onChangeTags={onChangeTags}
          />
        ),
      }}
    />
  );
};

export default GameNameField;
