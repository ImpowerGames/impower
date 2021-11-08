import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import React, { useCallback, useContext, useRef, useState } from "react";
import {
  confirmDialogClose,
  ConfirmDialogContext,
} from "../../../impower-confirm-dialog";
import { useDialogNavigation } from "../../../impower-dialog";
import {
  NavigationContext,
  navigationHideBanner,
} from "../../../impower-navigation";
import { toastClose, ToastContext } from "../../../impower-toast";
import { ScreenContext } from "../../contexts/screenContext";
import PageNavigationBar from "../elements/PageNavigationBar";
import AppContent from "./AppContent";

const ConfirmDialog = dynamic(() => import("../popups/ConfirmDialog"), {
  ssr: false,
});

const StudioNavigationBar = dynamic(
  () => import("../elements/StudioNavigationBar"),
  { ssr: false }
);

const Banner = dynamic(() => import("../popups/Banner"), { ssr: false });

const AccountDialog = dynamic(() => import("../elements/AccountDialog"), {
  ssr: false,
});

const Toast = dynamic(() => import("../popups/Toast"), { ssr: false });

const StyledAreaBox = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;

  &.app {
    opacity: 1;
  }

  code {
    font-family: source-code-pro, Menlo, Monaco, Consolas, "Courier New",
      monospace;
  }

  *:focus {
    outline: none;
  }

  svg {
    fill: currentColor;
  }

  @media (hover: hover) and (pointer: fine) {
    .MuiIconButton-root:hover {
      background-color: ${(props): string => props.theme.colors.black10};
    }
  }

  @keyframes MuiSkeleton-keyframes-pulse {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
    100% {
      opacity: 1;
    }
  }

  * .MuiSkeleton-pulse {
    animation: MuiSkeleton-keyframes-pulse 1.5s ease-in-out 0.5s infinite;
  }
`;

interface AppAreaProps {
  children?: React.ReactNode;
}

const AppArea = React.memo((props: AppAreaProps): JSX.Element => {
  const { children } = props;

  const [appDialogOpenKey, setAppDialogOpenKey] = useState<string>();

  const accountDialogOpen =
    appDialogOpenKey === "signup" ||
    appDialogOpenKey === "login" ||
    appDialogOpenKey?.startsWith("contact_");

  const screenState = useContext(ScreenContext);
  const [navigationState, navigationDispatch] = useContext(NavigationContext);
  const [toastState, toastDispatch] = useContext(ToastContext);
  const [confirmDialogState, confirmDialogDispatch] =
    useContext(ConfirmDialogContext);

  const processingRef = useRef(false);

  const handleToastClose = useCallback(() => {
    toastDispatch(toastClose());
  }, [toastDispatch]);

  const handleNavigationHideBanner = useCallback(() => {
    navigationDispatch(navigationHideBanner());
  }, [navigationDispatch]);

  const handleQueryChange = useCallback((currState: Record<string, string>) => {
    setAppDialogOpenKey(currState.a || null);
  }, []);

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.a !== prevState?.a) {
        setAppDialogOpenKey(currState?.a || null);
      }
    },
    []
  );
  const [, closeAppDialog] = useDialogNavigation(
    "a",
    handleBrowserNavigation,
    handleQueryChange
  );

  const handleNavCloseConfirmDialog = useCallback(() => {
    if (!processingRef.current) {
      confirmDialogDispatch(confirmDialogClose());
      closeAppDialog();
    }
  }, [confirmDialogDispatch, closeAppDialog]);

  const handleNavCloseAccountDialog = useCallback(() => {
    if (!processingRef.current) {
      setAppDialogOpenKey(null);
      closeAppDialog();
    }
  }, [closeAppDialog]);

  const handleProcessing = useCallback((processing: boolean) => {
    processingRef.current = processing;
  }, []);

  return (
    <StyledAreaBox className="app">
      {!screenState.fullscreen && navigationState.type === "page" && (
        <PageNavigationBar
          title={navigationState.title}
          secondaryTitle={navigationState.secondaryTitle}
          subtitle={navigationState.subtitle}
          titleLinks={navigationState.links}
          elevation={navigationState.elevation}
          backgroundColor={navigationState.backgroundColor}
          searchLabel={navigationState.search?.label}
          searchPlaceholder={navigationState.search?.placeholder}
          searchValue={navigationState.search?.value}
        />
      )}
      <AppContent
        fullscreen={screenState.fullscreen}
        navigationChildren={
          navigationState.type === "studio" ? (
            <StudioNavigationBar />
          ) : undefined
        }
        bannerChildren={
          navigationState?.banner?.mount ? (
            <Banner
              open={Boolean(navigationState.banner)}
              message={navigationState.banner?.message}
              severity={navigationState.banner?.severity}
              buttonLabel={navigationState.banner?.buttonLabel}
              onClick={navigationState.banner?.onClickButton}
              onClose={handleNavigationHideBanner}
            />
          ) : null
        }
      >
        {children}
      </AppContent>
      {toastState?.mount && (
        <Toast
          open={toastState.open}
          id={toastState.id}
          message={toastState.message}
          actionLabel={toastState.actionLabel}
          autoHideDuration={toastState.autoHideDuration}
          anchorOrigin={toastState.anchorOrigin}
          severity={toastState.severity}
          direction={toastState.direction}
          onAction={toastState.onAction}
          onClose={handleToastClose}
        />
      )}
      {confirmDialogState?.mount && (
        <ConfirmDialog
          open={confirmDialogState.open}
          title={confirmDialogState.title}
          content={confirmDialogState.content}
          agreeLabel={confirmDialogState.agreeLabel}
          disagreeLabel={confirmDialogState.disagreeLabel}
          onAgree={confirmDialogState.onAgree}
          onDisagree={confirmDialogState.onDisagree}
          disableAutoFocus={confirmDialogState.disableAutoFocus}
          disableEnforceFocus={confirmDialogState.disableEnforceFocus}
          disableRestoreFocus={confirmDialogState.disableRestoreFocus}
          asynchronous={confirmDialogState.asynchronous}
          responsive={confirmDialogState.responsive}
          onClose={handleNavCloseConfirmDialog}
        />
      )}
      {appDialogOpenKey !== undefined && (
        <AccountDialog
          open={accountDialogOpen}
          type={appDialogOpenKey}
          onClose={handleNavCloseAccountDialog}
          onProcessing={handleProcessing}
          onChangeType={setAppDialogOpenKey}
        />
      )}
    </StyledAreaBox>
  );
});

export default AppArea;
