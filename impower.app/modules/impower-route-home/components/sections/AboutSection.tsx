import styled from "@emotion/styled";
import IllustrationImage from "../../../../resources/illustrations/clip-diverse.svg";
import Markdown from "../../../impower-route/components/elements/Markdown";
import { aboutInfo } from "../../types/info/about";
import Illustration from "../elements/Illustration";
import Section from "../elements/Section";
import SectionDescription from "../elements/SectionDescription";
import SectionTitle from "../elements/SectionTitle";

const StyledBodyText = styled.div``;

const AboutSection = (): JSX.Element => {
  const { title, paragraphs } = aboutInfo;
  return (
    <Section type="About">
      {(): JSX.Element => (
        <>
          <Illustration
            style={{
              marginTop: -88,
              marginBottom: -24,
            }}
            imageStyle={{ minHeight: 400, maxWidth: 900 }}
          >
            <IllustrationImage />
          </Illustration>
          <SectionTitle>{title}</SectionTitle>
          <SectionDescription fontSize="0.9375rem" maxWidth={800}>
            {paragraphs.map((paragraph) => (
              <StyledBodyText key={paragraph}>
                <Markdown>{paragraph}</Markdown>
              </StyledBodyText>
            ))}
          </SectionDescription>
        </>
      )}
    </Section>
  );
};

export default AboutSection;
