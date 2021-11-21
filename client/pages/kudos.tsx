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
import { BetaBanner } from "../modules/impower-route";
import Kudos from "../modules/impower-route-account/components/Kudos";
import useBodyBackgroundColor from "../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../modules/impower-route/hooks/useHTMLBackgroundColor";

const StyledKudosPage = styled.div`
  padding-top: ${(props): string => props.theme.minHeight.navigationBar};
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: ${(props): string => props.theme.colors.lightForeground};

  ${(props): string => props.theme.breakpoints.down("sm")} {
    background-color: white;
  }
`;

interface KudosPageProps {
  config: ConfigParameters;
}

const KudosPage = React.memo((props: KudosPageProps) => {
  const { config } = props;

  const [, navigationDispatch] = useContext(NavigationContext);

  ConfigCache.instance.set(config);

  useBodyBackgroundColor("white");
  useHTMLBackgroundColor("white");

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useMemo(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Kudos"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  return (
    <>
      <StyledKudosPage>
        <BetaBanner />
        <Kudos />
      </StyledKudosPage>
    </>
  );
});

export default KudosPage;

export const getStaticProps: GetStaticProps<KudosPageProps> = async () => {
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
