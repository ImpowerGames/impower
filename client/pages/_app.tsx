import { CacheProvider, EmotionCache } from "@emotion/react";
import CssBaseline from "@mui/material/CssBaseline";
import ThemeProvider from "@mui/material/styles/ThemeProvider";
import { AppProps } from "next/dist/shared/lib/router/router";
import React, { useEffect } from "react";
import createEmotionCache from "../lib/createEmotionCache";
import {
  ConfigContext,
  useConfigContextState,
} from "../modules/impower-config";
import HistoryState from "../modules/impower-dialog/classes/historyState";
import {
  IconLibraryContext,
  useIconLibraryContextState,
} from "../modules/impower-icon";
import { defaultTheme } from "../modules/impower-route";
import AppArea from "../modules/impower-route/components/layouts/AppArea";
import DeviceContextProvider from "../modules/impower-route/components/providers/DeviceContextProvider";
import DialogContextProvider from "../modules/impower-route/components/providers/DialogContextProvider";
import NavigationContextProvider from "../modules/impower-route/components/providers/NavigationContextProvider";
import RouterContextProvider from "../modules/impower-route/components/providers/RouterContextProvider";
import ScreenContextProvider from "../modules/impower-route/components/providers/ScreenContextProvider";
import ServiceWorkerContextProvider from "../modules/impower-route/components/providers/ServiceWorkerContextProvider";
import ToastContextProvider from "../modules/impower-route/components/providers/ToastContextProvider";
import UserContextProvider from "../modules/impower-route/components/providers/UserContextProvider";
import { useRouter } from "../modules/impower-router";

// Client-side cache, shared for the whole session of the user in the browser.
const clientSideEmotionCache = createEmotionCache();

interface MyAppProps extends AppProps {
  emotionCache?: EmotionCache;
}

const MyApp = React.memo((props: MyAppProps): JSX.Element => {
  const { Component, pageProps, emotionCache = clientSideEmotionCache } = props;
  const configContext = useConfigContextState();
  const iconLibraryContext = useIconLibraryContextState();

  useEffect(() => {
    const onPopstate = (e): void => {
      if (HistoryState.instance.opening || HistoryState.instance.closing) {
        return;
      }
      const currState = { ...(e?.state?.query || {}) };
      const prevState = { ...(HistoryState.instance.query || currState) };
      HistoryState.instance.browserListeners.forEach((listener) =>
        listener?.(currState, prevState)
      );
      HistoryState.instance.query = currState;
    };
    window.history.scrollRestoration = "manual";
    window.addEventListener("popstate", onPopstate);
    return (): void => {
      window.removeEventListener("popstate", onPopstate);
    };
  }, []);

  const router = useRouter();

  useEffect(() => {
    const onRouteChangeComplete = (): void => {
      HistoryState.instance.prev = router.asPath;
    };
    router.events.on("routeChangeComplete", onRouteChangeComplete);
    return (): void => {
      router.events.off("routeChangeComplete", onRouteChangeComplete);
    };
  }, [router]);

  return (
    <>
      <style global jsx>{`
        html,
        body,
        body > div:first-child,
        div#__next,
        div#__next > div {
          height: 100%;
        }
        .font-icon svg {
          fill: currentColor;
          width: 1em;
          height: 1em;
        }
        .MuiAutocomplete-popper {
          z-index: 3000;
        }
      `}</style>
      <CacheProvider value={emotionCache}>
        <ConfigContext.Provider value={configContext}>
          <IconLibraryContext.Provider value={iconLibraryContext}>
            <ThemeProvider theme={defaultTheme}>
              <ToastContextProvider>
                <UserContextProvider>
                  <ServiceWorkerContextProvider>
                    <RouterContextProvider>
                      <DeviceContextProvider>
                        <ScreenContextProvider>
                          <NavigationContextProvider>
                            <DialogContextProvider>
                              <CssBaseline />
                              <AppArea>
                                <Component {...pageProps} />
                              </AppArea>
                            </DialogContextProvider>
                          </NavigationContextProvider>
                        </ScreenContextProvider>
                      </DeviceContextProvider>
                    </RouterContextProvider>
                  </ServiceWorkerContextProvider>
                </UserContextProvider>
              </ToastContextProvider>
            </ThemeProvider>
          </IconLibraryContext.Provider>
        </ConfigContext.Provider>
      </CacheProvider>
    </>
  );
});

export default MyApp;
