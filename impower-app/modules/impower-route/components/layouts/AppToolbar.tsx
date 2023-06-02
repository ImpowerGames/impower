import styled from "@emotion/styled";
import IconButton from "@mui/material/IconButton";
import React, { PropsWithChildren } from "react";
import { FontIcon } from "../../../impower-icon";

const StyledToolbar = styled.div`
  display: flex;
  padding-top: ${(props): string => props.theme.spacing(1)};
  padding-bottom: ${(props): string => props.theme.spacing(1)};
  padding-left: ${(props): string => props.theme.spacing(2)};
  padding-right: ${(props): string => props.theme.spacing(2)};
  ${(props): string => props.theme.breakpoints.down("md")} {
    padding-left: ${(props): string => props.theme.spacing(1)};
    padding-right: ${(props): string => props.theme.spacing(1)};
  }
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
`;

const StyledIconButtonArea = styled.div`
  display: flex;
  align-items: center;
`;

interface AppToolbarProps {
  icon: React.ReactNode;
  iconAriaLabel: string;
  onClickIcon: (event: React.MouseEvent) => void;
}

const AppToolbar = (props: PropsWithChildren<AppToolbarProps>): JSX.Element => {
  const { icon, iconAriaLabel, children, onClickIcon } = props;
  return (
    <StyledToolbar className={StyledToolbar.displayName}>
      <StyledIconButtonArea className={StyledIconButtonArea.displayName}>
        <IconButton onClick={onClickIcon} autoFocus>
          <FontIcon aria-label={iconAriaLabel} size={24}>
            {icon}
          </FontIcon>
        </IconButton>
      </StyledIconButtonArea>
      {children}
    </StyledToolbar>
  );
};

export default AppToolbar;
