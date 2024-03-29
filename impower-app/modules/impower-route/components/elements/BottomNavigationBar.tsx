import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import React from "react";
import { FontIcon } from "../../../impower-icon";
import { ButtonInfo } from "../../types/info/button";

const StyledBottomNavigation = styled(BottomNavigation)`
  height: ${(props): string => props.theme.minHeight.navigationBar};
  width: 100%;
  background-color: ${(props): string => props.theme.palette.primary.main};
  pointer-events: auto;
  z-index: 1;
`;

const StyledBottomNavigationAction = styled(BottomNavigationAction)`
  flex-grow: 1;
  min-width: 0;
  background-color: ${(props): string => props.theme.palette.primary.main};

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: transparent;
      &::after {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
        background-color: ${(props): string => props.theme.colors.lightHover};
        pointer-events: none;
        content: "";
      }
    }
  }
`;

const StyledBottomNavigationActionLabel = styled.div`
  color: ${(props): string => props.theme.palette.secondary.light};

  .MuiBottomNavigationAction-label.Mui-selected & {
    color: white;
  }
`;

const StyledIcon = styled.div`
  padding: ${(props): string => props.theme.spacing(0.5)};
  color: ${(props): string => props.theme.palette.secondary.light};

  .MuiBottomNavigationAction-root.Mui-selected & {
    color: white;
  }
`;

interface BottomNavigationBarProps {
  buttons: ButtonInfo[];
  value: string;
  onChange: (event: React.ChangeEvent<unknown>, key: string) => void;
}

const BottomNavigationBar = React.memo(
  (props: BottomNavigationBarProps): JSX.Element => {
    const { buttons, value, onChange } = props;
    const theme = useTheme();
    return (
      <StyledBottomNavigation
        className="bottom-navigation-bar"
        showLabels
        value={value}
        onChange={onChange}
      >
        {buttons.map((window) => {
          const Icon = value === window.type ? window.iconOn : window.iconOff;
          return (
            <StyledBottomNavigationAction
              key={window.type as string}
              label={
                <StyledBottomNavigationActionLabel>
                  {window.name}
                </StyledBottomNavigationActionLabel>
              }
              value={window.type}
              icon={
                <>
                  <StyledIcon>
                    <FontIcon
                      aria-label={`${window.name} Window`}
                      size={theme.fontSize.smallIcon}
                    >
                      <Icon />
                    </FontIcon>
                  </StyledIcon>
                </>
              }
            />
          );
        })}
      </StyledBottomNavigation>
    );
  }
);

export default BottomNavigationBar;
