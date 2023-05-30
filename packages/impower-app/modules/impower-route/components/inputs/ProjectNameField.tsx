import dynamic from "next/dynamic";
import DataField, { RenderPropertyProps } from "./DataField";

const GamePromptButton = dynamic(() => import("../elements/GamePromptButton"), {
  ssr: false,
});

export interface ProjectNameFieldProps extends RenderPropertyProps {
  defaultName?: string;
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

export const ProjectNameField = (
  props: ProjectNameFieldProps
): JSX.Element | null => {
  const {
    defaultName,
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
      defaultValue={defaultName}
      InputProps={{
        endAdornment: (
          <GamePromptButton
            chosenTitle={defaultName}
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

export default ProjectNameField;
