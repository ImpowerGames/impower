import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Divider from "@material-ui/core/Divider";
import IconButton from "@material-ui/core/IconButton";
import Typography from "@material-ui/core/Typography";
import dynamic from "next/dynamic";
import React, { useCallback, useContext } from "react";
import CircleUserSolidIcon from "../../../../resources/icons/solid/circle-user.svg";
import { useDialogNavigation } from "../../../impower-dialog";
import { FontIcon } from "../../../impower-icon";
import { isAppInstalled, ServiceWorkerContext } from "../../../impower-pwa";
import { UserContext } from "../../../impower-user";
import { pageNames } from "../../types/info/pageNames";
import FadeAnimation from "../animations/FadeAnimation";
import SlideAnimation from "../animations/SlideAnimation";
import Avatar from "./Avatar";

export const navbarPages: string[] = process.env.NEXT_PUBLIC_ORIGIN?.includes(
  "localhost"
)
  ? ["/", "/pitch/game", "/library", "/dashboard", "#donate"]
  : ["/", "/pitch/game", "#donate"];
export const unauthenticatedAccountPages: string[] = ["/signup", "/login"];
export const install = "Install";

const NextLink = dynamic(() => import("next/link"));

const AccountMenu = dynamic(() => import("../menus/AccountMenu"), {
  ssr: false,
});

const HoverTapTransition = dynamic(
  () => import("../animations/HoverTapTransition")
);

const hoverVariant = { y: -4 };
const tapVariant = { y: 0 };

const StyledPageNavigationLinks = styled.div`
  line-height: 1.5em;
  margin: 0;
  padding-left: 0;
  padding-top: 0;
  padding-bottom: 0;
  list-style: none;
  color: inherit;
  display: flex;
`;

const StyledMotionListItem = styled(SlideAnimation)`
  float: left;
  color: inherit;
  position: relative;
  display: flex;
  align-items: center;
  width: auto;
  margin: 0;
  padding: 0;
  ${(props): string => props.theme.breakpoints.down("md")}: {
    width: 100%;
    &:after: {
      width: calc(100% - 30px);
      content: "";
      display: flex;
      height: 1px;
      marginleft: 15px;
      backgroundcolor: #e5e5e5;
    }
  }
`;

const StyledAccountArea = styled.div`
  margin-left: ${(props): string => props.theme.spacing(2)};
  display: flex;
`;

const StyledAvatar = styled.img`
  width: 24px;
  height: 24px;
  border-radius: 50%;
`;

const StyledButton = styled(Button)`
  padding: ${(props): string => props.theme.spacing(1)};
  margin-left: ${(props): string => props.theme.spacing(1)};
  font-weight: ${(props): number => props.theme.fontWeight.normal};

  white-space: nowrap;
  height: ${(props): string => props.theme.spacing(4.5)};
`;

const StyledInstallButton = styled(StyledButton)`
  padding: ${(props): string => props.theme.spacing(0.5, 2)};
  border-radius: 100px;
`;

const StyledAccountButton = styled(StyledButton)`
  padding: ${(props): string => props.theme.spacing(0.5, 2)};
`;

const StyledIconButton = styled(IconButton)`
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledAccountInfoArea = styled.div`
  display: flex;
  padding: ${(props): string => props.theme.spacing(1, 2)};
  color: rgba(0, 0, 0, 0.54);
`;

const StyledAvatarArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(2)};
`;

const StyledTypography = styled(Typography)``;

const StyledDivider = styled(Divider)`
  margin: ${(props): string => props.theme.spacing(1, 0)};
`;

interface NavigationLinksProps {
  useAccountDialog?: boolean;
}

const PageNavigationLinks = React.memo((props: NavigationLinksProps) => {
  const { useAccountDialog } = props;
  const [accountMenuAnchor, setAccountMenuAnchor] =
    React.useState<null | HTMLElement>(null);

  const theme = useTheme();

  const { isInstalled, canInstall, onInstall } =
    useContext(ServiceWorkerContext);
  const [userState] = useContext(UserContext);
  const { isSignedIn, isAnonymous, userDoc } = userState;
  const username = userDoc?.username;
  const icon = userDoc?.icon?.fileUrl;
  const hex = userDoc?.hex;

  const handleOpenAccountMenu = useCallback((e: React.MouseEvent): void => {
    setAccountMenuAnchor(e.target as HTMLElement);
  }, []);
  const handleCloseAccountMenu = useCallback((): void => {
    setAccountMenuAnchor(null);
  }, []);

  const [openAccountDialog] = useDialogNavigation("a");

  const handleOpenSignupDialog = useCallback((): void => {
    openAccountDialog("signup");
  }, [openAccountDialog]);
  const handleOpenLoginDialog = useCallback((): void => {
    openAccountDialog("login");
  }, [openAccountDialog]);

  const isAuthenticated = isSignedIn && !isAnonymous;

  const accountLabel = username || "Your Account";

  const stagger = 0.05;
  const slideInitial = -24;

  return (
    <>
      {isSignedIn !== undefined && (
        <StyledPageNavigationLinks>
          {canInstall && !isInstalled && !isAppInstalled() && (
            <StyledMotionListItem
              key="Install"
              orientation="horizontal"
              initial={slideInitial}
              animate={0}
              delay={0 * stagger}
            >
              <FadeAnimation initial={0} animate={1} delay={0 * stagger}>
                <HoverTapTransition
                  whileHover={hoverVariant}
                  whileTap={tapVariant}
                >
                  <StyledInstallButton
                    aria-label="Install"
                    variant="outlined"
                    color="inherit"
                    style={{ borderRadius: 16 }}
                    onClick={onInstall}
                  >
                    {install}
                  </StyledInstallButton>
                </HoverTapTransition>
              </FadeAnimation>
            </StyledMotionListItem>
          )}
          {navbarPages.map((link, index) => (
            <StyledMotionListItem
              key={link}
              orientation="horizontal"
              initial={slideInitial}
              animate={0}
              delay={(index + 1) * stagger}
            >
              <FadeAnimation
                initial={0}
                animate={1}
                delay={(index + 1) * stagger}
              >
                <HoverTapTransition
                  whileHover={hoverVariant}
                  whileTap={tapVariant}
                >
                  {link === "#donate" ? (
                    <StyledButton
                      href={`https://www.patreon.com/impowergames`}
                      aria-label={pageNames[link]}
                      color="inherit"
                    >
                      {pageNames[link]}
                    </StyledButton>
                  ) : (
                    <NextLink href={link} passHref>
                      <StyledButton
                        aria-label={pageNames[link]}
                        color="inherit"
                      >
                        {pageNames[link]}
                      </StyledButton>
                    </NextLink>
                  )}
                </HoverTapTransition>
              </FadeAnimation>
            </StyledMotionListItem>
          ))}
          <StyledMotionListItem
            key="Account"
            orientation="horizontal"
            initial={slideInitial}
            animate={0}
            delay={(navbarPages.length + 2) * stagger}
          >
            <FadeAnimation
              initial={0}
              animate={1}
              delay={(navbarPages.length + 2) * stagger}
            >
              <StyledAccountArea>
                {!isAuthenticated &&
                  unauthenticatedAccountPages.map((link) => (
                    <HoverTapTransition
                      key={pageNames[link]}
                      whileHover={hoverVariant}
                      whileTap={tapVariant}
                    >
                      {useAccountDialog ? (
                        <StyledAccountButton
                          variant={link === "/login" ? "contained" : "outlined"}
                          color="inherit"
                          disableElevation
                          style={{
                            backgroundColor:
                              link === "/login"
                                ? theme.palette.grey[300]
                                : undefined,
                            color:
                              link === "/login"
                                ? theme.palette.getContrastText("#fff")
                                : undefined,
                          }}
                          onClick={
                            link === "/login"
                              ? handleOpenLoginDialog
                              : handleOpenSignupDialog
                          }
                        >
                          {pageNames[link]}
                        </StyledAccountButton>
                      ) : (
                        <NextLink href={link} passHref>
                          <StyledAccountButton
                            variant={
                              link === "/login" ? "contained" : "outlined"
                            }
                            color="inherit"
                            disableElevation
                            style={{
                              backgroundColor:
                                link === "/login"
                                  ? theme.palette.grey[300]
                                  : undefined,
                              color:
                                link === "/login"
                                  ? theme.palette.getContrastText("#fff")
                                  : undefined,
                            }}
                          >
                            {pageNames[link]}
                          </StyledAccountButton>
                        </NextLink>
                      )}
                    </HoverTapTransition>
                  ))}
                {isAuthenticated && (
                  <HoverTapTransition
                    key={accountLabel}
                    whileHover={hoverVariant}
                    whileTap={tapVariant}
                  >
                    <StyledIconButton
                      onClick={handleOpenAccountMenu}
                      size="large"
                    >
                      {icon && <StyledAvatar src={icon} />}
                      {!icon && (
                        <FontIcon
                          color="white"
                          aria-label={accountLabel}
                          size={24}
                        >
                          <CircleUserSolidIcon />
                        </FontIcon>
                      )}
                    </StyledIconButton>
                    <AccountMenu
                      anchorEl={accountMenuAnchor}
                      onClose={handleCloseAccountMenu}
                    >
                      <StyledAccountInfoArea>
                        <StyledAvatarArea>
                          {icon && (
                            <Avatar
                              alt={accountLabel}
                              src={icon}
                              backgroundColor={hex}
                            />
                          )}
                          {!icon && (
                            <FontIcon aria-label={accountLabel} size={24}>
                              <CircleUserSolidIcon />
                            </FontIcon>
                          )}
                        </StyledAvatarArea>
                        <StyledTypography>{accountLabel}</StyledTypography>
                      </StyledAccountInfoArea>
                      <StyledDivider />
                    </AccountMenu>
                  </HoverTapTransition>
                )}
              </StyledAccountArea>
            </FadeAnimation>
          </StyledMotionListItem>
        </StyledPageNavigationLinks>
      )}
    </>
  );
});

export default PageNavigationLinks;
