import React, { useContext, useEffect, useMemo } from "react";
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
import Footer from "../modules/impower-route-home/components/elements/Footer";
import NavigationBarSpacer from "../modules/impower-route/components/elements/NavigationBarSpacer";
import useBodyBackgroundColor from "../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../modules/impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../modules/impower-route/hooks/useHTMLOverscrollBehavior";

const ContactPage = React.memo(() => {
  const [, navigationDispatch] = useContext(NavigationContext);

  useBodyBackgroundColor("white");
  useHTMLBackgroundColor("white");
  useHTMLOverscrollBehavior("auto");

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useMemo(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Contact"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  return (
    <>
      <NavigationBarSpacer />
      <Contact
        title={`Contact Us.`}
        subtitle={`Have questions? Want to hear more?`}
        submitButton={`Send`}
        messageSuccess={`Message sent!`}
      />
      <Footer />
    </>
  );
});

export default ContactPage;
