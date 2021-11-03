import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import NextLink from "next/link";
import React from "react";
import LazyHydrate from "../../../impower-hydration/LazyHydrate";

const copyright = "Copyright © ";

const siteButtons = [
  { label: "Download", link: `/#download` },
  { label: "About", link: `/#about` },
  { label: "Donate", link: `https://www.patreon.com/impowergames` },
  { label: "Roadmap", link: `/#roadmap` },
  { label: "Contact", link: `/contact` },
  { label: "Terms", link: `/docs/legal/terms` },
  { label: "Privacy", link: `/docs/legal/privacy` },
  { label: "Cookies", link: `/docs/legal/cookies` },
];

const StyledFooter = styled.footer`
  padding: ${(props): string => props.theme.spacing(2)};
  display: flex;
  flex-direction: column;
  z-index: 1;
  position: relative;

  max-width: ${(props): number => props.theme.breakpoints.values.lg}px;
  margin: 0 auto;
`;

const StyledLink = styled(Button)`
  font-weight: ${(props): number => props.theme.fontWeight.normal};
`;

const StyledContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  flex-direction: row;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    flex-direction: column;
  }
`;

const StyledList = styled.div`
  padding: ${(props): string => props.theme.spacing(1)};
  display: flex;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    flex-direction: column;
  }
`;

const StyledCopyrightArea = styled.div`
  padding: ${(props): string => props.theme.spacing(0.5)};
  opacity: 0.9;
`;

const StyledSocialContainer = styled.div`
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
`;

interface FooterProps {
  color?: string;
  style?: React.CSSProperties;
  attributionChildren?: React.ReactNode;
  socialChildren?: React.ReactNode;
  pageChildren?: React.ReactNode;
}

const Footer = (props: FooterProps): JSX.Element => {
  const { color, style, attributionChildren, socialChildren, pageChildren } =
    props;
  return (
    <LazyHydrate ssrOnly>
      <StyledFooter style={{ color, ...style }}>
        <StyledContainer>
          <StyledList>
            {siteButtons.map((button) => (
              <NextLink
                key={button.label}
                href={button.link}
                passHref
                prefetch={false}
              >
                <StyledLink size="small" style={{ color }}>
                  {button.label}
                </StyledLink>
              </NextLink>
            ))}
          </StyledList>
          <StyledList>
            <StyledCopyrightArea>
              <Typography variant="body2" color="inherit" align="center">
                {copyright}
                {`Impower Games Co.`} {new Date().getFullYear()}.
              </Typography>
            </StyledCopyrightArea>
          </StyledList>
          <StyledList>{attributionChildren}</StyledList>
        </StyledContainer>
        <StyledContainer>
          <StyledSocialContainer>
            {socialChildren}
            {pageChildren}
          </StyledSocialContainer>
        </StyledContainer>
      </StyledFooter>
    </LazyHydrate>
  );
};

export default Footer;
