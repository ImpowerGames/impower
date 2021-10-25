import styled from "@emotion/styled";
import { Typography } from "@material-ui/core";
import Button from "@material-ui/core/Button";
import React from "react";
import Markdown from "../../../impower-route/components/elements/Markdown";
import { donateInfo } from "../../types/info/donate";
import Section from "../elements/Section";
import SectionDescription from "../elements/SectionDescription";
import SectionTitle from "../elements/SectionTitle";

const StyledContainer = styled.div``;

const StyledSubtitle = styled(Typography)`
  margin-top: ${(props): string => props.theme.spacing(2)};
`;

const StyledButton = styled(Button)`
  margin: ${(props): string => props.theme.spacing(2)}
    ${(props): string => props.theme.spacing(4)};
  text-transform: none;
  font-size: 2rem;
  line-height: 1.2;
  font-weight: 700;
`;

const DonateSection = (): JSX.Element => {
  const { title, subtitle, description, action, link } = donateInfo;
  return (
    <Section type="Donate">
      {(): JSX.Element => (
        <>
          <SectionTitle>{title}</SectionTitle>
          <StyledSubtitle variant="h6" color="grey">
            {subtitle}
          </StyledSubtitle>
          <SectionDescription fontSize="1rem" maxWidth={800}>
            <Markdown>{description}</Markdown>
          </SectionDescription>
          <StyledContainer>
            <StyledButton
              href={link}
              color="secondary"
              variant="outlined"
              size="large"
            >
              {action}
            </StyledButton>
          </StyledContainer>
        </>
      )}
    </Section>
  );
};

export default DonateSection;
