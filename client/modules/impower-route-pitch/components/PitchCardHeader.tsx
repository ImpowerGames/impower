import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import CardHeader from "@material-ui/core/CardHeader";
import IconButton from "@material-ui/core/IconButton";
import Typography from "@material-ui/core/Typography";
import dynamic from "next/dynamic";
import React, { useCallback, useContext, useMemo } from "react";
import EllipsisVerticalRegularIcon from "../../../resources/icons/regular/ellipsis-vertical.svg";
import HandshakeSimpleRegularIcon from "../../../resources/icons/regular/handshake-simple.svg";
import LightbulbOnRegularIcon from "../../../resources/icons/regular/lightbulb-on.svg";
import PenRegularIcon from "../../../resources/icons/regular/pen-line.svg";
import { AuthorAttributes } from "../../impower-auth";
import {
  abbreviateAge,
  abbreviateCount,
  capitalize,
  ConfigContext,
  ConfigParameters,
} from "../../impower-config";
import ConfigCache from "../../impower-config/classes/configCache";
import { escapeURI, PitchGoal } from "../../impower-data-store";
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
const getTagLink = (tag: string): string => `/pitch/search/${escapeURI(tag)}`;

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
  participationCount: number;
  participationIconColor: string;
  particpationIcon: React.ReactNode;
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
      participationCount,
      participationIconColor,
      particpationIcon,
      preview,
      tempUsername,
      onBlockRipplePropogation,
    } = props;

    const theme = useTheme();
    const [, navigationDispatch] = useContext(NavigationContext);

    const hiddenStyle: React.CSSProperties = useMemo(
      () => ({ visibility: "hidden" }),
      []
    );
    const iconStyle: React.CSSProperties = useMemo(
      () => ({ opacity: 0.6 }),
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
          <StyledSingleLineTypography variant="body2" color="textSecondary">
            {"  •  "}
          </StyledSingleLineTypography>
          <FontIcon
            aria-label={`Goal`}
            size={theme.typography.body2.fontSize}
            color={participationIconColor}
            style={iconStyle}
          >
            {particpationIcon}
          </FontIcon>
          {participationCount && (
            <StyledSingleLineTypography variant="body2" color="textSecondary">
              {"  "}
              {abbreviateCount(participationCount)}
            </StyledSingleLineTypography>
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
  kudoCount?: number;
  connectionCount?: number;
  contributionCount?: number;
  author?: AuthorAttributes;
  tags?: string[];
  delisted?: boolean;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
  pitchGoal?: PitchGoal;
  onOpenPostMenu?: (e: React.MouseEvent) => void;
}

const PitchCardHeader = React.memo(
  (props: PitchCardHeaderProps): JSX.Element => {
    const {
      config,
      icons,
      author,
      tags,
      delisted,
      archived,
      createdAt,
      updatedAt,
      pitchGoal,
      connectionCount,
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

    const theme = useTheme();

    const authorName = author?.u;

    const particpationIcon = useMemo(
      () =>
        pitchGoal === PitchGoal.Collaboration ? (
          <HandshakeSimpleRegularIcon />
        ) : pitchGoal === PitchGoal.Inspiration ? (
          <LightbulbOnRegularIcon />
        ) : undefined,
      [pitchGoal]
    );
    const participationIconColor = theme.palette.text.secondary;
    const participationCount =
      pitchGoal === PitchGoal.Collaboration ? connectionCount : undefined;

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
    const tagColorName = currentConfig?.tagColorNames?.[mainTag] || "";
    const mainTagLabel = capitalize(mainTag);
    const tagColor = currentConfig?.colors?.[tagColorName];
    const tagIconName = currentConfig?.tagIconNames?.[mainTag];
    const validTagIconName = tagIconName || "hashtag";
    const validTagColor = tagIconName ? tagColor : "#052d57";

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

    const avatarIcon = useMemo(
      () => (
        <DynamicIcon icon={icons?.[validTagIconName] || validTagIconName} />
      ),
      [icons, validTagIconName]
    );

    const avatarStyle: React.CSSProperties = useMemo(
      () => ({ borderRadius: 3 }),
      []
    );

    const avatar = useMemo(
      () => (
        <Avatar
          alt={mainTag}
          backgroundColor={validTagColor}
          fontSize={24}
          icon={avatarIcon}
          aria-label={mainTag}
          onClick={handleClickMainTag}
          onMouseDown={handleBlockRipplePropogation}
          onTouchStart={handleBlockRipplePropogation}
          style={avatarStyle}
        />
      ),
      [
        mainTag,
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
          participationCount={participationCount}
          participationIconColor={participationIconColor}
          particpationIcon={particpationIcon}
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
        participationCount,
        participationIconColor,
        particpationIcon,
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
