import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Avatar from "@material-ui/core/Avatar";
import Button from "@material-ui/core/Button";
import Divider from "@material-ui/core/Divider";
import Drawer from "@material-ui/core/Drawer";
import IconButton from "@material-ui/core/IconButton";
import List from "@material-ui/core/List";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import Typography from "@material-ui/core/Typography";
import React, { useCallback, useContext, useEffect, useState } from "react";
import PatreonBrandsIcon from "../../../../resources/icons/brands/patreon.svg";
import ArrowLeftRegularIcon from "../../../../resources/icons/regular/arrow-left.svg";
import BullhornSolidIcon from "../../../../resources/icons/solid/bullhorn.svg";
import CircleUserSolidIcon from "../../../../resources/icons/solid/circle-user.svg";
import GamepadSolidIcon from "../../../../resources/icons/solid/gamepad.svg";
import HouseSolidIcon from "../../../../resources/icons/solid/house.svg";
import PhotoFilmSolidIcon from "../../../../resources/icons/solid/photo-film.svg";
import SquareArrowDownSolidIcon from "../../../../resources/icons/solid/square-arrow-down.svg";
import { useDialogNavigation } from "../../../impower-dialog";
import { FontIcon } from "../../../impower-icon";
import { isAppInstalled, ServiceWorkerContext } from "../../../impower-pwa";
import { useRouter } from "../../../impower-router";
import { UserContext } from "../../../impower-user";
import { brandingInfo } from "../../types/info/branding";
import { pageNames } from "../../types/info/pageNames";
import { getBaseRoute } from "../../utils/getBaseRoute";
import FadeAnimation from "../animations/FadeAnimation";
import AppToolbar from "../layouts/AppToolbar";
import AccountMenu from "../menus/AccountMenu";
import Title from "./Title";

export const unauthenticatedAccountPages: string[] = ["/signup", "/login"];
export const navbarPages: string[] = process.env.NEXT_PUBLIC_ORIGIN?.includes(
  "localhost"
)
  ? ["/pitch", "/library", "/dashboard", "#donate"]
  : ["/pitch", "#donate"];
export const install = "Install";

const pageIcons: { [baseRoute: string]: React.ReactNode } = {
  "/account": <CircleUserSolidIcon />,
  "/profile": <CircleUserSolidIcon />,
  "/": <HouseSolidIcon />,
  "/pitch": <BullhornSolidIcon />,
  "/library": <PhotoFilmSolidIcon />,
  "/dashboard": <GamepadSolidIcon />,
  "#donate": <PatreonBrandsIcon />,
};

const StyledDrawer = styled(Drawer)`
  will-change: transform;
  transform: translateZ(0);
`;

const StyledListItemButton = styled(Button)<{ selected?: boolean }>`
  border-radius: 0;
  display: flex;
  text-transform: none;
  color: ${(props): string =>
    props.selected
      ? props.theme.palette.primary.main
      : props.theme.palette.text.primary};
  flex: 1;
  width: 100%;
  justify-content: flex-start;
  padding-top: ${(props): string => props.theme.spacing(1)};
  padding-bottom: ${(props): string => props.theme.spacing(1)};
  padding-left: ${(props): string => props.theme.spacing(2)};
  padding-right: ${(props): string => props.theme.spacing(2)};
  ${(props): string => props.theme.breakpoints.down("md")} {
    padding-left: ${(props): string => props.theme.spacing(1)};
    padding-right: ${(props): string => props.theme.spacing(1)};
  }
`;

const StyledListItemText = styled(ListItemText)<{ selected?: boolean }>`
  text-align: left;
  & .MuiTypography-root {
    font-weight: ${(props): number => (props.selected ? 600 : 400)};
  }
`;

const StyledListItemIcon = styled(ListItemIcon)<{ selected?: boolean }>`
  &.MuiListItemIcon-root {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: ${(props): string => props.theme.spacing(5)};
    margin-right: ${(props): string => props.theme.spacing(2)};
    ${(props): string => props.theme.breakpoints.down("md")} {
      margin-right: ${(props): string => props.theme.spacing(1)};
    }
  }
  color: ${(props): string =>
    props.selected
      ? props.theme.palette.primary.main
      : props.theme.palette.text.secondary};
`;

const anchor = "left";

const StyledSpacer = styled.div`
  flex: 1;
`;

const StyledMotionAccountArea = styled(FadeAnimation)`
  margin: ${(props): string => props.theme.spacing(1)};
  display: flex;
  align-items: center;
`;

const StyledButton = styled(Button)`
  margin-left: ${(props): string => props.theme.spacing(0.5)};
  margin-right: ${(props): string => props.theme.spacing(0.5)};
  flex: 1;
`;

const StyledAvatarArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(2)};
`;

const StyledTypography = styled(Typography)``;

const StyledIconButton = styled(IconButton)`
  flex: 1;
`;

const { product } = brandingInfo;

interface ListItemContentProps {
  label: string;
  selected: boolean;
  icon?: React.ReactNode;
}

const ListItemContent = React.memo(
  (props: ListItemContentProps): JSX.Element => {
    const { selected, label, icon } = props;
    return (
      <>
        <StyledListItemIcon selected={selected}>
          <FontIcon aria-label={label} size={18}>
            {icon}
          </FontIcon>
        </StyledListItemIcon>
        <StyledListItemText selected={selected} primary={label} />
      </>
    );
  }
);

interface ListItemProps {
  label: string;
  href?: string;
  selected: boolean;
  icon?: React.ReactNode;
  onClick: (e: React.MouseEvent, href: string) => void;
}

const ListItem = React.memo((props: ListItemProps): JSX.Element => {
  const { label, icon, href, selected, onClick } = props;
  return (
    <StyledListItemButton
      selected={selected}
      href={href}
      onClick={(e): void => onClick(e, href)}
    >
      <ListItemContent selected={selected} label={label} icon={icon} />
    </StyledListItemButton>
  );
});

interface NavdrawerProps {
  open: boolean;
  useAccountDialog?: boolean;
  onClose: (e: React.MouseEvent) => void;
}

const Navdrawer = React.memo((props: NavdrawerProps): JSX.Element => {
  const { open, useAccountDialog, onClose } = props;
  const [openState, setOpenState] = useState(false);
  const [userState] = useContext(UserContext);
  const { isSignedIn, isAnonymous, userDoc } = userState;
  const username = userDoc?.username;
  const icon = userDoc?.icon?.fileUrl;

  useEffect(() => {
    setOpenState(open);
  }, [open]);

  const { isInstalled, canInstall, onInstall } =
    useContext(ServiceWorkerContext);
  const [accountMenuAnchor, setAccountMenuAnchor] =
    React.useState<null | HTMLElement>(null);

  const router = useRouter();
  const theme = useTheme();

  const { slogan } = brandingInfo;

  const baseRoute = getBaseRoute(router.route);

  const handleClose = useCallback(
    (e: React.MouseEvent): void => {
      if (onClose) {
        onClose(e);
      }
    },
    [onClose]
  );
  const handleOpenAccountMenu = useCallback((e: React.MouseEvent): void => {
    setAccountMenuAnchor(e.target as HTMLElement);
  }, []);
  const handleCloseAccountMenu = useCallback((): void => {
    setAccountMenuAnchor(null);
  }, []);

  const [openAccountDialog] = useDialogNavigation("a");

  const handleOpenSignupDialog = useCallback(
    async (e: React.MouseEvent): Promise<void> => {
      handleClose(e);
      // wait a bit for dialog to close
      await new Promise((resolve) => window.setTimeout(resolve, 10));
      openAccountDialog("signup");
    },
    [handleClose, openAccountDialog]
  );
  const handleOpenLoginDialog = useCallback(
    async (e: React.MouseEvent): Promise<void> => {
      handleClose(e);
      // wait a bit for dialog to close
      await new Promise((resolve) => window.setTimeout(resolve, 10));
      openAccountDialog("login");
    },
    [handleClose, openAccountDialog]
  );

  const handleClick = useCallback(
    async (e: React.MouseEvent, href?: string): Promise<void> => {
      if (href === "/install") {
        if (onInstall) {
          onInstall();
        }
      } else {
        handleClose(e);
        if (href) {
          // wait a bit for dialog to close
          await new Promise((resolve) => window.setTimeout(resolve, 10));
          router.push(href);
        }
      }
    },
    [handleClose, onInstall, router]
  );

  const handleClickAccountMenuOption = useCallback(
    async (e: React.MouseEvent): Promise<void> => {
      handleClose(e);
      // wait a bit for dialog to close
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    },
    [handleClose]
  );

  const isAuthenticated = isSignedIn && !isAnonymous;

  const accountLabel = username || "Your Account";

  return (
    <StyledDrawer anchor={anchor} open={openState} onClose={handleClose}>
      <AppToolbar
        icon={<ArrowLeftRegularIcon />}
        iconAriaLabel="Back"
        onClickIcon={handleClose}
      >
        <Title
          title={product}
          secondaryTitle={pageNames[baseRoute]}
          subtitle={slogan}
          separator="|"
        />
      </AppToolbar>
      <Divider />
      <List>
        {navbarPages.map((link) => (
          <ListItem
            key={link}
            label={pageNames[link]}
            icon={pageIcons[link]}
            href={
              link === "#donate" ? `https://www.patreon.com/impowergames` : link
            }
            selected={link === baseRoute}
            onClick={handleClick}
          />
        ))}
        {canInstall && !isInstalled && !isAppInstalled() && (
          <ListItem
            label={install}
            href={"/install"}
            icon={<SquareArrowDownSolidIcon />}
            selected={false}
            onClick={handleClick}
          />
        )}
      </List>
      <StyledSpacer className={StyledSpacer.displayName} />
      <StyledMotionAccountArea
        className={StyledMotionAccountArea.displayName}
        // Don't render the account area until we've determined the user's login state,
        // so that the UI doesn't flash between the logged out and logged in states
        initial={0}
        animate={isSignedIn === undefined ? 0 : 1}
      >
        {!isAuthenticated &&
          unauthenticatedAccountPages.map((link) =>
            useAccountDialog ? (
              <StyledButton
                variant="outlined"
                color={link === "/login" ? "secondary" : undefined}
                onClick={
                  link === "/login"
                    ? handleOpenLoginDialog
                    : handleOpenSignupDialog
                }
              >
                <StyledTypography>{pageNames[link]}</StyledTypography>
              </StyledButton>
            ) : (
              <StyledButton
                variant="outlined"
                color={link === "/login" ? "secondary" : undefined}
                onClick={handleClick}
              >
                <StyledTypography>{pageNames[link]}</StyledTypography>
              </StyledButton>
            )
          )}
        {isAuthenticated && (
          <>
            <StyledIconButton
              className={StyledIconButton.displayName}
              onClick={handleOpenAccountMenu}
              style={{
                justifyContent: "flex-start",
                borderRadius: theme.spacing(1),
              }}
            >
              <StyledAvatarArea className={StyledAvatarArea.displayName}>
                {icon && <Avatar alt={accountLabel} src={icon} />}
                {!icon && (
                  <FontIcon aria-label={accountLabel} size={24}>
                    <CircleUserSolidIcon />
                  </FontIcon>
                )}
              </StyledAvatarArea>
              <StyledTypography className={StyledTypography.displayName}>
                {accountLabel}
              </StyledTypography>
            </StyledIconButton>
            <AccountMenu
              anchorEl={accountMenuAnchor}
              onClose={handleCloseAccountMenu}
              onClick={handleClickAccountMenuOption}
            />
          </>
        )}
      </StyledMotionAccountArea>
    </StyledDrawer>
  );
});

export default Navdrawer;
