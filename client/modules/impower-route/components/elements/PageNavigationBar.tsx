import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { hexToHsla, hslaToHex } from "../../../impower-core";
import { useDialogNavigation } from "../../../impower-dialog";
import { useBodyPaddingCallback } from "../../hooks/useBodyPaddingCallback";
import { MenuInfo } from "../../types/info/menus";
import { pageNames } from "../../types/info/pageNames";
import { getBaseRoute } from "../../utils/getBaseRoute";
import PageNavigationBarContent from "./PageNavigationBarContent";

const Navdrawer = dynamic(() => import("./Navdrawer"), { ssr: false });

const StyledAppBar = styled.div`
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
  max-width: 100vw;
  display: flex;
  border: 0;
  border-radius: 0;
  width: 100%;
  align-items: center;
  flex-flow: row nowrap;
  justify-content: flex-start;
  will-change: transform;
  transform: translateZ(0);

  padding-top: env(safe-area-inset-top, 0);
  z-index: 3;
`;

const StyledHeaderBackgroundArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
`;

const StyledHeaderBackground = styled.div`
  position: absolute;
  top: -192px;
  bottom: 0;
  left: 0;
  right: 0;
  transition: 0.2s ease;
  min-height: 192px;
`;

const StyledToolbarArea = styled.div`
  flex: 1;
  display: flex;
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
  position: relative;
`;

const StyledToolbar = styled.div`
  display: flex;
  padding-left: ${(props): string => props.theme.spacing(2)};
  padding-right: ${(props): string => props.theme.spacing(2)};
  ${(props): string => props.theme.breakpoints.down("md")} {
    padding-left: ${(props): string => props.theme.spacing(1)};
    padding-right: ${(props): string => props.theme.spacing(1)};
  }
  width: 100%;
  position: relative;
  align-items: center;
  justify-content: center;
`;

interface PageNavigationBarProps {
  title: string;
  secondaryTitle: string;
  subtitle: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  titleLinks: MenuInfo[];
  elevation?: number;
  backgroundColor?: string;
  backgroundOpacity?: number;
  appBarPosition?: "relative" | "fixed" | "absolute" | "sticky" | "static";
  style?: React.CSSProperties;
}

const PageNavigationBar = (props: PageNavigationBarProps): JSX.Element => {
  const theme = useTheme();
  const router = useRouter();
  const baseRoute = getBaseRoute(router.route);

  const {
    title,
    secondaryTitle = pageNames[baseRoute],
    subtitle,
    searchLabel,
    searchPlaceholder,
    searchValue,
    titleLinks,
    elevation = 4,
    backgroundColor = theme.palette.primary.main,
    backgroundOpacity = 1,
    appBarPosition = "fixed",
    style,
  } = props;

  const [headerBackground, setHeaderBackground] = useState<HTMLDivElement>();
  const [navdrawerOpenState, setNavdrawerOpenState] = useState<boolean>();

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
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

  const adjustedBackgroundColor =
    backgroundColor === "transparent"
      ? theme.palette.primary.main
      : hslaToHex({
          ...hexToHsla(backgroundColor || theme.palette.primary.main),
          a: backgroundOpacity,
        });

  useEffect(() => {
    const metaThemeColor = document.querySelector("meta[name=theme-color]");
    metaThemeColor.setAttribute("content", adjustedBackgroundColor);
  }, [adjustedBackgroundColor]);

  const handleHeaderBackgroundRef = useCallback(
    (instance: HTMLDivElement): void => {
      if (instance) {
        setHeaderBackground(instance);
      }
    },
    []
  );

  useBodyPaddingCallback("paddingRight", 0, headerBackground);

  const useAccountDialog = useMemo(() => {
    return !["/signup", "/login", "/confirm"].some((x) =>
      window.location.pathname.endsWith(x)
    );
  }, []);

  return (
    <>
      <StyledAppBar
        key={appBarPosition}
        style={{
          color: "white",
          position: appBarPosition,
          boxShadow: theme.shadows[elevation],
          ...style,
        }}
      >
        <StyledHeaderBackgroundArea ref={handleHeaderBackgroundRef}>
          <StyledHeaderBackground
            style={{
              backgroundColor: adjustedBackgroundColor,
              opacity: backgroundColor === "transparent" ? 0 : 1,
            }}
          />
          <StyledToolbarArea>
            <StyledToolbar>
              <PageNavigationBarContent
                initial="show"
                searchLabel={searchLabel}
                searchPlaceholder={searchPlaceholder}
                searchValue={searchValue}
                title={title}
                secondaryTitle={secondaryTitle}
                subtitle={subtitle}
                titleLinks={titleLinks}
                backgroundOpacity={backgroundOpacity}
                useAccountDialog={useAccountDialog}
                onClickMenuButton={handleOpenNavdrawer}
              />
            </StyledToolbar>
          </StyledToolbarArea>
        </StyledHeaderBackgroundArea>
      </StyledAppBar>
      {navdrawerOpenState !== undefined && (
        <Navdrawer
          open={navdrawerOpenState}
          useAccountDialog={useAccountDialog}
          onClose={handleCloseNavdrawer}
        />
      )}
    </>
  );
};

export default PageNavigationBar;
