import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import { useContext, useEffect, useState } from "react";
import getIconSvgData from "../../../../lib/getIconSvgData";
import {
  DynamicIcon,
  FontIcon,
  IconLibraryContext,
  iconLibraryRegister,
} from "../../../impower-icon";
import FadeAnimation from "../../../impower-route/components/animations/FadeAnimation";

const socialButtons = [
  {
    tooltip: "Follow us on Twitter",
    label: "twitter",
    icon: "twitter",
    link: "https://twitter.com/impowergames",
  },
  {
    tooltip: "Follow us on Facebook",
    label: "facebook",
    icon: "facebook",
    link: "https://facebook.com/impowergames",
  },
  {
    tooltip: "Follow us on Instagram",
    label: "instagram",
    icon: "instagram",
    link: "https://instagram.com/impowergames",
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
  const [loadedIcons, setLoadedIcons] = useState(false);
  const [, iconLibraryDispatch] = useContext(IconLibraryContext);
  useEffect(() => {
    const loadIcons = async (): Promise<void> => {
      const brandIconNames = socialButtons.map((b) => b.icon);
      const iconData = await Promise.all(
        brandIconNames.map(async (name) => {
          const component = (
            await import(`../../../../resources/icons/brands/${name}.svg`)
          ).default;
          return getIconSvgData(component);
        })
      );
      const icons = {};
      iconData.forEach((data, index) => {
        icons[brandIconNames[index]] = data;
      });
      iconLibraryDispatch(iconLibraryRegister("brands", icons));
      setLoadedIcons(true);
    };
    loadIcons();
  }, [iconLibraryDispatch]);
  return (
    <StyledSocialGrid>
      {socialButtons.map((button) => {
        return (
          <StyledGrid key={button.label}>
            <StyledSocialArea>
              <StyledSocialButton
                size="small"
                color="inherit"
                href={button.link}
              >
                <FadeAnimation
                  initial={loadedIcons ? 1 : 0}
                  animate={loadedIcons ? 1 : 0}
                >
                  <FontIcon
                    aria-label={button.tooltip || button.label}
                    size={24}
                  >
                    <DynamicIcon icon={button.icon} />
                  </FontIcon>
                </FadeAnimation>
              </StyledSocialButton>
            </StyledSocialArea>
          </StyledGrid>
        );
      })}
    </StyledSocialGrid>
  );
};

export default SocialFooter;
