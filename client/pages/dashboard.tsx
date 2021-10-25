import { useTheme } from "@emotion/react";
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
import { Fallback, PageUnderConstruction } from "../modules/impower-route";
import useBodyBackgroundColor from "../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../modules/impower-route/hooks/useHTMLBackgroundColor";
import { useRouter } from "../modules/impower-router";
import { UserContext } from "../modules/impower-user";

const DashboardPage = React.memo(() => {
  const [, navigationDispatch] = useContext(NavigationContext);
  const [userState] = useContext(UserContext);
  const { isAnonymous, uid, my_studio_memberships } = userState;
  const router = useRouter();
  const theme = useTheme();

  const underConstruction =
    !process.env.NEXT_PUBLIC_ORIGIN.includes("localhost");

  useBodyBackgroundColor(theme.palette.primary.main);
  useHTMLBackgroundColor(theme.palette.primary.main);

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    if (underConstruction) {
      navigationDispatch(navigationSetType("page"));
      navigationDispatch(navigationSetText(undefined, "Dashboard"));
      navigationDispatch(navigationSetLinks());
      navigationDispatch(navigationSetSearchbar());
      navigationDispatch(navigationSetElevation());
      navigationDispatch(navigationSetBackgroundColor());
    } else {
      navigationDispatch(navigationSetType("studio"));
      navigationDispatch(navigationSetElevation());
      navigationDispatch(navigationSetBackgroundColor());
    }
  }, [navigationDispatch, underConstruction]);

  const recentlyAccessedStudioIds = useMemo(
    () =>
      my_studio_memberships === undefined
        ? undefined
        : my_studio_memberships === null
        ? null
        : Object.keys(my_studio_memberships),
    [my_studio_memberships]
  );
  const latestAccessedStudioId = recentlyAccessedStudioIds?.[0] || "";
  const firstStudioId = my_studio_memberships
    ? Object.keys(my_studio_memberships)[0]
    : undefined;
  const loaded = recentlyAccessedStudioIds !== undefined;

  useEffect(() => {
    if (!underConstruction) {
      if (uid !== undefined) {
        if (uid) {
          if (isAnonymous) {
            router.push(`/e/g`);
          } else if (latestAccessedStudioId) {
            router.push(`/e/s/${latestAccessedStudioId}`);
          } else if (firstStudioId) {
            router.push(`/e/s/${firstStudioId}`);
          } else if (loaded) {
            router.push(`/e/s`);
          }
        } else {
          router.push(`/e/g`);
        }
      }
    }
  }, [
    firstStudioId,
    isAnonymous,
    latestAccessedStudioId,
    router,
    underConstruction,
    uid,
    loaded,
  ]);

  if (!process.env.NEXT_PUBLIC_ORIGIN?.includes("localhost")) {
    return null;
  }

  if (underConstruction) {
    return (
      <PageUnderConstruction
        description={`**This is where you'll find our collaborative browser-based, drag-and-drop Game Engine!**

The engine can be used to build 2D games with others simultaneously on any device. It has a simple, easy-to-use interface designed for non-technical people who want to get started making games, no coding required!

The engine is currently only accessible to official alpha testers. If you'd like to become an alpha tester, you can [request an invite here](/invite).`}
      />
    );
  }

  return <Fallback color="primary" />;
});

export default DashboardPage;
