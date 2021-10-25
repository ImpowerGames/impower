import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import React from "react";
import IllustrationImage from "../../../../resources/illustrations/clip-1-diverse.svg";
import { FontIcon } from "../../../impower-icon";
import PopAnimation from "../../../impower-route/components/animations/PopAnimation";
import { audienceInfo } from "../../types/info/audience";
import Illustration from "../elements/Illustration";
import Section from "../elements/Section";
import SectionDescription from "../elements/SectionDescription";
import SectionTitle from "../elements/SectionTitle";

const HoverTapTransition = dynamic(
  () =>
    import("../../../impower-route/components/animations/HoverTapTransition")
);

const hoverVariant = { y: -8 };
const tapVariant = { y: 0 };

const StyledButton = styled(Button)`
  display: flex;
  align-items: flex-start;
`;

const StyledButtonLabel = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin-top: -${(props): string => props.theme.spacing(2)};
  padding: ${(props): string => props.theme.spacing(2)};
  max-width: 200px;
  text-transform: none;
  font-size: 1.0625rem;
`;

const StyledUserIcon = styled.div`
  padding: ${(props): string => props.theme.spacing(2)};
  margin: ${(props): string => props.theme.spacing(2)};
  background-color: ${(props): string => props.theme.palette.secondary.main};
  color: white;
  border-radius: 50%;
`;

const StyledUserDescription = styled.div`
  font-weight: ${(props): number => props.theme.fontWeight.bold};
`;

const StyledUserCaption = styled.div`
  padding: 0 ${(props): string => props.theme.spacing(8)};
  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding: 0 ${(props): string => props.theme.spacing(4)};
  }
  font-size: 1.0625rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  margin: auto;
  white-space: pre-wrap;
`;

const AudienceSection = (): JSX.Element => {
  const { title, buttons, caption } = audienceInfo;
  return (
    <Section type="Audience">
      {({ shown }): JSX.Element => (
        <>
          <SectionTitle>{title}</SectionTitle>
          <Illustration
            style={{
              marginTop: -40,
              marginBottom: -80,
            }}
            imageStyle={{ minHeight: 400, maxWidth: 800 }}
          >
            <IllustrationImage />
          </Illustration>
          <SectionDescription key={String(shown)} fontSize="1rem">
            {buttons.map((button, index) => {
              const Icon = button.icon;
              return (
                <PopAnimation
                  key={button.description}
                  initial={0}
                  animate={shown ? 1 : 0}
                  delay={index * 0.1}
                >
                  <HoverTapTransition
                    whileHover={hoverVariant}
                    whileTap={tapVariant}
                    stretch
                  >
                    <NextLink href={"/signup"} passHref>
                      <StyledButton className={StyledButton.displayName}>
                        <StyledButtonLabel
                          className={StyledButtonLabel.displayName}
                        >
                          <StyledUserIcon
                            className={StyledUserIcon.displayName}
                          >
                            <FontIcon aria-label={button.description} size={24}>
                              <Icon />
                            </FontIcon>
                          </StyledUserIcon>
                          <StyledUserDescription
                            className={StyledUserDescription.displayName}
                          >
                            {button.description}
                          </StyledUserDescription>
                        </StyledButtonLabel>
                      </StyledButton>
                    </NextLink>
                  </HoverTapTransition>
                </PopAnimation>
              );
            })}
          </SectionDescription>
          <StyledUserCaption className={StyledUserCaption.displayName}>
            {caption}
          </StyledUserCaption>
        </>
      )}
    </Section>
  );
};

export default AudienceSection;
