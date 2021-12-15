import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import CardHeader from "@material-ui/core/CardHeader";
import IconButton from "@material-ui/core/IconButton";
import Typography from "@material-ui/core/Typography";
import dynamic from "next/dynamic";
import React, { useCallback, useContext, useMemo } from "react";
import EllipsisVerticalRegularIcon from "../../../resources/icons/regular/ellipsis-vertical.svg";
import PenRegularIcon from "../../../resources/icons/regular/pen-line.svg";
import { AuthorAttributes } from "../../impower-auth";
import {
  abbreviateAge,
  capitalize,
  ConfigContext,
  ConfigParameters,
} from "../../impower-config";
import ConfigCache from "../../impower-config/classes/configCache";
import { escapeURI, ProjectType } from "../../impower-data-store";
import { DynamicIcon, FontIcon, SvgData } from "../../impower-icon";
import {
  NavigationContext,
  navigationSetSearchbar,
} from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import Avatar from "../../impower-route/components/elements/Avatar";
import { UserContext } from "../../impower-user";

const Skeleton = dynamic(() => import("@material-ui/core/Skeleton"), {
  ssr: false,
});

const StyledCardHeader = styled(CardHeader)`
  pointer-events: auto;
  padding: ${(props): string => props.theme.spacing(3, 3, 0, 3)};
  align-items: flex-start;
  min-width: 0;

  & .MuiCardHeader-content {
    margin-top: -${(props): string => props.theme.spacing(0.5)};
  }
`;

const StyledIconButtonArea = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledIconButton = styled(IconButton)`
  padding: ${(props): string => props.theme.spacing(1, 1)};
  color: black;
  @media (hover: hover) and (pointer: fine) {
    &.MuiIconButton-root:hover {
      background-color: ${(props): string => props.theme.colors.black10};
    }
  }
`;

const StyledSemiBoldTypography = styled(Typography)`
  white-space: pre;
  overflow-wrap: break-word;
  font-weight: 600;
`;

const StyledSingleLineTypography = styled(Typography)`
  white-space: pre;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
`;

const StyledSingleLineEllipsisTypography = styled(StyledSingleLineTypography)`
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 10000;
  font-weight: 600;
`;

const StyledSubheaderArea = styled.div`
  min-width: 0;
  display: flex;
  position: relative;
  flex: 1;
`;

const StyledSubheaderContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow: hidden;
  margin: ${(props): string => props.theme.spacing(0, -1)};
  padding: ${(props): string => props.theme.spacing(0, 1)};
  display: flex;
  align-items: center;
`;

const StyledTitleButton = styled(Button)`
  min-width: 0;
  text-transform: none;
  padding: ${(props): string => props.theme.spacing(0.5, 0.5)};
  margin: ${(props): string => props.theme.spacing(-0.5, -0.5)};
`;

const StyledPitchUsernameButton = styled(Button)`
  min-width: 0;
  text-transform: none;
  padding: ${(props): string => props.theme.spacing(0.5, 0.5)};
  margin: ${(props): string => props.theme.spacing(-0.5, -0.5)};
  &.MuiButton-root.Mui-disabled {
    color: rgba(0, 0, 0, 0.6);
  }
`;

const getUserLink = (username: string): string => `/u/${username}`;
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

interface PitchCardHeaderActionProps {
  onBlockRipplePropogation: (e: React.MouseEvent | React.TouchEvent) => void;
  onOpenPostMenu?: (e: React.MouseEvent) => void;
}

const PitchCardHeaderAction = React.memo(
  (props: PitchCardHeaderActionProps) => {
    const { onBlockRipplePropogation, onOpenPostMenu } = props;
    const theme = useTheme();
    return (
      <StyledIconButtonArea>
        <StyledIconButton
          aria-label="Options"
          onClick={onOpenPostMenu}
          onMouseDown={onBlockRipplePropogation}
          onTouchStart={onBlockRipplePropogation}
        >
          <FontIcon
            aria-label="Options"
            size={20}
            color={theme.palette.text.secondary}
          >
            <EllipsisVerticalRegularIcon />
          </FontIcon>
        </StyledIconButton>
      </StyledIconButtonArea>
    );
  }
);

interface PitchCardHeaderTitleProps {
  mainTag: string;
  mainTagLabel: string;
  onBlockRipplePropogation: (e: React.MouseEvent | React.TouchEvent) => void;
}

const PitchCardHeaderTitle = React.memo((props: PitchCardHeaderTitleProps) => {
  const { mainTag, mainTagLabel, onBlockRipplePropogation } = props;
  const [, navigationDispatch] = useContext(NavigationContext);
  const handleClickMainTag = useCallback(
    async (e: React.MouseEvent): Promise<void> => {
      e.stopPropagation();
      const link = getTagLink(mainTag);
      if (window.location.pathname.endsWith(link)) {
        return;
      }
      navigationDispatch(navigationSetTransitioning(true));
      navigationDispatch(navigationSetSearchbar({ searching: true }));
      const router = (await import("next/router")).default;
      await router.push(link);
    },
    [mainTag, navigationDispatch]
  );
  return (
    <StyledTitleButton
      color="primary"
      onMouseDown={onBlockRipplePropogation}
      onTouchStart={onBlockRipplePropogation}
      onClick={handleClickMainTag}
    >
      <StyledSemiBoldTypography variant="body2">
        {mainTagLabel || <Skeleton width={120} />}
      </StyledSemiBoldTypography>
    </StyledTitleButton>
  );
});

interface PitchCardHeaderSubheaderProps {
  edited: boolean;
  age: string;
  archived: boolean;
  authorName: string;
  delisted: boolean;
  preview: boolean;
  tempUsername: string;
  onBlockRipplePropogation: (e: React.MouseEvent | React.TouchEvent) => void;
}

const PitchCardHeaderSubheader = React.memo(
  (props: PitchCardHeaderSubheaderProps) => {
    const {
      edited,
      age,
      archived,
      authorName,
      delisted,
      preview,
      tempUsername,
      onBlockRipplePropogation,
    } = props;

    const [, navigationDispatch] = useContext(NavigationContext);

    const hiddenStyle: React.CSSProperties = useMemo(
      () => ({ visibility: "hidden" }),
      []
    );
    const editedIconStyle: React.CSSProperties = useMemo(
      () => ({ opacity: 0.4 }),
      []
    );

    const handleClickUser = useCallback(
      async (e: React.MouseEvent): Promise<void> => {
        e.stopPropagation();
        const link = getUserLink(authorName);
        if (window.location.pathname.endsWith(link)) {
          return;
        }
        navigationDispatch(navigationSetTransitioning(true));
        const router = (await import("next/router")).default;
        await router.push(link);
      },
      [authorName, navigationDispatch]
    );

    return (
      <StyledSubheaderArea>
        <StyledSingleLineEllipsisTypography
          variant="body2"
          color="textSecondary"
          style={hiddenStyle}
        >
          .
        </StyledSingleLineEllipsisTypography>
        <StyledSubheaderContent>
          {archived || !delisted ? (
            <StyledPitchUsernameButton
              disabled={!authorName}
              onClick={handleClickUser}
              onMouseDown={onBlockRipplePropogation}
              onTouchStart={onBlockRipplePropogation}
            >
              <StyledSingleLineEllipsisTypography
                variant="body2"
                color={authorName ? "primary" : "inherit"}
              >
                {authorName ? (
                  `@${authorName}`
                ) : preview ? (
                  `@${tempUsername || "Anonymous"}`
                ) : (
                  <Skeleton width={80} />
                )}
              </StyledSingleLineEllipsisTypography>
            </StyledPitchUsernameButton>
          ) : (
            `[deleted]`
          )}
          {age && (
            <StyledSingleLineTypography variant="body2" color="textSecondary">
              {"  •  "}
              {age}
              {"  "}
            </StyledSingleLineTypography>
          )}
          {edited && (
            <FontIcon aria-label={`Edited`} size={12} style={editedIconStyle}>
              <PenRegularIcon />
            </FontIcon>
          )}
        </StyledSubheaderContent>
      </StyledSubheaderArea>
    );
  }
);

interface PitchCardHeaderProps {
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  preview?: boolean;
  projectType?: ProjectType;
  kudoCount?: number;
  contributionCount?: number;
  author?: AuthorAttributes;
  tags?: string[];
  nsfw?: boolean;
  delisted?: boolean;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
  onOpenPostMenu?: (e: React.MouseEvent) => void;
}

const PitchCardHeader = React.memo(
  (props: PitchCardHeaderProps): JSX.Element => {
    const {
      config,
      icons,
      projectType,
      author,
      tags,
      nsfw,
      delisted,
      archived,
      createdAt,
      updatedAt,
      preview,
      onOpenPostMenu,
    } = props;

    const [configState] = useContext(ConfigContext);
    const [userState] = useContext(UserContext);
    const { tempUsername } = userState;
    const [, navigationDispatch] = useContext(NavigationContext);

    const handleBlockRipplePropogation = useCallback(
      (e: React.MouseEvent | React.TouchEvent): void => {
        e.stopPropagation();
      },
      []
    );

    const authorName = author?.u;

    const edited =
      !preview &&
      updatedAt &&
      createdAt &&
      new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 1000;
    const age = useMemo(
      () =>
        !preview && edited
          ? abbreviateAge(new Date(updatedAt))
          : !preview
          ? abbreviateAge(new Date(createdAt))
          : abbreviateAge(new Date()),
      [preview, edited, updatedAt, createdAt]
    );

    const mainTag = tags?.[0] || "";
    const currentConfig = configState || config || ConfigCache.instance.params;
    const tagDisambiguations = currentConfig?.tagDisambiguations;
    const validMainTag = tagDisambiguations?.[mainTag]?.[0] || mainTag;
    const tagColorName = currentConfig?.tagColorNames?.[validMainTag] || "";
    const mainTagLabel = `${capitalize(mainTag)} ${capitalize(projectType)}`;
    const tagColor = currentConfig?.colors?.[tagColorName];
    const tagIconName =
      currentConfig?.tagIconNames?.[validMainTag] || "hashtag";
    const validTagColor = tagColor || "#052d57";

    const handleClickMainTag = useCallback(
      async (e: React.MouseEvent): Promise<void> => {
        e.stopPropagation();
        const link = getTagLink(mainTag);
        if (window.location.pathname.endsWith(link)) {
          return;
        }
        navigationDispatch(navigationSetTransitioning(true));
        navigationDispatch(navigationSetSearchbar({ searching: true }));
        const router = (await import("next/router")).default;
        await router.push(link);
      },
      [mainTag, navigationDispatch]
    );

    const theme = useTheme();

    const avatarIcon = useMemo(
      () => <DynamicIcon icon={icons?.[tagIconName] || tagIconName} />,
      [icons, tagIconName]
    );

    const avatarStyle: React.CSSProperties = useMemo(
      () => ({ borderRadius: 3 }),
      []
    );

    const avatar = useMemo(
      () => (
        <Avatar
          alt={nsfw ? `NSFW` : mainTag}
          backgroundColor={nsfw ? theme.palette.error.main : validTagColor}
          fontSize={13}
          iconSize={nsfw ? 16 : 24}
          label={nsfw ? `18+` : undefined}
          icon={avatarIcon}
          aria-label={mainTag}
          onClick={handleClickMainTag}
          onMouseDown={handleBlockRipplePropogation}
          onTouchStart={handleBlockRipplePropogation}
          style={avatarStyle}
        />
      ),
      [
        nsfw,
        mainTag,
        theme.palette.error.main,
        validTagColor,
        avatarIcon,
        handleClickMainTag,
        handleBlockRipplePropogation,
        avatarStyle,
      ]
    );

    const action = useMemo(
      () => (
        <PitchCardHeaderAction
          onOpenPostMenu={onOpenPostMenu}
          onBlockRipplePropogation={handleBlockRipplePropogation}
        />
      ),
      [handleBlockRipplePropogation, onOpenPostMenu]
    );

    const title = useMemo(
      () => (
        <PitchCardHeaderTitle
          mainTag={mainTag}
          mainTagLabel={mainTagLabel}
          onBlockRipplePropogation={handleBlockRipplePropogation}
        />
      ),
      [handleBlockRipplePropogation, mainTag, mainTagLabel]
    );

    const subheader = useMemo(
      () => (
        <PitchCardHeaderSubheader
          edited={edited}
          age={age}
          archived={archived}
          authorName={authorName}
          delisted={delisted}
          preview={preview}
          tempUsername={tempUsername}
          onBlockRipplePropogation={handleBlockRipplePropogation}
        />
      ),
      [
        edited,
        age,
        archived,
        authorName,
        delisted,
        handleBlockRipplePropogation,
        preview,
        tempUsername,
      ]
    );

    return (
      <StyledCardHeader
        avatar={avatar}
        action={!preview ? action : undefined}
        title={title}
        subheader={subheader}
        disableTypography
      />
    );
  }
);
export default PitchCardHeader;
