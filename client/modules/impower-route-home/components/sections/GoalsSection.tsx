import styled from "@emotion/styled";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography,
} from "@material-ui/core";
import React from "react";
import AngleDownRegularIcon from "../../../../resources/icons/regular/angle-down.svg";
import IllustrationImage from "../../../../resources/illustrations/fogg-coffee-break.svg";
import { FontIcon } from "../../../impower-icon";
import Markdown from "../../../impower-route/components/elements/Markdown";
import { goalsInfo } from "../../types/info/goals";
import Illustration from "../elements/Illustration";
import Section from "../elements/Section";
import SectionDescription from "../elements/SectionDescription";
import SectionTitle from "../elements/SectionTitle";

const StyledGoalSummaryArea = styled.div`
  display: flex;
  align-items: center;
`;

const StyledDescriptionArea = styled.div`
  padding-left: ${(props): string => props.theme.spacing(2)};
  padding-right: ${(props): string => props.theme.spacing(2)};
  padding-bottom: ${(props): string => props.theme.spacing(2)};
  color: ${(props): string => props.theme.colors.black70};
  & p {
    margin: 0;
  }
`;

const StyledIconArea = styled.div`
  padding: ${(props): string => props.theme.spacing(1.5)};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
`;

const StyledGoalTitle = styled(Typography)`
  margin-top: ${(props): string => props.theme.spacing(2)};
  margin-left: ${(props): string => props.theme.spacing(2)};
  margin-bottom: ${(props): string => props.theme.spacing(2)};
  text-decoration: none;
  font-weight: 700;
  font-family: ${(props): string => props.theme.fontFamily.title};

  min-height: 32px;
  text-decoration: none;

  font-size: ${(props): string => props.theme.fontSize.sectionHeading};
`;

const StyledBodyText = styled.div``;

const GoalsSection = (): JSX.Element => {
  const { title, goals } = goalsInfo;
  return (
    <Section type="Goals">
      {(): JSX.Element => (
        <>
          <Illustration imageStyle={{ minHeight: 400, maxWidth: 900 }}>
            <IllustrationImage />
          </Illustration>
          <SectionTitle>{title}</SectionTitle>
          <SectionDescription fontSize="0.875rem" maxWidth={800}>
            <StyledBodyText>
              {goals.map((goal) => {
                const Icon = goal.icon;
                return (
                  <Accordion key={goal.title}>
                    <AccordionSummary
                      expandIcon={
                        <FontIcon aria-label="Click to Learn More" size={24}>
                          <AngleDownRegularIcon />
                        </FontIcon>
                      }
                      aria-controls="panel1a-content"
                      id="panel1a-header"
                    >
                      <StyledGoalSummaryArea
                        className={StyledGoalSummaryArea.displayName}
                      >
                        <StyledIconArea
                          className="StyledIconArea"
                          style={{
                            color: goal.color,
                            boxShadow: `0px 0px 0px 2px ${goal.color}`,
                          }}
                        >
                          <FontIcon aria-label={goal.title} size={24}>
                            <Icon />
                          </FontIcon>
                        </StyledIconArea>
                        <StyledGoalTitle
                          className={StyledGoalTitle.displayName}
                          variant="h1"
                        >
                          {goal.title}
                        </StyledGoalTitle>
                      </StyledGoalSummaryArea>
                    </AccordionSummary>
                    <AccordionDetails>
                      <StyledDescriptionArea
                        className={StyledDescriptionArea.displayName}
                      >
                        {goal.description.map((d, index) => (
                          <div key={d}>
                            <Markdown>{d}</Markdown>
                            {index < goal.description.length - 1 && <br />}
                          </div>
                        ))}
                      </StyledDescriptionArea>
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </StyledBodyText>
          </SectionDescription>
        </>
      )}
    </Section>
  );
};

export default GoalsSection;
