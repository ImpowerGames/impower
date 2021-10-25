import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import React, { useEffect, useState } from "react";
import AnglesDownRegularIcon from "../../../resources/icons/regular/angles-down.svg";
import EnvelopeRegularIcon from "../../../resources/icons/regular/envelope.svg";
import GamepadRegularIcon from "../../../resources/icons/regular/gamepad.svg";
import LazyHydrate from "../../impower-hydration/LazyHydrate";
import { FontIcon } from "../../impower-icon";
import FadeAnimation from "../../impower-route/components/animations/FadeAnimation";
import useBodyBackgroundColor from "../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../impower-route/hooks/useHTMLBackgroundColor";
import AttributionFooter from "./elements/AttributionFooter";
import Footer from "./elements/Footer";
import SocialFooter from "./elements/SocialFooter";
import SplashImage from "./elements/SplashImage";
import AboutSection from "./sections/AboutSection";
import AudienceSection from "./sections/AudienceSection";
import DonateSection from "./sections/DonateSection";
import DownloadSection from "./sections/DownloadSection";
import GetStartedSection from "./sections/GetStartedSection";
import ProductSection from "./sections/ProductSection";
import RoadmapSection from "./sections/RoadmapSection";

const title = `Game Dev Made Easy.`;
const body = `Impower is a free community-powered indie development platform that gives creative people the tools they need to bring their ideas to life.`;
const inviteButton = { label: `Request Invite`, link: `/invite` };
const tryButton = { label: `Make a game, it's free!`, link: `/pitch?e=game` };
const scrollInstruction = `SCROLL TO LEARN MORE`;

const HoverTapTransition = dynamic(
  () => import("../../impower-route/components/animations/HoverTapTransition")
);

const hoverVariant = { scale: 1.05 };
const tapVariant = { scale: 1 };

const StyledHome = styled.div`
  margin-top: calc(0px - env(safe-area-inset-top, 0));
`;

const StyledHomeContent = styled.div`
  background-color: ${(props): string => props.theme.colors.lightForeground};
  padding-bottom: ${(props): string => props.theme.spacing(2)};
`;

const StyledLanding = styled.div`
  position: relative;
  min-height: 100vh;
  max-height: 1000px;
  overflow: hidden;
`;

const StyledOverlay = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  background: rgb(0, 0, 0);
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0.25) 700px,
    rgba(0, 0, 0, 0) 900px
  );
`;

const StyledBackgroundContainer = styled.div`
  margin: auto;
  padding: ${(props): string => props.theme.spacing(4)};
  max-width: 100%;
  width: calc(
    ${(props): number => props.theme.breakpoints.values.lg}px +
      ${(props): string => props.theme.spacing(4)}
  );
`;

const StyledInfoContainer = styled.div`
  max-width: ${(props): string => props.theme.spacing(70)};
`;

const StyledPaperBackgroundContainer = styled.div`
  margin-top: -${(props): string => props.theme.spacing(8)};
`;

const StyledPaper = styled(Paper)`
  &.MuiPaper-root {
    position: relative;
    z-index: 1;

    border-radius: 6px;
    padding-bottom: ${(props): string => props.theme.spacing(6)};
  }

  max-width: ${(props): number => props.theme.breakpoints.values.lg}px;
  margin: auto;
`;

const StyledMotionTitleArea = styled.div``;

const StyledTitle = styled(Typography)`
  font-size: 3.25rem;
  color: white;
  font-weight: 700;
  font-family: ${(props): string => props.theme.fontFamily.title};
  display: block;
  position: relative;
  text-decoration: none;
  line-height: 1.1;
  margin-bottom: ${(props): string => props.theme.spacing(3)};
`;

const StyledMotionBodyArea = styled.div``;

const StyledBody = styled(Typography)`
  font-size: 1rem;
  color: white;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  margin-top: ${(props): string => props.theme.spacing(2)};
  margin-bottom: ${(props): string => props.theme.spacing(2)};
  line-height: 1.5;
`;

const StyledMotionButtonArea = styled.div`
  transform-origin: left;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    transform-origin: center;
  }
`;

const StyledButton = styled(Button)`
  padding: ${(props): string => props.theme.spacing(1.5)}
    ${(props): string => props.theme.spacing(4)};
`;

const StyledGrid = styled.div``;

const StyledGridItem = styled.div`
  align-items: flex-start;
  text-align: left;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    align-items: center;
    text-align: center;
  }
`;

const StyledScrollInstructionText = styled.div`
  padding-left: ${(props): string => props.theme.spacing(2)};
  padding-right: ${(props): string => props.theme.spacing(2)};
`;

const StyledMotionScrollInstruction = styled(FadeAnimation)`
  position: absolute;
  top: ${(props): string => props.theme.spacing(2)};
  left: 0;
  right: 0;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
  color: ${(props): string => props.theme.colors.black60};
`;

const StyledButtonIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(2)};
`;

const CallToActionButton = React.memo(() => {
  const button =
    process.env.NEXT_PUBLIC_ENVIRONMENT === "production"
      ? inviteButton
      : tryButton;

  const icon =
    process.env.NEXT_PUBLIC_ENVIRONMENT === "production" ? (
      <EnvelopeRegularIcon />
    ) : (
      <GamepadRegularIcon />
    );

  return (
    <StyledMotionButtonArea>
      <HoverTapTransition
        whileHover={hoverVariant}
        whileTap={tapVariant}
        style={{ display: "inline-flex" }}
      >
        <NextLink href={button.link} passHref>
          <StyledButton variant="contained" size="large" color="primary">
            <StyledButtonIconArea>
              <FontIcon aria-label={button.label} size={32}>
                {icon}
              </FontIcon>
            </StyledButtonIconArea>
            {button.label}
          </StyledButton>
        </NextLink>
      </HoverTapTransition>
    </StyledMotionButtonArea>
  );
});

const Home = React.memo((): JSX.Element => {
  const theme = useTheme();
  const [scrolledDown, setScrolledDown] = useState(false);

  useBodyBackgroundColor(theme.colors.lightForeground);
  useHTMLBackgroundColor(theme.colors.lightForeground);

  useEffect(() => {
    const handleScroll = (): void => {
      setScrolledDown(window.scrollY > 0);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return (): void => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <StyledHome>
      <StyledHomeContent>
        <StyledLanding>
          <SplashImage />
          <StyledOverlay>
            <StyledBackgroundContainer>
              <StyledInfoContainer>
                <StyledGrid>
                  <StyledGridItem>
                    <StyledMotionTitleArea>
                      <StyledTitle variant="h2">{title}</StyledTitle>
                    </StyledMotionTitleArea>
                    <StyledMotionBodyArea>
                      <StyledBody variant="h6">{body}</StyledBody>
                    </StyledMotionBodyArea>
                    <br />
                    <CallToActionButton />
                  </StyledGridItem>
                </StyledGrid>
              </StyledInfoContainer>
            </StyledBackgroundContainer>
          </StyledOverlay>
        </StyledLanding>
        <StyledPaperBackgroundContainer>
          <StyledPaper elevation={12}>
            <StyledMotionScrollInstruction
              initial={1}
              animate={scrolledDown ? 0 : 1}
            >
              <FontIcon aria-label="Down">
                <AnglesDownRegularIcon />
              </FontIcon>
              <StyledScrollInstructionText>
                <Typography variant="subtitle1" style={{ fontWeight: 600 }}>
                  {scrollInstruction}
                </Typography>
              </StyledScrollInstructionText>
              <FontIcon aria-label="Down">
                <AnglesDownRegularIcon />
              </FontIcon>
            </StyledMotionScrollInstruction>
            <LazyHydrate whenVisible>
              <ProductSection />
            </LazyHydrate>
            <LazyHydrate whenVisible>
              <DonateSection />
            </LazyHydrate>
            <LazyHydrate whenVisible>
              <DownloadSection />
            </LazyHydrate>
            <LazyHydrate whenVisible>
              <AudienceSection />
            </LazyHydrate>
            <LazyHydrate whenVisible>
              <AboutSection />
            </LazyHydrate>
            <LazyHydrate whenVisible>
              <RoadmapSection />
            </LazyHydrate>
            <LazyHydrate whenVisible>
              <GetStartedSection />
            </LazyHydrate>
          </StyledPaper>
        </StyledPaperBackgroundContainer>
        <LazyHydrate whenVisible>
          <Footer
            socialChildren={<SocialFooter />}
            attributionChildren={<AttributionFooter />}
          />
        </LazyHydrate>
      </StyledHomeContent>
    </StyledHome>
  );
});

export default Home;
