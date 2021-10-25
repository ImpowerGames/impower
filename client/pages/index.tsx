import { useTheme } from "@emotion/react";
import useMediaQuery from "@material-ui/core/useMediaQuery";
import Head from "next/head";
import React, { useContext, useEffect } from "react";
import DataStoreCache from "../modules/impower-data-store/classes/dataStoreCache";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetLinks,
  navigationSetSearchbar,
  navigationSetText,
  navigationSetType,
} from "../modules/impower-navigation";
import { brandingInfo, useScrolledDown } from "../modules/impower-route";
import Home from "../modules/impower-route-home/components/Home";
import ShareWebsiteHead from "../modules/impower-route/components/elements/ShareWebsiteHead";
import useBodyBackgroundColor from "../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../modules/impower-route/hooks/useHTMLBackgroundColor";

const HomePage = React.memo(() => {
  const { product } = brandingInfo;
  const [, navigationDispatch] = useContext(NavigationContext);

  const theme = useTheme();

  useBodyBackgroundColor(theme.colors.lightForeground);
  useHTMLBackgroundColor(theme.colors.lightForeground);

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, undefined));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation(0));
    navigationDispatch(navigationSetBackgroundColor("transparent"));
  }, [navigationDispatch]);

  const belowXsBreakpoint = useMediaQuery(theme.breakpoints.down("sm"));
  const belowScrollThreshold = useScrolledDown(belowXsBreakpoint ? 50 : 250);

  useEffect(() => {
    if (belowScrollThreshold) {
      navigationDispatch(navigationSetElevation());
      navigationDispatch(navigationSetBackgroundColor());
    } else {
      navigationDispatch(navigationSetElevation(0));
      navigationDispatch(navigationSetBackgroundColor("transparent"));
    }
  }, [belowScrollThreshold, navigationDispatch]);

  return (
    <>
      <Head>
        <title>{product}</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=5, viewport-fit=cover"
        />
      </Head>
      <ShareWebsiteHead />
      <Home />
    </>
  );
});

export default HomePage;
