import styled from "@emotion/styled";
import { Typography } from "@material-ui/core";
import React from "react";
import MascotRelaxed01 from "../../../../resources/mascot/professor-relaxed-01.svg";
import Markdown from "../elements/Markdown";
import MascotIllustration from "../illustrations/MascotIllustration";

const StyledPageUnderConstruction = styled.div`
  flex: 1;
  background-color: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`;

const StyledTitleTypography = styled(Typography)`
  margin-left: ${(props): string => props.theme.spacing(3)};
  margin-right: ${(props): string => props.theme.spacing(3)};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  z-index: 10;
  text-align: center;
`;

const StyledDescriptionArea = styled.div`
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  padding: ${(props): string => props.theme.spacing(2, 2)};
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
`;

interface PageUnderConstructionProps {
  description?: string;
}

const PageUnderConstruction = (
  props: PageUnderConstructionProps
): JSX.Element => {
  const { description } = props;
  return (
    <StyledPageUnderConstruction>
      <MascotIllustration image={<MascotRelaxed01 />} size={320} />
      <StyledTitleTypography variant="h4">
        {`Page Under Construction`}
      </StyledTitleTypography>
      {description && (
        <StyledDescriptionArea>
          <Markdown>{description}</Markdown>
        </StyledDescriptionArea>
      )}
    </StyledPageUnderConstruction>
  );
};

export default PageUnderConstruction;
