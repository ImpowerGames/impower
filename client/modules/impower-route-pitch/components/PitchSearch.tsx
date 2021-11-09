import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import React, { useCallback, useContext, useEffect, useMemo } from "react";
import { ConfigParameters } from "../../impower-config";
import { getSearchedTerms, ProjectDocument } from "../../impower-data-store";
import { SvgData } from "../../impower-icon";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import { BetaBanner } from "../../impower-route";
import { useRouter } from "../../impower-router";
import { UserContext, userDoFollow, userUndoFollow } from "../../impower-user";
import AddPitchToolbar from "./AddPitchToolbar";
import PitchList from "./PitchList";
import PitchSearchToolbar from "./PitchSearchToolbar";

const SORT_OPTIONS: ["rank", "rating", "new"] = ["rank", "rating", "new"];

const EmptyPitchList = dynamic(() => import("./EmptyPitchList"), {
  ssr: false,
});

const AnimatedDefaultMascot = dynamic(
  () =>
    import(
      "../../impower-route/components/illustrations/AnimatedDefaultMascot"
    ),
  { ssr: false }
);

const AnimatedWarningMascotIllustration = dynamic(
  () =>
    import(
      "../../impower-route/components/illustrations/AnimatedWarningMascotIllustration"
    ),
  { ssr: false }
);

const StyledPitchSearch = styled.div`
  height: 100vh;
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
  backface-visibility: hidden;
`;

const StyledApp = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
  padding-top: calc(
    ${(props): string => props.theme.minHeight.navigationBar} +
      ${(props): string => props.theme.minHeight.navigationTabs}
  );
`;

const StyledListArea = styled.div`
  flex: 1;
  min-width: 0;
  background-color: ${(props): string => props.theme.colors.lightForeground};
  align-items: center;
  display: flex;
  flex-direction: column;
`;

interface PitchSearchPageProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  pitchDocs?: { [id: string]: ProjectDocument };
  search: string;
  style?: React.CSSProperties;
}

const PitchSearch = React.memo((props: PitchSearchPageProps): JSX.Element => {
  const { config, icons, search, pitchDocs, style } = props;

  const [navigationState, navigationDispatch] = useContext(NavigationContext);
  const searching = navigationState?.search?.searching;
  const transitioning = navigationState?.transitioning;
  const [userState, userDispatch] = useContext(UserContext);
  const { my_follows } = userState;
  const followedTags = useMemo(
    () =>
      my_follows
        ? Object.entries(my_follows)
            .filter(([, v]) => v.g === "tags")
            .map(([target]) => target.split("%").slice(-1).join(""))
        : (my_follows as null | undefined),
    [my_follows]
  );

  const router = useRouter();
  const { search: querySearch } = router.query;

  const activeSearch = typeof querySearch === "string" ? querySearch : search;

  const searchedTerms = useMemo(
    () => getSearchedTerms(activeSearch),
    [activeSearch]
  );
  const isFollowingAllTags = useMemo(
    () =>
      searchedTerms !== undefined && followedTags !== undefined
        ? searchedTerms?.every((t) => followedTags?.includes(t))
        : undefined,
    [followedTags, searchedTerms]
  );

  useEffect(() => {
    navigationDispatch(navigationSetTransitioning(false));
  }, [navigationDispatch]);

  const handleChangeFollowing = useCallback(
    async (e: React.MouseEvent, followed: boolean): Promise<void> => {
      let newFollowingTags = followedTags ? [...followedTags] : [];
      searchedTerms.forEach((tag) => {
        if (followed) {
          if (!newFollowingTags.includes(tag)) {
            newFollowingTags = [...newFollowingTags, tag];
            userDispatch(userDoFollow("tags", tag));
          }
        } else if (newFollowingTags.includes(tag)) {
          newFollowingTags = newFollowingTags.filter((t) => t !== tag);
          userDispatch(userUndoFollow("tags", tag));
        }
      });
    },
    [followedTags, searchedTerms, userDispatch]
  );

  const emptyImage = useMemo(() => <AnimatedDefaultMascot />, []);
  const emptySubtitle1 = `Got an idea?`;
  const emptySubtitle2 = `Why not pitch it?`;

  const filterLabel = `pitches`;
  const searchLabel = useMemo(
    () =>
      activeSearch
        ? getSearchedTerms(activeSearch)
            .map((t) => `#${t}`)
            .join(" ")
        : undefined,
    [activeSearch]
  );
  const emptyLabelStyle: React.CSSProperties = useMemo(
    () => ({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
    }),
    []
  );
  const searchLabelStyle: React.CSSProperties = useMemo(
    () => ({ fontWeight: 700 }),
    []
  );

  const loadingPlaceholder = useMemo(
    () => (
      <EmptyPitchList
        loading
        loadingMessage={`Loading...`}
        emptySubtitle1={emptySubtitle1}
        emptySubtitle2={emptySubtitle2}
      />
    ),
    [emptySubtitle1, emptySubtitle2]
  );

  return (
    <StyledPitchSearch style={style}>
      <StyledApp>
        <PitchSearchToolbar
          search={searching || transitioning ? undefined : activeSearch}
          following={
            searching || transitioning ? undefined : isFollowingAllTags
          }
          onFollow={
            searching || transitioning ? undefined : handleChangeFollowing
          }
        />
        <BetaBanner />
        <StyledListArea>
          {transitioning ? (
            loadingPlaceholder
          ) : (
            <>
              <PitchList
                config={config}
                icons={icons}
                pitchDocs={pitchDocs}
                search={activeSearch}
                sortOptions={SORT_OPTIONS}
                loadingPlaceholder={loadingPlaceholder}
                emptyPlaceholder={
                  <EmptyPitchList
                    loading={pitchDocs === undefined}
                    loadedImage={emptyImage}
                    filterLabel={filterLabel}
                    searchLabel={searchLabel}
                    emptySubtitle1={emptySubtitle1}
                    emptySubtitle2={emptySubtitle2}
                    emptyLabelStyle={emptyLabelStyle}
                    searchLabelStyle={searchLabelStyle}
                  />
                }
                offlinePlaceholder={
                  <AnimatedWarningMascotIllustration
                    message={`Looks like you're offline`}
                  />
                }
              />
              <AddPitchToolbar config={config} icons={icons} />
            </>
          )}
        </StyledListArea>
      </StyledApp>
    </StyledPitchSearch>
  );
});

export default PitchSearch;
