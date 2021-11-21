import styled from "@emotion/styled";
import { GetStaticProps } from "next";
import React, { useContext, useEffect, useMemo } from "react";
import getTagConfigParameters from "../lib/getTagConfigParameters";
import { ConfigParameters } from "../modules/impower-config";
import ConfigCache from "../modules/impower-config/classes/configCache";
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
import navigationSetTransitioning from "../modules/impower-navigation/utils/navigationSetTransitioning";
import { BetaBanner } from "../modules/impower-route";
import Account from "../modules/impower-route-account/components/Account";
import Footer from "../modules/impower-route-home/components/elements/Footer";
import useBodyBackgroundColor from "../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../modules/impower-route/hooks/useHTMLBackgroundColor";
import { useRouter } from "../modules/impower-router";

const StyledAccountPage = styled.div`
  padding-top: ${(props): string => props.theme.minHeight.navigationBar};
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: ${(props): string => props.theme.colors.lightForeground};

  ${(props): string => props.theme.breakpoints.down("sm")} {
    background-color: white;
  }
`;

interface AccountPageProps {
  config: ConfigParameters;
}

const AccountPage = React.memo((props: AccountPageProps) => {
  const { config } = props;

  const [navigationState, navigationDispatch] = useContext(NavigationContext);
  const transitioning = navigationState?.transitioning;

  const router = useRouter();
  const routerIsReady = router.isReady;

  ConfigCache.instance.set(config);

  useBodyBackgroundColor("white");
  useHTMLBackgroundColor("white");

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useMemo(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Account"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  useEffect(() => {
    if (routerIsReady) {
      navigationDispatch(navigationSetTransitioning(false));
    }
  }, [navigationDispatch, routerIsReady]);

  return (
    <>
      <StyledAccountPage>
        <BetaBanner />
        <Account />
        {!transitioning && <Footer />}
      </StyledAccountPage>
    </>
  );
});

export default AccountPage;

export const getStaticProps: GetStaticProps<AccountPageProps> = async () => {
  const getLocalizationConfigParameters = (
    await import("../lib/getLocalizationConfigParameters")
  ).default;
  const config = {
    ...getLocalizationConfigParameters(),
    ...getTagConfigParameters(),
  };
  return {
    props: { config },
  };
};
