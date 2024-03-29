import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tab from "@mui/material/Tab";
import useMediaQuery from "@mui/material/useMediaQuery";
import dynamic from "next/dynamic";
import React, { PropsWithChildren, useCallback, useState } from "react";
import BarsRegularIcon from "../../../../resources/icons/regular/bars.svg";
import { useDialogNavigation } from "../../../impower-dialog";
import { FontIcon } from "../../../impower-icon";
import { useRouter } from "../../../impower-router";
import FadeAnimation from "../animations/FadeAnimation";
import Tabs from "../layouts/Tabs";
import Avatar from "./Avatar";

const Navdrawer = dynamic(() => import("./Navdrawer"), { ssr: false });

const StyledFixedSpacer = styled.div`
  margin-top: env(safe-area-inset-top, 0);
  margin-left: env(safe-area-inset-left, 0);

  min-height: ${(props): string => props.theme.minHeight.navigationBar};
  min-width: ${(props): string => props.theme.minWidth.navigationBar};
`;

const StyledEngineNavigationBar = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  z-index: 3;
  background-color: ${(props): string => props.theme.palette.primary.dark};
  color: white;
  top: 0;
  bottom: 0;

  padding-top: env(safe-area-inset-top, 0);
  padding-left: env(safe-area-inset-left, 0);
`;

const StyledSidebar = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  background-color: ${(props): string => props.theme.palette.primary.dark};
  color: white;

  min-height: ${(props): string => props.theme.minHeight.navigationBar};
  min-width: ${(props): string => props.theme.minWidth.navigationBar};
`;

const StyledMenuArea = styled.div`
  padding: ${(props): string => props.theme.spacing(1, 1)};
  display: flex;
  justify-content: center;
  align-items: center;
`;

const StyledDividerArea = styled.div``;

const StyledDivider = styled(Divider)`
  background-color: ${(props): string => props.theme.colors.white10};
  margin: 0;
`;

const ButtonArea = styled.div`
  border-radius: 50%;
  margin: ${(props): string => props.theme.spacing(0.75, 0.75)};
  min-width: ${(props): string => props.theme.spacing(6)};
  min-height: ${(props): string => props.theme.spacing(6)};
  box-shadow: 0px 0px 0px 0px white,
    ${(props): string => props.theme.shadows[0]};
  transition: border-radius, box-shadow 0.2s ease;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;

  &.selected {
    box-shadow: 0px 0px 0px 3px white,
      ${(props): string => props.theme.shadows[24]};
    border-radius: ${(props): string => props.theme.spacing(1)};
  }
`;

const StyledTabsArea = styled(FadeAnimation)`
  flex: 1;
  position: relative;
  min-width: 0;
  min-height: 0;
`;

const StyledTabsContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  min-width: 0;
  min-height: 0;
`;

const StyledTabs = styled(Tabs)`
  height: 100%;
  max-height: 100%;
`;

const StyledTab = styled(Tab)<{ component?: string }>`
  min-width: ${(props): string => props.theme.spacing(8)};
`;

interface EngineNavigationBarProps {
  links: {
    label: string;
    link: string;
    icon?: React.ReactNode;
    image?: string;
    backgroundColor?: string;
  }[];
}

const EngineNavigationBar = React.memo(
  (props: PropsWithChildren<EngineNavigationBarProps>): JSX.Element | null => {
    const { links, children } = props;

    const [navdrawerOpenState, setNavdrawerOpenState] = useState<boolean>();

    const router = useRouter();

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.n !== prevState?.n) {
          setNavdrawerOpenState(currState?.n === "navdrawer");
        }
      },
      []
    );
    const [openNavDialog, closeNavDialog] = useDialogNavigation(
      "n",
      handleBrowserNavigation
    );

    const handleOpenNavdrawer = useCallback((): void => {
      setNavdrawerOpenState(true);
      openNavDialog("navdrawer");
    }, [openNavDialog]);

    const handleCloseNavdrawer = useCallback((): void => {
      setNavdrawerOpenState(false);
      closeNavDialog();
    }, [closeNavDialog]);

    const theme = useTheme();

    const belowXsBreakpoint = useMediaQuery(theme.breakpoints.down("sm"));

    const position = belowXsBreakpoint ? "relative" : "fixed";
    const flexDirection = belowXsBreakpoint ? "row" : "column";
    const dividerOrientation = belowXsBreakpoint ? "vertical" : "horizontal";
    const tabsOrientation = belowXsBreakpoint ? "horizontal" : "vertical";
    const maxWidth = belowXsBreakpoint
      ? undefined
      : theme.minWidth.navigationBar;
    const maxHeight = belowXsBreakpoint
      ? theme.minHeight.navigationBar
      : undefined;

    const margin = belowXsBreakpoint
      ? theme.spacing(0, 0.5)
      : theme.spacing(0.5, 0);

    const dividerPadding = belowXsBreakpoint
      ? theme.spacing(2, 0)
      : theme.spacing(0, 2);

    const tabIndex = links?.findIndex(({ link }) =>
      router.asPath.startsWith(link)
    );
    const tabValue = Math.max(0, tabIndex >= 0 ? tabIndex : links?.length || 0);

    const minMenuWidth = belowXsBreakpoint
      ? theme.spacing(7)
      : theme.minWidth.navigationBar;

    return (
      <>
        <StyledFixedSpacer
          className="navigation-bar"
          style={{
            display: position === "fixed" ? undefined : "none",
          }}
        />
        <StyledEngineNavigationBar
          className="navigation-bar"
          style={{
            position,
          }}
        >
          <StyledSidebar
            style={{
              flexDirection,
              maxWidth,
              maxHeight,
            }}
          >
            <StyledMenuArea
              style={{
                minWidth: minMenuWidth,
                minHeight: theme.minHeight.navigationBar,
              }}
            >
              <IconButton
                aria-label="open drawer"
                onClick={handleOpenNavdrawer}
              >
                <FontIcon aria-label="Menu" size={24} color="white">
                  <BarsRegularIcon />
                </FontIcon>
              </IconButton>
            </StyledMenuArea>
            <StyledDividerArea style={{ padding: dividerPadding }}>
              <StyledDivider
                variant="middle"
                orientation={dividerOrientation}
              />
            </StyledDividerArea>
            <StyledTabsArea initial={0} animate={links ? 1 : 0}>
              <StyledTabsContent>
                <StyledTabs
                  value={tabValue}
                  orientation={tabsOrientation}
                  variant="scrollable"
                  indicatorColor="white"
                >
                  {links &&
                    links.map(
                      ({ label, link, image, icon, backgroundColor }) => (
                        <StyledTab
                          key={link}
                          icon={
                            <ButtonArea
                              className={
                                router.asPath.startsWith(link)
                                  ? "selected"
                                  : undefined
                              }
                            >
                              <Avatar
                                backgroundColor={backgroundColor}
                                src={image}
                                alt={label}
                                icon={icon}
                                fontSize={theme.fontSize.smallerIcon}
                                style={{
                                  borderRadius: "inherit",
                                  width: theme.spacing(6),
                                  height: theme.spacing(6),
                                }}
                              />
                            </ButtonArea>
                          }
                          onClick={(): void => {
                            router.replace(link);
                          }}
                        />
                      )
                    )}
                  <StyledTab
                    key="children"
                    component="div"
                    icon={
                      <ButtonArea style={{ margin }}>{children}</ButtonArea>
                    }
                  />
                </StyledTabs>
              </StyledTabsContent>
            </StyledTabsArea>
            {navdrawerOpenState !== undefined && (
              <Navdrawer
                open={navdrawerOpenState}
                useAccountDialog
                onClose={handleCloseNavdrawer}
              />
            )}
          </StyledSidebar>
        </StyledEngineNavigationBar>
      </>
    );
  }
);

export default EngineNavigationBar;
