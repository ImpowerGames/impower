import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import React from "react";
import { FontIcon } from "../../../impower-icon";
import { PopAnimation } from "../../../impower-route";
import AnimatedPortalIllustration from "../../../impower-route/components/illustrations/AnimatedPortalIllustration";
import { productInfo } from "../../types/info/product";
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

const StyledListItemIcon = styled.div`
  padding: ${(props): string => props.theme.spacing(2)};
  margin: ${(props): string => props.theme.spacing(2)};
  color: ${(props): string => props.theme.palette.secondary.main};
  border-radius: 50%;
`;

const StyledListItemDescription = styled.div`
  font-weight: ${(props): number => props.theme.fontWeight.bold};
`;

const StyledListItemCaption = styled.div`
  font-weight: ${(props): number => props.theme.fontWeight.normal};
`;

const ProductSection = (): JSX.Element => {
  const { title, steps } = productInfo;
  return (
    <Section type="Product">
      {({ shown }): JSX.Element => (
        <>
          <SectionTitle>{title}</SectionTitle>
          <Illustration
            style={{
              marginTop: -48,
              marginBottom: -112,
            }}
            imageStyle={{ minHeight: 400, maxWidth: 900 }}
          >
            <AnimatedPortalIllustration />
          </Illustration>
          <SectionDescription key={String(shown)} alignItems="stretch">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <PopAnimation
                  key={step.description}
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
                      <StyledButton>
                        <StyledButtonLabel>
                          <StyledListItemIcon>
                            <FontIcon
                              aria-label={step.description}
                              size={40}
                              color={step.color}
                            >
                              <Icon />
                            </FontIcon>
                          </StyledListItemIcon>
                          <StyledListItemDescription>
                            {step.description}
                          </StyledListItemDescription>
                          <StyledListItemCaption>
                            {step.caption}
                          </StyledListItemCaption>
                        </StyledButtonLabel>
                      </StyledButton>
                    </NextLink>
                  </HoverTapTransition>
                </PopAnimation>
              );
            })}
          </SectionDescription>
        </>
      )}
    </Section>
  );
};

export default ProductSection;
