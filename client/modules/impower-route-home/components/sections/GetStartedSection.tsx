import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import IllustrationImage from "../../../../resources/illustrations/fogg-premium-upgrade-1.svg";
import { PopAnimation } from "../../../impower-route";
import { getStartedInfo } from "../../types/info/getStarted";
import Illustration from "../elements/Illustration";
import Section from "../elements/Section";
import SectionDescription from "../elements/SectionDescription";
import SectionTitle from "../elements/SectionTitle";

const HoverTapTransition = dynamic(
  () =>
    import("../../../impower-route/components/animations/HoverTapTransition")
);

const hoverVariant = { y: -16 };
const tapVariant = { y: 0 };

const StyledButton = styled(Button)`
  margin: ${(props): string => props.theme.spacing(2)}
    ${(props): string => props.theme.spacing(4)};
  text-transform: none;
  font-size: 3rem;
  line-height: 1.2;
`;

const StyledButtonLabel = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  white-space: nowrap;
`;

const StyledButtonAction = styled.div`
  padding-left: 0.4rem;
  padding-right: 0.4rem;
  font-weight: ${(props): number => props.theme.fontWeight.bold};
`;

const StyledButtonDescription = styled.div`
  padding-left: 0.4rem;
  padding-right: 0.4rem;
  color: ${(props): string => props.theme.colors.black50};
`;

const GetStartedSection = (): JSX.Element => {
  const { title, buttons } = getStartedInfo;
  return (
    <Section type="GetStarted">
      {({ shown }): JSX.Element => (
        <>
          <SectionTitle>{title}</SectionTitle>
          <Illustration
            style={{
              marginTop: -64,
              marginBottom: -120,
            }}
            imageStyle={{
              minHeight: 400,
              maxWidth: 900,
            }}
          >
            <IllustrationImage />
          </Illustration>
          <SectionDescription key={String(shown)} fontSize="1.0625rem">
            {buttons.map((button, index) => (
              <PopAnimation
                key={button.action}
                initial={0}
                animate={shown ? 1 : 0}
                delay={index * 0.1}
              >
                <HoverTapTransition
                  whileHover={hoverVariant}
                  whileTap={tapVariant}
                >
                  <NextLink href={button.link} passHref>
                    <StyledButton
                      className={StyledButton.displayName}
                      size="large"
                      color="secondary"
                    >
                      <StyledButtonLabel
                        className={StyledButtonLabel.displayName}
                      >
                        <StyledButtonAction
                          className={StyledButtonAction.displayName}
                        >
                          {button.action}
                        </StyledButtonAction>
                        <StyledButtonDescription
                          className={StyledButtonDescription.displayName}
                        >
                          {button.description}
                        </StyledButtonDescription>
                      </StyledButtonLabel>
                    </StyledButton>
                  </NextLink>
                </HoverTapTransition>
              </PopAnimation>
            ))}
          </SectionDescription>
        </>
      )}
    </Section>
  );
};

export default GetStartedSection;
