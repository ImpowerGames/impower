import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { GetStaticPaths, GetStaticProps } from "next";
import React, { useContext, useEffect, useMemo } from "react";
import getIconSvgData from "../../../lib/getIconSvgData";
import getLocalizationConfigParameters from "../../../lib/getLocalizationConfigParameters";
import getTagConfigParameters from "../../../lib/getTagConfigParameters";
import { initAdminApp } from "../../../lib/initAdminApp";
import { ConfigParameters } from "../../../modules/impower-config";
import ConfigCache from "../../../modules/impower-config/classes/configCache";
import {
  getAnySearchQuery,
  getSerializableDocument,
  ProjectDocument,
} from "../../../modules/impower-data-store";
import DataStoreCache from "../../../modules/impower-data-store/classes/dataStoreCache";
import {
  IconLibraryContext,
  iconLibraryRegister,
  SvgData,
} from "../../../modules/impower-icon";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetLinks,
  navigationSetSearchbar,
  navigationSetText,
  navigationSetType,
} from "../../../modules/impower-navigation";
import navigationSetTransitioning from "../../../modules/impower-navigation/utils/navigationSetTransitioning";
import { Fallback, PageHead } from "../../../modules/impower-route";
import PitchSearch from "../../../modules/impower-route-pitch/components/PitchSearch";
import PitchSearchToolbar from "../../../modules/impower-route-pitch/components/PitchSearchToolbar";
import useBodyBackgroundColor from "../../../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../modules/impower-route/hooks/useHTMLBackgroundColor";
import { useRouter } from "../../../modules/impower-router";

const LOAD_INITIAL_LIMIT = 5;

const StyledLoadingBackground = styled.div`
  background-color: ${(props): string => props.theme.palette.primary.main};
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledToolbarSpacer = styled.div`
  min-height: calc(${(props): string => props.theme.minHeight.navigationBar});
`;

const StyledLoadingForeground = styled.div`
  position: relative;
  background-color: ${(props): string => props.theme.colors.lightForeground};
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

interface PitchSearchPageProps {
  config: ConfigParameters;
  search: string;
  pitchDocs: { [id: string]: ProjectDocument };
  icons: { [name: string]: SvgData };
}

const PitchSearchPageContent = React.memo((props: PitchSearchPageProps) => {
  const { search, pitchDocs, config, icons } = props;

  const [, navigationDispatch] = useContext(NavigationContext);
  const [, iconLibraryDispatch] = useContext(IconLibraryContext);

  const theme = useTheme();

  const router = useRouter();
  const routerIsReady = router.isReady;

  const searchValue =
    typeof window !== "undefined"
      ? decodeURI(window.location.pathname.split("/").pop())
      : "";

  ConfigCache.instance.set(config);
  iconLibraryDispatch(iconLibraryRegister("solid", icons));

  useBodyBackgroundColor(theme.colors.lightForeground);
  useHTMLBackgroundColor(theme.colors.lightForeground);

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useMemo(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Search"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(
      navigationSetSearchbar({
        label: "Search Pitches",
        placeholder: "Try searching for mechanics, genres, or subjects",
        value: searchValue,
        searching: false,
      })
    );
    navigationDispatch(navigationSetElevation(0));
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch, searchValue]);

  useEffect(() => {
    if (routerIsReady) {
      navigationDispatch(navigationSetTransitioning(false));
    }
  }, [navigationDispatch, routerIsReady]);

  if (pitchDocs === undefined) {
    return (
      <StyledLoadingBackground>
        <StyledToolbarSpacer />
        <PitchSearchToolbar search={searchValue} />
        <StyledLoadingForeground>
          <Fallback />
        </StyledLoadingForeground>
      </StyledLoadingBackground>
    );
  }

  return (
    <PitchSearch
      key={search}
      config={config}
      icons={icons}
      pitchDocs={pitchDocs}
      search={search}
    />
  );
});

const PitchSearchPage = React.memo((props: PitchSearchPageProps) => {
  return (
    <>
      <PageHead title={`Search Impower Pitches`} />
      <PitchSearchPageContent {...props} />
    </>
  );
});

export default PitchSearchPage;

export const getStaticPaths: GetStaticPaths = async () => {
  const configProjectTags = (
    await import("../../../resources/json/en/projectTags.json")
  ).default;
  const gameTags = Object.values(configProjectTags)
    .flatMap((categories) => categories.flatMap((groups) => groups))
    .map((tag) => tag.toLowerCase());
  return {
    paths: [...gameTags].map((tag) => `/pitch/search/${tag}`),
    fallback: true,
  };
};

export const getStaticProps: GetStaticProps<PitchSearchPageProps> = async (
  context
) => {
  const { search } = context.params;
  const searchValue = Array.isArray(search) ? search[0] : search;
  const config = {
    ...getLocalizationConfigParameters(),
    ...getTagConfigParameters(),
  };
  const adminApp = await initAdminApp();
  const termsQuery = getAnySearchQuery({
    search: searchValue,
    searchTargets: ["tags"],
  });
  const pitchesSnapshot = await adminApp
    .firestore()
    .collection("pitched_projects")
    .where("nsfw", "==", false)
    .where("delisted", "==", false)
    .where("terms", "array-contains-any", termsQuery)
    .orderBy("rank", "desc")
    .limit(LOAD_INITIAL_LIMIT)
    .get();
  const pitchDocs: { [id: string]: ProjectDocument } = {};
  const iconNamesSet = new Set<string>();
  pitchesSnapshot.docs.forEach((s) => {
    const serializableData = getSerializableDocument<ProjectDocument>(s.data());
    pitchDocs[s.id] = serializableData;
    const mainTag = serializableData?.tags?.[0] || "";
    const tagIconName = config?.tagIconNames?.[mainTag] || "hashtag";
    iconNamesSet.add(tagIconName);
  });
  const iconNames = Array.from(iconNamesSet);
  const iconData = await Promise.all(
    iconNames.map(async (name) => {
      const component = (
        await import(`../../../resources/icons/solid/${name}.svg`)
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
      search: searchValue,
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
