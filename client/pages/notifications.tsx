import styled from "@emotion/styled";
import React, { useContext, useEffect, useMemo } from "react";
import DataStoreCache from "../modules/impower-data-store/classes/dataStoreCache";
import {
  navigationSetType,
  navigationSetText,
  navigationSetLinks,
  navigationSetSearchbar,
  navigationSetElevation,
  navigationSetBackgroundColor,
  NavigationContext,
} from "../modules/impower-navigation";
import { BetaBanner } from "../modules/impower-route";
import Notifications from "../modules/impower-route-account/components/Notifications";
import useBodyBackgroundColor from "../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../modules/impower-route/hooks/useHTMLBackgroundColor";

const StyledNotificationsPage = styled.div`
  padding-top: ${(props): string => props.theme.minHeight.navigationBar};
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: ${(props): string => props.theme.colors.lightForeground};

  ${(props): string => props.theme.breakpoints.down("sm")} {
    background-color: white;
  }
`;

const NotificationsPage = React.memo(() => {
  // grabs the navigation dispatch functions from  global context so we can change the navigatiton bar in our page
  const [, navigationDispatch] = useContext(NavigationContext);

  // Not impoprtant for Desktop, one of these affects the address bar color on mobile
  // Not impoprtant for Desktop, one of these affects the keyboard background color on mobile (iOS is weird and doesn't need this)
  useBodyBackgroundColor("white");
  useHTMLBackgroundColor("white");

  //Anything that says use is a hook
  //Effects runs on Client only (we dont need to cache user data on the server becasue no other user will ever use it)
  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  //Memo runs on both server and the client, want to render & cache as many components on the page ahead of time as possible
  useMemo(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Notifications"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  //below are componenents, the weird bastard child of HTML and Javascript (which is in turn the weird bastard of real code and satan)
  return (
    <StyledNotificationsPage>
      <BetaBanner />
      <Notifications />
    </StyledNotificationsPage>
  );
});

export default NotificationsPage;
