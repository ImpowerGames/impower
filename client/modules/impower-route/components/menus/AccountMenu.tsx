import styled from "@emotion/styled";
import MenuItem from "@material-ui/core/MenuItem";
import React, { PropsWithChildren, useCallback, useContext } from "react";
import ArrowRightFromBracketRegularIcon from "../../../../resources/icons/regular/arrow-right-from-bracket.svg";
import BellRegularIcon from "../../../../resources/icons/regular/bell.svg";
import GearRegularIcon from "../../../../resources/icons/regular/gear.svg";
import HandshakeSimpleRegularIcon from "../../../../resources/icons/regular/handshake-simple.svg";
import HeartRegularIcon from "../../../../resources/icons/regular/heart.svg";
import UserRegularIcon from "../../../../resources/icons/regular/user.svg";
import { FontIcon } from "../../../impower-icon";
import {
  UserContext,
  userSetTempEmail,
  userSetTempUsername,
} from "../../../impower-user";
import { MenuInfo, MenuType } from "../../types/info/menus";
import DrawerMenu from "../popups/DrawerMenu";

const StyledIconArea = styled.div`
  margin-right: ${(props): string => props.theme.spacing(2)};
  width: 24px;
  opacity: 0.7;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const authenticatedAccountMenuItems: MenuInfo[] = [
  {
    type: MenuType.Profile,
    label: "Profile",
    link: "/profile",
    icon: <UserRegularIcon />,
  },
  {
    type: MenuType.Notifications,
    label: "Notifications",
    link: "/notifications",
    icon: <BellRegularIcon />,
  },
  {
    type: MenuType.Connections,
    label: "Connections",
    link: "/connections",
    icon: <HandshakeSimpleRegularIcon />,
  },
  {
    type: MenuType.Kudos,
    label: "Kudos",
    link: "/kudos",
    icon: <HeartRegularIcon />,
  },
  {
    type: MenuType.Account,
    label: "Account",
    link: "/account",
    icon: <GearRegularIcon />,
  },
  {
    type: MenuType.Logout,
    label: "Log Out",
    link: "/login",
    icon: <ArrowRightFromBracketRegularIcon />,
  },
];

interface AccountMenuProps {
  anchorEl: HTMLElement | null;
  onClose: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent, menuItem: MenuInfo) => Promise<void>;
}

const AccountMenu = React.memo((props: PropsWithChildren<AccountMenuProps>) => {
  const { anchorEl, onClose, onClick, children } = props;

  const [userState, userDispatch] = useContext(UserContext);
  const { userDoc } = userState;
  const username = userDoc?.username;

  const handleClick = useCallback(
    async (e: React.MouseEvent, menuItem: MenuInfo) => {
      if (onClose) {
        onClose(e);
      }
      // wait a bit for dialog to close
      await new Promise((resolve) => window.setTimeout(resolve, 1));
      if (onClick) {
        await onClick(e, menuItem);
      }
      const router = (await import("next/router")).default;
      if (menuItem.type === MenuType.Profile) {
        await router.replace(`/u/${username}`);
      } else if (menuItem.type === MenuType.Logout) {
        userDispatch(userSetTempEmail(""));
        userDispatch(userSetTempUsername(""));
        const logout = (await import("../../../impower-auth/utils/logout"))
          .default;
        await router.replace(menuItem.link);
        await logout();
      } else {
        await router.replace(menuItem.link);
      }
    },
    [onClick, onClose, userDispatch, username]
  );

  return (
    <DrawerMenu open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={onClose}>
      {children}
      {authenticatedAccountMenuItems &&
        authenticatedAccountMenuItems.map((menuItem) => (
          <MenuItem
            key={menuItem.label}
            onClick={(e): Promise<void> => handleClick(e, menuItem)}
          >
            <StyledIconArea>
              <FontIcon aria-label={menuItem.label}>{menuItem.icon}</FontIcon>
            </StyledIconArea>
            {menuItem.label}
          </MenuItem>
        ))}
    </DrawerMenu>
  );
});

export default AccountMenu;
