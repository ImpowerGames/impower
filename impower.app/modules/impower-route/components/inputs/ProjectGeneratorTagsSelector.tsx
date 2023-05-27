import styled from "@emotion/styled";
import Chip from "@mui/material/Chip";
import React, { useCallback, useMemo } from "react";
import { getSubphrases } from "../../../../../concept-generator";

const StyledPreambleArea = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  pointer-events: none;
  margin-bottom: ${(props): string => props.theme.spacing(1.5)};
`;

const StyledChipArea = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
`;

const StyledChip = styled(Chip)`
  pointer-events: auto;
  font-size: ${(props): string | number =>
    props.theme.typography.body1.fontSize};
  margin: 2px;
  min-height: 0;
  height: auto;

  & .MuiChip-label {
    padding: ${(props): string => props.theme.spacing(0.25, 1.25)};
    text-overflow: clip;
  }

  &.MuiChip-filled {
    border: solid 1px transparent;
  }
`;

const StyledLabelArea = styled.div`
  display: flex;
`;

const StyledLabel = styled.div``;

const StyledDetail = styled.div`
  padding-left: ${(props): string => props.theme.spacing(0.75)};
  opacity: 0.5;
`;

export interface ProjectGeneratorTagsSelectorProps {
  termTagsMap: { [term: string]: string[] };
  phrases: string[];
  tags: string[];
  filteredTags: string[];
  debug?: boolean;
  onFilterTags: (tags: string[]) => void;
}

export const ProjectGeneratorTagsSelector = (
  props: ProjectGeneratorTagsSelectorProps
): JSX.Element | null => {
  const { termTagsMap, phrases, tags, filteredTags, debug, onFilterTags } =
    props;

  const handleClickTag = useCallback(
    (e: React.MouseEvent, tag: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (onFilterTags) {
        const newFilteredTags = filteredTags?.includes(tag)
          ? filteredTags.filter((t) => t !== tag)
          : [...(filteredTags || []), tag];
        onFilterTags(newFilteredTags);
      }
    },
    [filteredTags, onFilterTags]
  );

  const concepts = useMemo(() => {
    if (!phrases || !termTagsMap) {
      return {};
    }
    const dict: { [tag: string]: string[] } = {};
    phrases.forEach((phrase) => {
      const subphrases = getSubphrases(phrase);
      subphrases.forEach((subphrase) => {
        const relatedTags = termTagsMap[subphrase];
        if (relatedTags) {
          relatedTags.forEach((t) => {
            if (tags.includes(t)) {
              if (!dict[t]) {
                dict[t] = [];
              }
              if (!dict[t].includes(phrase)) {
                dict[t].push(phrase);
              }
            }
          });
        }
      });
    });
    return dict;
  }, [tags, termTagsMap, phrases]);

  return (
    <StyledPreambleArea>
      <StyledChipArea>
        {tags.map((tag) => (
          <StyledChip
            key={tag}
            disabled={!concepts[tag]}
            variant={
              filteredTags.includes(tag) || !concepts[tag]
                ? "outlined"
                : "filled"
            }
            color="secondary"
            label={
              concepts[tag] ? (
                <StyledLabelArea>
                  <StyledLabel>{tag}</StyledLabel>
                  {debug && (
                    <StyledDetail>{`(${concepts[tag]?.length})`}</StyledDetail>
                  )}
                </StyledLabelArea>
              ) : (
                tag
              )
            }
            onClick={(e: React.MouseEvent): void => handleClickTag(e, tag)}
            style={{
              opacity: !concepts[tag]
                ? 0.5
                : filteredTags.includes(tag)
                ? 0.9
                : 0.8,
            }}
          />
        ))}
      </StyledChipArea>
    </StyledPreambleArea>
  );
};

export default ProjectGeneratorTagsSelector;
