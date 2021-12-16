import { useTheme } from "@emotion/react";
import { GetStaticPaths, GetStaticProps } from "next";
import React, { useContext, useEffect, useMemo } from "react";
import getIconSvgData from "../../lib/getIconSvgData";
import getLocalizationConfigParameters from "../../lib/getLocalizationConfigParameters";
import getTagConfigParameters from "../../lib/getTagConfigParameters";
import { initAdminApp } from "../../lib/initAdminApp";
import { ConfigParameters } from "../../modules/impower-config";
import ConfigCache from "../../modules/impower-config/classes/configCache";
import {
  getSerializableDocument,
  ProjectDocument,
  ProjectType,
} from "../../modules/impower-data-store";
import DataStoreCache from "../../modules/impower-data-store/classes/dataStoreCache";
import {
  IconLibraryContext,
  iconLibraryRegister,
  SvgData,
} from "../../modules/impower-icon";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetLinks,
  navigationSetSearchbar,
  navigationSetText,
  navigationSetType,
} from "../../modules/impower-navigation";
import navigationSetTransitioning from "../../modules/impower-navigation/utils/navigationSetTransitioning";
import { PageHead } from "../../modules/impower-route";
import Pitch from "../../modules/impower-route-pitch/components/Pitch";
import { ProjectTypeFilter } from "../../modules/impower-route-pitch/types/projectTypeFilter";
import useBodyBackgroundColor from "../../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../modules/impower-route/hooks/useHTMLBackgroundColor";
import { useRouter } from "../../modules/impower-router";

const LOAD_INITIAL_LIMIT = 5;

interface PitchPageProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  type?: ProjectTypeFilter;
  pitchDocs: { [id: string]: ProjectDocument };
}

const PitchPageContent = React.memo((props: PitchPageProps) => {
  const { config, icons, type, pitchDocs } = props;

  const [, navigationDispatch] = useContext(NavigationContext);
  const [, iconLibraryDispatch] = useContext(IconLibraryContext);

  ConfigCache.instance.set(config);
  iconLibraryDispatch(iconLibraryRegister("solid", icons));

  const theme = useTheme();

  const router = useRouter();
  const routerIsReady = router.isReady;

  useBodyBackgroundColor(theme.colors.lightForeground);
  useHTMLBackgroundColor(theme.colors.lightForeground);

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useMemo(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Pitch"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(
      navigationSetSearchbar({
        label: "Search Pitches",
        placeholder: "Try searching for mechanics, genres, or subjects",
        value: "",
        searching: false,
      })
    );
    navigationDispatch(navigationSetElevation(0));
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  useEffect(() => {
    if (routerIsReady) {
      navigationDispatch(navigationSetTransitioning(false));
    }
  }, [navigationDispatch, routerIsReady]);

  return (
    <Pitch config={config} icons={icons} type={type} pitchDocs={pitchDocs} />
  );
});

const PitchPage = React.memo((props: PitchPageProps) => {
  return (
    <>
      <PageHead title={`Impower Pitches`} />
      <PitchPageContent {...props} />
    </>
  );
});

export default PitchPage;

export const getStaticPaths: GetStaticPaths = async () => {
  const projectTypes = [
    "game",
    "story",
    "character",
    "environment",
    "music",
    "sound",
    "voice",
  ];
  return {
    paths: projectTypes.map((type) => `/pitch/${type}`),
    fallback: true,
  };
};

export const getStaticProps: GetStaticProps<PitchPageProps> = async (
  context
) => {
  const { type } = context.params;
  const typeValue = (Array.isArray(type) ? type[0] : type)?.toLowerCase() as
    | ProjectType
    | "all";
  const config = {
    ...getLocalizationConfigParameters(),
    ...getTagConfigParameters(),
  };
  const adminApp = await initAdminApp();
  let pitchesQuery = adminApp
    .firestore()
    .collection("pitched_projects")
    .where("delisted", "==", false);
  if (typeValue && typeValue !== "all") {
    pitchesQuery = pitchesQuery.where("projectType", "==", typeValue);
  }
  const pitchesSnapshot = await pitchesQuery
    .orderBy("rank", "desc")
    .limit(LOAD_INITIAL_LIMIT)
    .get();
  const pitchDocs: { [id: string]: ProjectDocument } = {};
  const iconNamesSet = new Set<string>();
  pitchesSnapshot.docs.forEach((s) => {
    const serializableData = getSerializableDocument<ProjectDocument>(s.data());
    pitchDocs[s.id] = serializableData;
    const mainTag = serializableData?.tags?.[0] || "";
    const validMainTag = config?.tagDisambiguations?.[mainTag]?.[0] || mainTag;
    const tagIconName = config?.tagIconNames?.[validMainTag] || "hashtag";
    iconNamesSet.add(tagIconName);
  });
  const iconNames = Array.from(iconNamesSet);
  const iconData = await Promise.all(
    iconNames.map(async (name) => {
      const component = (
        await import(`../../resources/icons/solid/${name}.svg`)
      ).default;
      if (component) {
        return getIconSvgData(component);
      }
      return null;
    })
  );
  const icons = {};
  iconData.forEach((data, index) => {
    if (data) {
      icons[iconNames[index]] = data;
    }
  });
  return {
    props: {
      type: typeValue,
      pitchDocs,
      config,
      icons,
    },
    // Regenerate the page:
    // - When a request comes in
    // - At most once every 60 seconds
    revalidate: 60,
  };
};
