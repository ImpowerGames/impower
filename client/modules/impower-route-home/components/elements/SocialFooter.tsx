import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import FacebookBrandsIcon from "../../../../resources/icons/brands/facebook.svg";
import InstagramBrandsIcon from "../../../../resources/icons/brands/instagram.svg";
import TiktokBrandsIcon from "../../../../resources/icons/brands/tiktok.svg";
import TwitterBrandsIcon from "../../../../resources/icons/brands/twitter.svg";
import { FontIcon } from "../../../impower-icon";

const socialButtons = [
  {
    tooltip: "Follow us on Twitter",
    label: "twitter",
    icon: <TwitterBrandsIcon />,
    link: "https://twitter.com/impowergames",
  },
  {
    tooltip: "Follow us on Facebook",
    label: "facebook",
    icon: <FacebookBrandsIcon />,
    link: "https://facebook.com/impowergames",
  },
  {
    tooltip: "Follow us on Instagram",
    label: "instagram",
    icon: <InstagramBrandsIcon />,
    link: "https://instagram.com/impowergames",
  },
  {
    tooltip: "Follow us on TikTok",
    label: "tiktok",
    icon: <TiktokBrandsIcon />,
    link: "https://www.tiktok.com/@impowergames",
  },
];

const StyledButton = styled(Button)`
  font-weight: ${(props): number => props.theme.fontWeight.normal};
`;

const StyledSocialButton = styled(StyledButton)`
  min-width: 0;
`;

const StyledSocialGrid = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    justify-content: center;
  }
`;

const StyledSocialArea = styled.div`
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledGrid = styled.div``;

const SocialFooter = (): JSX.Element => {
  return (
    <StyledSocialGrid>
      {socialButtons.map((button) => {
        return (
          <StyledGrid key={button.label}>
            <StyledSocialArea>
              <StyledSocialButton
                size="small"
                color="primary"
                href={button.link}
              >
                <FontIcon aria-label={button.tooltip || button.label} size={24}>
                  {button.icon}
                </FontIcon>
              </StyledSocialButton>
            </StyledSocialArea>
          </StyledGrid>
        );
      })}
    </StyledSocialGrid>
  );
};

export default SocialFooter;
