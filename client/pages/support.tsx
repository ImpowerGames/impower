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
import Contact from "../modules/impower-route-contact/components/Contact";
import useBodyBackgroundColor from "../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../modules/impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../modules/impower-route/hooks/useHTMLOverscrollBehavior";

const SupportPage = React.memo(() => {
  const [, navigationDispatch] = useContext(NavigationContext);

  useBodyBackgroundColor("white");
  useHTMLBackgroundColor("white");
  useHTMLOverscrollBehavior("auto");

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Support"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  return (
    <Contact
      title={`Need Help?`}
      subtitle={`Send us a message.`}
      submitButton={`Send`}
      messageSuccess={`Message sent!`}
    />
  );
});

export default SupportPage;
