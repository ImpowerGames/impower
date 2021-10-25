import styled from "@emotion/styled";
import { GetStaticProps } from "next";
import React, { useContext, useEffect, useMemo } from "react";
import getLocalizationConfigParameters from "../../../lib/getLocalizationConfigParameters";
import { ConfigParameters } from "../../../modules/impower-config";
import ConfigCache from "../../../modules/impower-config/classes/configCache";
import DataStoreCache from "../../../modules/impower-data-store/classes/dataStoreCache";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetLinks,
  navigationSetSearchbar,
  navigationSetText,
  navigationSetType,
} from "../../../modules/impower-navigation";
import Footer from "../../../modules/impower-route-home/components/elements/Footer";
import Markdown from "../../../modules/impower-route/components/elements/Markdown";
import NavigationBarSpacer from "../../../modules/impower-route/components/elements/NavigationBarSpacer";
import useBodyBackgroundColor from "../../../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../modules/impower-route/hooks/useHTMLBackgroundColor";
import content from "../../../resources/docs/privacy.md";

const StyledPrivacyPage = styled.div`
  padding: ${(props): string => props.theme.spacing(4, 2)};
  max-width: 100%;
  margin: auto;
`;

interface PrivacyPageProps {
  content: string;
  config: ConfigParameters;
}

const PrivacyPage = React.memo((props: PrivacyPageProps) => {
  const { content, config } = props;

  const [, navigationDispatch] = useContext(NavigationContext);

  ConfigCache.instance.set(config);

  useBodyBackgroundColor("white");
  useHTMLBackgroundColor("white");

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Privacy"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  const markdownStyle = useMemo(() => ({ maxWidth: 960 }), []);

  return (
    <>
      <NavigationBarSpacer />
      <StyledPrivacyPage>
        <Markdown style={markdownStyle}>{content}</Markdown>
      </StyledPrivacyPage>
      <Footer />
    </>
  );
});

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {
      content,
      config: getLocalizationConfigParameters(),
    },
  };
};

export default PrivacyPage;
