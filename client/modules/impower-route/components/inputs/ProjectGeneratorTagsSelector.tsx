import styled from "@emotion/styled";
import { Chip } from "@material-ui/core";
import React, { useCallback } from "react";

const StyledPreambleArea = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  opacity: 0.8;
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

export interface ProjectGeneratorTagsSelectorProps {
  tags: string[];
  filteredTags: string[];
  onFilterTags: (tags: string[]) => void;
}

export const ProjectGeneratorTagsSelector = (
  props: ProjectGeneratorTagsSelectorProps
): JSX.Element | null => {
  const { tags, filteredTags, onFilterTags } = props;

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

  return (
    <StyledPreambleArea>
      <StyledChipArea>
        {tags.map((tag) => (
          <StyledChip
            key={tag}
            variant={filteredTags.includes(tag) ? "outlined" : "filled"}
            color="secondary"
            label={tag}
            onClick={(e: React.MouseEvent): void => handleClickTag(e, tag)}
          />
        ))}
      </StyledChipArea>
    </StyledPreambleArea>
  );
};

export default ProjectGeneratorTagsSelector;
