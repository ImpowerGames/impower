import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { GetStaticPaths, GetStaticProps } from "next";
import dynamic from "next/dynamic";
import React, { useContext, useEffect, useMemo } from "react";
import getLocalizationConfigParameters from "../../../lib/getLocalizationConfigParameters";
import getTagConfigParameters from "../../../lib/getTagConfigParameters";
import { ConfigParameters } from "../../../modules/impower-config";
import ConfigCache from "../../../modules/impower-config/classes/configCache";
import DataStoreCache from "../../../modules/impower-data-store/classes/dataStoreCache";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetSearchbar,
  navigationSetType,
} from "../../../modules/impower-navigation";
import useBodyBackgroundColor from "../../../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../modules/impower-route/hooks/useHTMLBackgroundColor";

const StyledProjectPage = styled.div`
  background-color: ${(props): string => props.theme.colors.darkForeground};
  display: flex;
  flex-direction: column;
  flex: 1;
  position: relative;
`;

const GameContextProvider = dynamic(
  () =>
    import(
      "../../../modules/impower-route-engine/components/GameContextProvider"
    ),
  { ssr: false }
);

const Project = dynamic(
  () => import("../../../modules/impower-route-engine/components/Project"),
  { ssr: false }
);

interface GamePageProps {
  config: ConfigParameters;
}

const GamePage = React.memo((props: GamePageProps) => {
  const { config } = props;

  const [, navigationDispatch] = useContext(NavigationContext);

  const theme = useTheme();

  ConfigCache.instance.set(config);

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useMemo(() => {
    navigationDispatch(navigationSetType("none"));
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  if (!process.env.NEXT_PUBLIC_ORIGIN?.includes("localhost")) {
    return null;
  }

  return (
    <GameContextProvider>
      <StyledProjectPage>
        <Project />
      </StyledProjectPage>
    </GameContextProvider>
  );
});

export default GamePage;

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: "blocking" };
};

export const getStaticProps: GetStaticProps<GamePageProps> = async () => {
  const config = {
    ...getLocalizationConfigParameters(),
    ...getTagConfigParameters(),
  };
  return {
    props: { config },
  };
};
