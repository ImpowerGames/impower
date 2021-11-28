import styled from "@emotion/styled";
import { Chip, Typography } from "@material-ui/core";
import React, { useCallback } from "react";
import format from "../../../impower-config/utils/format";

const StyledPreambleArea = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  opacity: 0.7;
  pointer-events: none;
  margin-bottom: ${(props): string => props.theme.spacing(1.5)};
`;

const StyledTypography = styled(Typography)`
  white-space: pre;
`;

const StyledChipArea = styled.div`
  display: flex;
`;

const StyledChip = styled(Chip)`
  pointer-events: auto;
  font-size: ${(props): string | number =>
    props.theme.typography.body1.fontSize};
  margin: 0 1px;
  min-height: 0;
  height: auto;

  & .MuiChip-label {
    padding: ${(props): string => props.theme.spacing(0, 1)};
    text-overflow: clip;
  }
`;

export interface ProjectSummaryPreambleTagSelectorProps {
  placeholder: string;
  tags: string[];
  onChangeTags: (tags: string[]) => void;
}

export const ProjectSummaryPreambleTagSelector = (
  props: ProjectSummaryPreambleTagSelectorProps
): JSX.Element | null => {
  const { placeholder = "", tags, onChangeTags } = props;

  const mainTag = tags?.[0] || "";

  const placeholderParts = placeholder.split("{tag}");
  const [placeholderBeforeTag, placeholderAfterTag] = placeholderParts;
  const formattedPlaceholderBeforeTag = format(placeholderBeforeTag, {
    tag: mainTag,
  });
  const formattedPlaceholderAfterTag = `${format(placeholderAfterTag, {
    tag: mainTag,
  })}...`;
  const formattedPlaceholderAfterTagWords = formattedPlaceholderAfterTag
    .trim()
    .split(" ");

  const handleClickMainTag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onChangeTags) {
        if (tags?.length > 0) {
          const mainTag = tags?.[0];
          const selectedTag = tags?.[1];
          const otherTags = tags.filter(
            (tag) => tag !== selectedTag && tag !== mainTag
          );
          const newTags = [selectedTag, ...otherTags, mainTag];
          onChangeTags(newTags);
        }
      }
    },
    [onChangeTags, tags]
  );

  return (
    <StyledPreambleArea>
      <StyledTypography>{formattedPlaceholderBeforeTag}</StyledTypography>
      <StyledChipArea>
        <StyledChip
          variant="outlined"
          color="secondary"
          label={mainTag}
          onClick={handleClickMainTag}
        />
        <StyledTypography>{` `}</StyledTypography>
      </StyledChipArea>
      {formattedPlaceholderAfterTagWords.map((word, index) => (
        <StyledTypography key={index}>
          {word}
          {` `}
        </StyledTypography>
      ))}
    </StyledPreambleArea>
  );
};

export default ProjectSummaryPreambleTagSelector;
