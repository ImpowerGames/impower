import styled from "@emotion/styled";
import React from "react";
import RandomizeButton from "./RandomizeButton";

const randomizeText = "Randomize!";

const StyledProjectTagsInspiration = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
`;

interface ProjectSummaryInspirationProps {
  disabled?: boolean;
  onClick: (e: React.MouseEvent) => void;
}

const ProjectSummaryInspiration = React.memo(
  (props: ProjectSummaryInspirationProps): JSX.Element => {
    const { disabled, onClick } = props;
    return (
      <StyledProjectTagsInspiration>
        <RandomizeButton
          disabled={disabled}
          label={randomizeText}
          responsive
          onClick={onClick}
        />
      </StyledProjectTagsInspiration>
    );
  }
);

export default ProjectSummaryInspiration;
