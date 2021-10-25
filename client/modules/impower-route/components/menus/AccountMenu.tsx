import styled from "@emotion/styled";
import MenuItem from "@material-ui/core/MenuItem";
import React, { useCallback, useContext } from "react";
import ArrowRightFromBracketRegularIcon from "../../../../resources/icons/regular/arrow-right-from-bracket.svg";
import GearRegularIcon from "../../../../resources/icons/regular/gear.svg";
import { FontIcon } from "../../../impower-icon";
import {
  UserContext,
  userSetTempEmail,
  userSetTempUsername,
} from "../../../impower-user";
import { MenuInfo, MenuType } from "../../types/info/menus";
import DrawerMenu from "../popups/DrawerMenu";

const StyledIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1.5)};
  opacity: 0.7;
`;

export const authenticatedAccountMenuItems: MenuInfo[] = [
  {
    type: MenuType.Account,
    label: "Your Account",
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
  onClick?: (e: React.MouseEvent) => void;
}

const AccountMenu = React.memo((props: AccountMenuProps) => {
  const { anchorEl, onClose, onClick = (): void => null } = props;

  const [, userDispatch] = useContext(UserContext);

  const handleClick = useCallback(
    async (e: React.MouseEvent, menuItem: MenuInfo) => {
      if (onClose) {
        onClose(e);
      }
      onClick(e);
      const router = (await import("next/router")).default;
      if (menuItem.type === MenuType.Logout) {
        userDispatch(userSetTempEmail(""));
        userDispatch(userSetTempUsername(""));
        const logout = (await import("../../../impower-auth/utils/logout"))
          .default;
        router.replace(menuItem.link).then(() => logout());
      } else {
        router.replace(menuItem.link);
      }
    },
    [onClose, onClick, userDispatch]
  );

  return (
    <DrawerMenu open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={onClose}>
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
