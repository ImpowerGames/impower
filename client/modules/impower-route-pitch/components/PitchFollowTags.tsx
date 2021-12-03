import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Divider from "@material-ui/core/Divider";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import NextLink from "next/link";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { capitalize, ConfigContext } from "../../impower-config";
import ConfigCache from "../../impower-config/classes/configCache";
import {
  escapeURI,
  getDataStoreKey,
  ProjectType
} from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import { DynamicIcon, FontIcon } from "../../impower-icon";
import {
  NavigationContext,
  navigationSetSearchbar
} from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import { VirtualizedItem } from "../../impower-react-virtualization";
import FadeAnimation from "../../impower-route/components/animations/FadeAnimation";
import TagIconLoader from "../../impower-route/components/elements/TagIconLoader";
import { UserContext, userDoFollow, userUndoFollow } from "../../impower-user";

const getTagLink = (tag: string): string => {
  if (typeof window === "undefined") {
    return "";
  }
  const urlParts = window.location.pathname.split("/");
  if (urlParts.length === 4) {
    return `${urlParts[0]}/${urlParts[1]}/${urlParts[2]}/${escapeURI(tag)}`;
  }
  return `${urlParts.join("/")}/${escapeURI(tag)}`;
};

const StyledContainer = styled.div`
  width: 100%;
  margin: auto;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledTypography = styled(Typography)`
  font-weight: 600;
`;

const StyledTagLink = styled(Button)`
  flex: 1;
  min-width: 0;
  justify-content: flex-start;
`;

const StyledPitchFollowTags = styled(FadeAnimation)``;

const StyledPaper = styled(Paper)`
  padding: 0;
  margin: ${(props): string => props.theme.spacing(2, 0)};
  ${(props): string => props.theme.breakpoints.down("md")} {
    border-radius: 0;
    margin: 0;
  }
`;

const StyledInfoArea = styled.div`
  padding: ${(props): string => props.theme.spacing(4)};
`;

const StyledReloadArea = styled(FadeAnimation)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  bottom: 0;
  position: sticky;
  z-index: 1;
`;

const StyledTitleTypography = styled(Typography)`
  text-align: center;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
`;

const StyledDescriptionTypography = styled(Typography)`
  text-align: center;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  padding: ${(props): string => props.theme.spacing(1, 0)};
`;

const StyledGroup = styled.div`
  background-color: inherit;
`;

const StyledGroupName = styled.div`
  padding: ${(props): string => props.theme.spacing(1, 2)};
  top: 112px;
  z-index: 1;
  position: sticky;
  display: flex;
  align-items: center;
  background-color: inherit;
  min-height: 48px;
`;

const StyledOptionArea = styled.div`
  display: flex;
  align-items: stretch;
`;

const StyledOption = styled.div`
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  min-width: 0;
  width: 100%;
  min-height: 100%;
  padding: ${(props): string => props.theme.spacing(0.5, 1)};
`;

const StyledLabelContent = styled.div`
  flex: 1;
  position: relative;
  min-height: 100%;
`;

const StyledOptionText = styled.div`
  position: absolute;
  top: ${(props): string => props.theme.spacing(1)};
  bottom: 0;
  left: 0;
  right: 0;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const StyledOptionIconArea = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin-right: ${(props): string => props.theme.spacing(2)};
  width: ${(props): string => props.theme.spacing(5)};
  height: ${(props): string => props.theme.spacing(5)};
  position: relative;
`;

const StyledButton = styled(Button)`
  padding: ${(props): string => props.theme.spacing(1, 2)};
`;

const StyledBottomButton = styled(Button)`
  padding: ${(props): string => props.theme.spacing(1.5, 2)};
  border-radius: 0;
  box-shadow: ${(props): string => props.theme.shadows[6]};
`;

const StyledDivider = styled(Divider)`
  width: 100%;
`;

interface VirtualizedTagItemProps {
  categoryIcon?: string;
  tag: string;
  label: string;
  style?: React.CSSProperties;
}

const VirtualizedTagItem = React.memo((props: VirtualizedTagItemProps) => {
  const { categoryIcon, tag, label, style } = props;

  const [configState] = useContext(ConfigContext);
  const [userState, userDispatch] = useContext(UserContext);
  const { isSignedIn, my_follows } = userState;
  const [, navigationDispatch] = useContext(NavigationContext);

  const followedTag =
    my_follows !== undefined
      ? Boolean(my_follows?.[getDataStoreKey("tags", tag)])
      : undefined;

  const [openAccountDialog] = useDialogNavigation("a");

  const handleFollowTag = useCallback(
    async (e: React.MouseEvent, id: string, followed: boolean) => {
      if (!isSignedIn) {
        openAccountDialog("signup");
        return;
      }
      if (followed) {
        userDispatch(userDoFollow("tags", id));
      } else {
        userDispatch(userUndoFollow("tags", id));
      }
    },
    [isSignedIn, openAccountDialog, userDispatch]
  );

  const theme = useTheme();

  const tagIconNames =
    configState?.tagIconNames || ConfigCache.instance.params?.tagIconNames;
  const tagDisambiguations =
    configState?.tagDisambiguations ||
    ConfigCache.instance.params?.tagDisambiguations;
  const validTag = tagDisambiguations?.[tag]?.[0] || tag;
  const tagIconName = tagIconNames?.[validTag] || "hashtag";

  const linkStyle: React.CSSProperties = useMemo(
    () => ({
      ...theme.typography.body1,
      textTransform: "none",
      fontWeight: theme.fontWeight.semiBold,
    }),
    [theme.fontWeight.semiBold, theme.typography.body1]
  );

  const optionTextStyle: React.CSSProperties = useMemo(
    () => ({ color: theme.palette.text.primary }),
    [theme.palette.text.primary]
  );

  const followButtonStyle: React.CSSProperties = useMemo(
    () => ({ opacity: followedTag ? 0.4 : undefined }),
    [followedTag]
  );

  const handleClickTag = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      navigationDispatch(navigationSetTransitioning(true));
      navigationDispatch(navigationSetSearchbar({ searching: true }));
    },
    [navigationDispatch]
  );

  return (
    <StyledOptionArea style={style}>
      <StyledOption>
        <NextLink href={getTagLink(tag)} passHref prefetch={false}>
          <StyledTagLink
            color="inherit"
            style={linkStyle}
            onClick={handleClickTag}
          >
            <StyledOptionIconArea>
              <FontIcon
                aria-label={tag}
                color={theme.palette.text.secondary}
                size={theme.fontSize.smallIcon}
              >
                <DynamicIcon icon={categoryIcon || tagIconName} />
              </FontIcon>
            </StyledOptionIconArea>
            <StyledLabelContent>
              <StyledOptionText style={optionTextStyle}>
                {label}
              </StyledOptionText>
            </StyledLabelContent>
          </StyledTagLink>
        </NextLink>
        <StyledButton
          color={followedTag ? "inherit" : "secondary"}
          onClick={(e): Promise<void> => handleFollowTag(e, tag, !followedTag)}
          style={followButtonStyle}
        >
          {followedTag ? `Followed!` : `Follow`}
        </StyledButton>
      </StyledOption>
    </StyledOptionArea>
  );
});

interface PitchFollowTagsListProps {
  category: string;
  categoryIcon?: string;
  tags: string[];
  excludeTags?: string[];
}

const PitchFollowTagsList = React.memo(
  (props: PitchFollowTagsListProps): JSX.Element => {
    const { category, categoryIcon, tags, excludeTags } = props;

    const groupNameHeight = 48;
    const optionHeight = 60;

    if (!tags) {
      return null;
    }

    return (
      <StyledGroup
        style={{
          minHeight: groupNameHeight + optionHeight * tags.length,
        }}
      >
        {category && (
          <StyledGroupName>
            <StyledDivider absolute />
            <StyledTypography>{category}</StyledTypography>
          </StyledGroupName>
        )}
        {tags
          .filter((tag) => !excludeTags?.includes(tag))
          .map((tag, index) => {
            const label = capitalize(tag || "");
            return (
              <VirtualizedItem key={tag} index={index} minHeight={optionHeight}>
                <VirtualizedTagItem
                  key={tag}
                  tag={tag?.toLowerCase()}
                  label={label}
                  categoryIcon={categoryIcon}
                />
              </VirtualizedItem>
            );
          })}
      </StyledGroup>
    );
  }
);

interface PitchFollowTagsProps {
  type?: ProjectType;
  loadingPlaceholder?: React.ReactNode;
  onReload?: (e: React.MouseEvent) => void;
}

const PitchFollowTags = React.memo(
  (props: PitchFollowTagsProps): JSX.Element => {
    const { type, loadingPlaceholder, onReload } = props;

    const [configState] = useContext(ConfigContext);
    const [userState] = useContext(UserContext);
    const [, navigationDispatch] = useContext(NavigationContext);
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
    const [initialFollowedTags, setInitialFollowedTags] =
      useState(followedTags);

    const handleReload = useCallback(
      (e: React.MouseEvent) => {
        if (onReload) {
          onReload(e);
        }
      },
      [onReload]
    );

    const projectTags =
      configState?.projectTags || ConfigCache.instance.params?.projectTags;
    const flattenedProjectTags: {
      [categories: string]: string[];
    } = useMemo(() => {
      const dict = {};
      Object.entries(projectTags).forEach(([category, tags]) => {
        dict[category] = tags?.flatMap((x) => x);
      });
      return dict;
    }, [projectTags]);
    const { Mechanics, Genres, Aesthetics, Subjects } = flattenedProjectTags;
    const moods = configState?.moods || ConfigCache.instance.params?.moods;
    const flattenedMoods = Array.from(
      new Set(Object.values(moods || {}).flatMap((x) => x.flatMap((y) => y)))
    );
    const visualStyles =
      configState?.visualStyles || ConfigCache.instance.params?.visualStyles;
    const musicalStyles =
      configState?.musicalStyles || ConfigCache.instance.params?.musicalStyles;
    const archetypes =
      configState?.archetypes || ConfigCache.instance.params?.archetypes;
    const atmospheres =
      configState?.atmospheres || ConfigCache.instance.params?.atmospheres;
    const locations =
      configState?.locations || ConfigCache.instance.params?.locations;
    const allTags = useMemo(
      () =>
        type === "game"
          ? {
              Mechanics,
              Genres,
              Aesthetics,
              Subjects,
              "Visual Styles": visualStyles,
              "Music Styles": musicalStyles,
            }
          : type === "character"
          ? {
              Archetypes: archetypes,
              Subjects,
              Mood: flattenedMoods,
            }
          : type === "voice"
          ? {
              Archetypes: archetypes,
              Mood: flattenedMoods,
            }
          : type === "environment"
          ? {
              Locations: locations,
              Atmospheres: atmospheres,
            }
          : type === "sound"
          ? {
              Locations: locations,
              Atmospheres: atmospheres,
            }
          : type === "music"
          ? {
              "Music Styles": musicalStyles,
              "Mood": flattenedMoods,
            }
          : {
              Genres,
              Aesthetics,
              Subjects,
            },
      [
        Aesthetics,
        Genres,
        Mechanics,
        Subjects,
        archetypes,
        atmospheres,
        flattenedMoods,
        locations,
        musicalStyles,
        type,
        visualStyles,
      ]
    );
    const overrideIcons = useMemo(
      () => ({
        Archetypes: "person",
        Mood: "masks-theater",
      }),
      []
    );

    const showReloadArea =
      Object.entries(my_follows || {}).filter(([, v]) => v.g === "tags")
        ?.length > 0;

    useEffect(() => {
      navigationDispatch(navigationSetTransitioning(false));
    }, [navigationDispatch]);

    const loadedFollows = my_follows !== undefined;

    useEffect(() => {
      if (loadedFollows) {
        setInitialFollowedTags(followedTags);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadedFollows]);

    if (!loadedFollows) {
      return <>{loadingPlaceholder}</>;
    }

    return (
      <StyledContainer>
        <StyledPitchFollowTags initial={0} animate={1} duration={0.1}>
          <StyledPaper>
            {initialFollowedTags?.length > 0 && (
              <>
                <PitchFollowTagsList
                  category={`Currently Following`}
                  tags={initialFollowedTags}
                />
                <StyledDivider />
              </>
            )}
            <StyledInfoArea>
              <StyledTitleTypography variant="h6">
                {`Any specific ${type} you enjoy?`}
              </StyledTitleTypography>
              <StyledDescriptionTypography
                variant="body2"
                color="textSecondary"
              >
                {`When you follow a tag, related pitches will appear in your Following Feed`}
              </StyledDescriptionTypography>
            </StyledInfoArea>
            <Divider />
            {Object.entries(allTags).map(([category, tags]) => (
              <PitchFollowTagsList
                key={category}
                category={category}
                tags={tags}
                categoryIcon={overrideIcons[category]}
                excludeTags={initialFollowedTags}
              />
            ))}
          </StyledPaper>
          <StyledReloadArea
            initial={showReloadArea ? 1 : 0}
            animate={showReloadArea ? 1 : 0}
            duration={0.15}
          >
            <StyledBottomButton
              variant="contained"
              color="primary"
              onClick={handleReload}
              fullWidth
            >{`Show me some pitches!`}</StyledBottomButton>
          </StyledReloadArea>
          <TagIconLoader />
        </StyledPitchFollowTags>
      </StyledContainer>
    );
  }
);

export default PitchFollowTags;
