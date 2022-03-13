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
import TagIconLoader from "../../../modules/impower-route/components/elements/TagIconLoader";
import useBodyBackgroundColor from "../../../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../modules/impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../../../modules/impower-route/hooks/useHTMLOverscrollBehavior";
import useIOS from "../../../modules/impower-route/hooks/useIOS";

const StyledProjectPage = styled.div<{ ios?: boolean }>`
  background-color: ${(props): string => props.theme.colors.darkForeground};
  display: flex;
  flex-direction: column;
  flex: 1;
  position: relative;
  & * {
    touch-action: ${(props): string => (props.ios ? "none" : "pan-x pan-y")};
    overscroll-behavior: contain;
  }

  & * {
    user-select: none;
    touch-callout: none;
  }
  *[contenteditable="true"] {
    user-select: text;
  }
  input {
    user-select: text;
  }
  textarea {
    user-select: text;
  }
`;

const StyledMonospaceSansFontLoader = styled.p`
  font-family: ${(props): string => props.theme.fontFamily.monospaceSans};
  top: -1000vh;
  left: -1000vw;
  position: absolute;
  pointer-events: none;
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

interface EngineProjectPageProps {
  config: ConfigParameters;
}

const EngineProjectPage = React.memo((props: EngineProjectPageProps) => {
  const { config } = props;

  const [, navigationDispatch] = useContext(NavigationContext);

  const theme = useTheme();

  ConfigCache.instance.set(config);

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);
  useHTMLOverscrollBehavior("contain");

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useMemo(() => {
    navigationDispatch(navigationSetType("none"));
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  const ios = useIOS();

  if (process.env.NEXT_PUBLIC_ENVIRONMENT === "production") {
    return null;
  }

  return (
    <>
      <GameContextProvider>
        <StyledProjectPage ios={ios}>
          <Project />
        </StyledProjectPage>
      </GameContextProvider>
      <TagIconLoader />
      <StyledMonospaceSansFontLoader>
        .<b>.</b>
        <i>.</i>
        <b>
          <i>.</i>
        </b>
      </StyledMonospaceSansFontLoader>
    </>
  );
});

export default EngineProjectPage;

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: "blocking" };
};

export const getStaticProps: GetStaticProps<EngineProjectPageProps> =
  async () => {
    const config = {
      ...getLocalizationConfigParameters(),
      ...getTagConfigParameters(),
    };
    return {
      props: { config },
    };
  };
