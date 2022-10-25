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
import Footer from "../modules/impower-route-home/components/elements/Footer";
import Report from "../modules/impower-route-report/components/Report";
import NavigationBarSpacer from "../modules/impower-route/components/elements/NavigationBarSpacer";
import useBodyBackgroundColor from "../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../modules/impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../modules/impower-route/hooks/useHTMLOverscrollBehavior";

const ReportPage = React.memo(() => {
  const [, navigationDispatch] = useContext(NavigationContext);

  useBodyBackgroundColor("white");
  useHTMLBackgroundColor("white");
  useHTMLOverscrollBehavior("auto");

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Report"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  return (
    <>
      <NavigationBarSpacer />
      <Report />
      <Footer />
    </>
  );
});

export default ReportPage;
