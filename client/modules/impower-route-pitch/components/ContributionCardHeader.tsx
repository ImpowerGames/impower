import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import CardHeader from "@mui/material/CardHeader";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import React, { useCallback, useMemo } from "react";
import EllipsisVerticalRegularIcon from "../../../resources/icons/regular/ellipsis-vertical.svg";
import PenRegularIcon from "../../../resources/icons/regular/pen-line.svg";
import { AuthorAttributes } from "../../impower-auth";
import { abbreviateAge } from "../../impower-config";
import { FontIcon } from "../../impower-icon";
import Avatar from "../../impower-route/components/elements/Avatar";
import PostBackButton from "./PostBackButton";

const Skeleton = dynamic(() => import("@mui/material/Skeleton"), {
  ssr: false,
});

const StyledCardHeader = styled(CardHeader)`
  min-width: 0;
  padding: ${(props): string => props.theme.spacing(0, 3, 0, 1)};
  position: sticky:
  top: 0;

  & .MuiCardHeader-avatar {
    margin-right: ${(props): string => props.theme.spacing(1.5)};
  }

  & .MuiCardHeader-content {
    min-width: 0;
    flex: 1;
  }

  & .MuiCardHeader-action {
    margin-top:  ${(props): string => props.theme.spacing(-1)};
    align-self: center;
  }
`;

const StyledIconButton = styled(IconButton)`
  will-change: opacity;
  @media (hover: hover) and (pointer: fine) {
    &.MuiIconButton-root:hover {
      background-color: ${(props): string => props.theme.colors.black10};
    }
  }
`;

const StyledSingleLineTypography = styled(Typography)`
  white-space: pre;
  overflow: hidden;
  flex-shrink: 0;
  opacity: 0.6;
`;

const StyledSingleLineEllipsisTypography = styled(StyledSingleLineTypography)`
  transition: none;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 10000;
  white-space: nowrap;
  font-weight: 600;
  opacity: 1;
`;

const StyledTitleArea = styled.div`
  min-width: 0;
  min-height: ${(props): string => props.theme.spacing(3)};
  display: flex;
  position: relative;
  flex: 1;
  will-change: transform;
`;

const StyledSubheaderContent = styled.div`
  margin: ${(props): string => props.theme.spacing(0, -1)};
  padding: ${(props): string => props.theme.spacing(0, 1)};
  display: flex;
  align-items: center;
`;

const StyledContributionUsernameButton = styled(Button)`
  min-width: 0;
  text-transform: none;
  transition: none;
  padding: ${(props): string => props.theme.spacing(0.5, 0.5)};
  &.MuiButton-root.Mui-disabled {
    color: rgba(0, 0, 0, 0.6);
  }

  min-width: 0;
`;

const StyledAvatarArea = styled.div`
  position: relative;
`;

const StyledAvatarBackContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
  will-change: opacity;
`;

const StyledAvatarUserContent = styled.div`
  padding: ${(props): string => props.theme.spacing(2, 0, 2, 2)};
  transition: opacity 0.15s ease;
  will-change: opacity;
`;

const getUserLink = (username: string): string => `/u/${username}`;

interface ContributionCardHeaderProps {
  avatarUserRef?: React.Ref<HTMLDivElement>;
  avatarBackRef?: React.Ref<HTMLDivElement>;
  pitchId?: string;
  author: AuthorAttributes;
  authorColor: "primary" | "secondary" | "inherit";
  authorStyle: React.CSSProperties;
  createdAt: string;
  updatedAt: string;
  hasPostMenu?: boolean;
  showBackButton?: boolean;
  onClose?: (e: React.MouseEvent) => void;
  onOpenPostMenu?: (e: React.MouseEvent) => void;
}

const ContributionCardHeader = React.memo(
  (props: ContributionCardHeaderProps): JSX.Element => {
    const {
      avatarUserRef,
      avatarBackRef,
      pitchId,
      authorColor,
      authorStyle,
      author,
      hasPostMenu,
      createdAt,
      updatedAt,
      showBackButton,
      onClose,
      onOpenPostMenu,
    } = props;

    const avatarName = author?.u;
    const avatarIcon = author?.i;
    const avatarColor = author?.h;
    const avatarLink = getUserLink(author?.u);

    const edited =
      updatedAt &&
      new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 1000;
    const age = useMemo(
      () =>
        edited
          ? abbreviateAge(new Date(updatedAt))
          : abbreviateAge(new Date(createdAt)),
      [edited, updatedAt, createdAt]
    );

    const handleBlockRipplePropogation = useCallback(
      (e: React.MouseEvent | React.TouchEvent): void => {
        e.stopPropagation();
      },
      []
    );

    const handleOpenPostMenu = useCallback(
      (e: React.MouseEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        if (onOpenPostMenu) {
          onOpenPostMenu(e);
        }
      },
      [onOpenPostMenu]
    );

    const iconStyle: React.CSSProperties = useMemo(
      () => ({ opacity: 0.6 }),
      []
    );
    const editedIconStyle: React.CSSProperties = useMemo(
      () => ({ opacity: 0.4 }),
      []
    );

    const avatar = useMemo(
      () =>
        showBackButton ? (
          <StyledAvatarArea>
            <PostBackButton backUrl={`/p/${pitchId}`} onBack={onClose} />
          </StyledAvatarArea>
        ) : (
          <StyledAvatarArea>
            <StyledAvatarUserContent ref={avatarUserRef}>
              <Avatar
                alt={avatarName}
                backgroundColor={avatarColor}
                src={avatarIcon}
                href={avatarLink}
                size={24}
                fontSize={12}
                onClick={handleBlockRipplePropogation}
                onMouseDown={handleBlockRipplePropogation}
                onTouchStart={handleBlockRipplePropogation}
              />
            </StyledAvatarUserContent>
            <StyledAvatarBackContent ref={avatarBackRef}>
              <PostBackButton backUrl={`/p/${pitchId}`} onBack={onClose} />
            </StyledAvatarBackContent>
          </StyledAvatarArea>
        ),
      [
        avatarBackRef,
        avatarColor,
        avatarIcon,
        avatarLink,
        avatarName,
        avatarUserRef,
        handleBlockRipplePropogation,
        onClose,
        showBackButton,
        pitchId,
      ]
    );

    const action = useMemo(
      () => (
        <StyledIconButton
          color="inherit"
          aria-label="Options"
          onClick={handleOpenPostMenu}
          onMouseDown={handleBlockRipplePropogation}
          onTouchStart={handleBlockRipplePropogation}
        >
          <FontIcon aria-label="Options" size={20} style={iconStyle}>
            <EllipsisVerticalRegularIcon />
          </FontIcon>
        </StyledIconButton>
      ),
      [handleBlockRipplePropogation, handleOpenPostMenu, iconStyle]
    );

    const title = useMemo(
      () => (
        <StyledTitleArea>
          <NextLink
            href={author?.u ? getUserLink(author?.u) : ""}
            passHref
            prefetch={false}
          >
            <StyledContributionUsernameButton
              color={authorColor}
              disabled={!author?.u}
              onClick={handleBlockRipplePropogation}
              onMouseDown={handleBlockRipplePropogation}
              onTouchStart={handleBlockRipplePropogation}
            >
              <StyledSingleLineEllipsisTypography
                variant="body2"
                style={authorStyle}
              >
                {author?.u ? `@${author?.u}` : <Skeleton width={80} />}
              </StyledSingleLineEllipsisTypography>
            </StyledContributionUsernameButton>
          </NextLink>
          <StyledSubheaderContent>
            <StyledSingleLineTypography variant="body2">
              {"  •  "}
              {age}
              {"  "}
            </StyledSingleLineTypography>
            {edited && (
              <FontIcon aria-label={`Edited`} size={12} style={editedIconStyle}>
                <PenRegularIcon />
              </FontIcon>
            )}
          </StyledSubheaderContent>
        </StyledTitleArea>
      ),
      [
        age,
        author?.u,
        authorColor,
        authorStyle,
        edited,
        editedIconStyle,
        handleBlockRipplePropogation,
      ]
    );

    return (
      <StyledCardHeader
        avatar={avatar}
        action={hasPostMenu ? action : undefined}
        title={title}
        disableTypography
      />
    );
  }
);

export default ContributionCardHeader;
