import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { GetStaticPaths, GetStaticProps } from "next";
import dynamic from "next/dynamic";
import React, { useContext, useEffect } from "react";
import getLocalizationConfigParameters from "../../../lib/getLocalizationConfigParameters";
import getTagConfigParameters from "../../../lib/getTagConfigParameters";
import { ConfigParameters } from "../../../modules/impower-config";
import ConfigCache from "../../../modules/impower-config/classes/configCache";
import DataStoreCache from "../../../modules/impower-data-store/classes/dataStoreCache";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetType,
} from "../../../modules/impower-navigation";
import useBodyBackgroundColor from "../../../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../modules/impower-route/hooks/useHTMLBackgroundColor";

const StyledProjectPage = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: ${(props): string => props.theme.colors.darkForeground};
  display: flex;
  position: relative;
`;

const ResourceContextProvider = dynamic(
  () =>
    import(
      "../../../modules/impower-route-engine/components/ResourceContextProvider"
    )
);

const Project = dynamic(
  () => import("../../../modules/impower-route-engine/components/Project"),
  { ssr: false }
);

interface ResourcePageProps {
  config: ConfigParameters;
}

const ResourcePage = React.memo((props: ResourcePageProps) => {
  const { config } = props;

  const [, navigationDispatch] = useContext(NavigationContext);

  const theme = useTheme();

  ConfigCache.instance.set(config);

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    navigationDispatch(navigationSetType("none"));
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  if (process.env.NEXT_PUBLIC_ENVIRONMENT !== "development") {
    return null;
  }

  return (
    <ResourceContextProvider>
      <StyledProjectPage>
        <Project />
      </StyledProjectPage>
    </ResourceContextProvider>
  );
});

export default ResourcePage;

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: "blocking" };
};

export const getStaticProps: GetStaticProps<ResourcePageProps> = async () => {
  const config = {
    ...getLocalizationConfigParameters(),
    ...getTagConfigParameters(),
  };
  return {
    props: { config },
  };
};
