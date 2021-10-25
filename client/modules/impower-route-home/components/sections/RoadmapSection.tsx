import styled from "@emotion/styled";
import { Card, CardContent, CardHeader, Typography } from "@material-ui/core";
import React from "react";
import IllustrationImage from "../../../../resources/illustrations/clip-message-sent-1.svg";
import SlideAnimation from "../../../impower-route/components/animations/SlideAnimation";
import Markdown from "../../../impower-route/components/elements/Markdown";
import { roadmapInfo } from "../../types/info/roadmap";
import Illustration from "../elements/Illustration";
import Section from "../elements/Section";
import SectionDescription from "../elements/SectionDescription";
import SectionTitle from "../elements/SectionTitle";

const StyledList = styled.div`
  margin: 0;
  padding: ${(props): string => props.theme.spacing(2)};
  list-style: none;
`;

const StyledCardHeader = styled(CardHeader)`
  background-color: ${(props): string =>
    props.theme.palette.mode === "light"
      ? props.theme.palette.grey[200]
      : props.theme.palette.grey[700]};
`;

const StyledTable = styled.div`
  padding-top: ${(props): string => props.theme.spacing(4)};
  padding-bottom: ${(props): string => props.theme.spacing(4)};
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
`;

const StyledCard = styled.div``;

const StyledListItemCaption = styled.div`
  padding-left: ${(props): string => props.theme.spacing(2)};
  padding-right: ${(props): string => props.theme.spacing(2)};
`;

const StyledFeature = styled(Typography)`
  line-height: 1.1;
  padding: ${(props): string => props.theme.spacing(1, 0)};
`;

const StyledItem = styled.div`
  display: flex;
  padding: ${(props): string => props.theme.spacing(2)};
  max-width: ${(props): string => props.theme.spacing(60)};
`;

const RoadmapSection = (): JSX.Element => {
  const { title, description, featuresets, legend, caption } = roadmapInfo;
  return (
    <Section type="Roadmap">
      {({ shown }): JSX.Element => (
        <>
          <SectionTitle>{title}</SectionTitle>
          <Illustration
            style={{
              marginTop: -40,
              marginBottom: -40,
            }}
            imageStyle={{ minHeight: 500, maxWidth: 900 }}
          >
            <IllustrationImage />
          </Illustration>
          <SectionDescription fontSize="1.0625rem">
            {description}
          </SectionDescription>
          <StyledTable key={String(shown)}>
            {featuresets.map((featureset, index) => (
              <SlideAnimation
                key={featureset.title}
                initial={64}
                animate={shown ? 0 : 64}
                delay={index * 0.1}
              >
                <StyledItem>
                  <StyledCard className={StyledCard.displayName}>
                    <Card>
                      <StyledCardHeader
                        className={StyledCardHeader.displayName}
                        title={featureset.title}
                        subheader={featureset.subheader}
                        titleTypographyProps={{ align: "center" }}
                        subheaderTypographyProps={{ align: "center" }}
                      />
                      <CardContent>
                        <StyledList>
                          {featureset.features.map((line) => (
                            <StyledFeature
                              className={StyledFeature.displayName}
                              variant="subtitle1"
                              align="center"
                              key={line.description}
                            >
                              {line.supported && `[${line.supported}] `}
                              {line.description}
                            </StyledFeature>
                          ))}
                        </StyledList>
                      </CardContent>
                    </Card>
                  </StyledCard>
                </StyledItem>
              </SlideAnimation>
            ))}
          </StyledTable>
          <StyledListItemCaption className={StyledListItemCaption.displayName}>
            <Markdown>{legend}</Markdown>
            <Markdown>{caption}</Markdown>
          </StyledListItemCaption>
        </>
      )}
    </Section>
  );
};

export default RoadmapSection;
