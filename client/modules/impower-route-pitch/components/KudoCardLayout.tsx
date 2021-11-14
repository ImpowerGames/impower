import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Card from "@material-ui/core/Card";
import CardHeader from "@material-ui/core/CardHeader";
import Divider from "@material-ui/core/Divider";
import Typography from "@material-ui/core/Typography";
import NextLink from "next/link";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import HandshakeSimpleDuotoneIcon from "../../../resources/icons/duotone/handshake-simple.svg";
import HandshakeSimpleRegularIcon from "../../../resources/icons/regular/handshake-simple.svg";
import HandshakeSimpleSolidIcon from "../../../resources/icons/solid/handshake-simple.svg";
import { AuthorAttributes } from "../../impower-auth";
import { useDialogNavigation } from "../../impower-dialog";
import { FontIcon } from "../../impower-icon";
import Avatar from "../../impower-route/components/elements/Avatar";
import { UserContext } from "../../impower-user";

const StyledCard = styled(Card)`
  display: flex;
  flex-direction: column;
  border-radius: 0;
  position: relative;
  transition: opacity 0.3s ease;
`;

const StyledCardActionAreaContent = styled.div`
  max-width: 100%;
`;

const StyledCardHeader = styled(CardHeader)`
  padding: ${(props): string => props.theme.spacing(2, 3)};
  align-items: flex-start;
  min-width: 0;
  & .MuiCardHeader-avatar {
    margin-right: ${(props): string => props.theme.spacing(1.5)};
  }
`;

const StyledSingleLineTypography = styled(Typography)`
  white-space: pre;
  overflow: hidden;
  flex-shrink: 0;
`;

const StyledSingleLineEllipsisTypography = styled(StyledSingleLineTypography)`
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 10000;
  font-weight: 600;
`;

const StyledSeperatorTypography = styled(StyledSingleLineTypography)``;

const StyledTitleArea = styled.div`
  min-width: 0;
  min-height: ${(props): string => props.theme.spacing(3)};
  display: flex;
  position: relative;
  flex: 1;
`;

const StyledSubheaderContent = styled.div`
  margin: ${(props): string => props.theme.spacing(0, -1)};
  padding: ${(props): string => props.theme.spacing(0, 1)};
  display: flex;
  align-items: center;
`;

const StyledUsernameArea = styled.div`
  display: flex;
  align-items: center;
`;

const StyledKudoUsernameButton = styled(Button)`
  min-width: 0;
  text-transform: none;
  padding: ${(props): string => props.theme.spacing(0.5, 0.5)};
  margin: ${(props): string => props.theme.spacing(-0.5, -0.5)};
  &.MuiButton-root.Mui-disabled {
    color: rgba(0, 0, 0, 0.6);
  }
`;

const StyledDivider = styled(Divider)``;

const StyledActionButton = styled(Button)`
  color: inherit;
  text-transform: none;
  min-width: ${(props): string => props.theme.spacing(6)};
  max-height: ${(props): string => props.theme.spacing(4)};
  justify-content: center;
  padding: ${(props): string => props.theme.spacing(1, 1)};
  flex: 1;
`;
const StyledButtonTypography = styled(Typography)`
  white-space: pre;
  overflow-wrap: break-word;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
`;

const StyledSecondaryButtonTypography = styled(StyledButtonTypography)`
  opacity: 0.7;
`;

const StyledButtonIconArea = styled.div`
  opacity: 0.5;
  margin-right: ${(props): string => props.theme.spacing(0.75)};
`;

interface KudoCardLayoutProps {
  innerRef?: React.Ref<HTMLDivElement>;
  pitchId: string;
  contributionId: string;
  targetCreatedBy: string;
  id?: string;
  authors?: { [uid: string]: AuthorAttributes };
  authorDisplayLimit?: number;
  content?: string;
  details?: React.ReactNode;
  connectedTo?: boolean;
  connectedFrom?: boolean;
  style?: React.CSSProperties;
  onConnect?: (e: React.MouseEvent, connected: boolean) => void;
}

const KudoCardLayout = React.memo((props: KudoCardLayoutProps): JSX.Element => {
  const {
    innerRef,
    targetCreatedBy,
    id,
    authors,
    authorDisplayLimit = 1,
    details,
    connectedTo,
    connectedFrom,
    onConnect,
    style,
  } = props;

  const [userState] = useContext(UserContext);
  const { uid, isSignedIn, settings } = userState;
  const account = settings?.account;
  const contact = account === undefined ? undefined : account?.contact || "";
  const [connectedToState, setConnectedToState] = useState(connectedTo);

  const getUserLink = (username: string): string => `/u/${username}`;

  const [openAccountDialog] = useDialogNavigation("a");

  useEffect(() => {
    setConnectedToState(connectedTo);
  }, [connectedTo]);

  const handleBlockRipplePropogation = useCallback(
    (e: React.MouseEvent | React.TouchEvent): void => {
      e.stopPropagation();
    },
    []
  );

  const theme = useTheme();

  const authorDisplayEntries = useMemo(
    () =>
      authors
        ? Object.entries(authors).slice(0, authorDisplayLimit)
        : undefined,
    [authorDisplayLimit, authors]
  );

  const mainAuthor = id ? authors?.[id] : undefined;

  const connectButtonStyle: React.CSSProperties = useMemo(
    () => ({
      color: connectedTo ? theme.colors.connect : undefined,
      opacity: onConnect ? 1 : 0,
      pointerEvents: onConnect ? undefined : "none",
      transition: "opacity 0.3 ease",
    }),
    [connectedTo, onConnect, theme]
  );

  const connectButtonIconAreaStyle: React.CSSProperties = useMemo(
    () => ({
      opacity: connectedTo ? 1 : undefined,
    }),
    [connectedTo]
  );

  const handleConnect = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      if (!isSignedIn) {
        openAccountDialog("signup");
        return;
      }
      if (onConnect) {
        const newConnectedTo = !connectedToState;
        if (newConnectedTo) {
          if (!contact) {
            openAccountDialog(`contact_${id}`);
            return;
          }
        }
        setConnectedToState(newConnectedTo);
        onConnect(e, newConnectedTo);
      }
    },
    [isSignedIn, onConnect, openAccountDialog, connectedToState, contact, id]
  );

  return (
    <>
      <StyledCard elevation={0} ref={innerRef} style={style}>
        <StyledCardActionAreaContent>
          <StyledCardHeader
            avatar={
              <Avatar
                alt={mainAuthor?.u}
                backgroundColor={mainAuthor?.h}
                src={mainAuthor?.i}
                href={getUserLink(mainAuthor?.u)}
                size={24}
                fontSize={12}
                onClick={handleBlockRipplePropogation}
                onMouseDown={handleBlockRipplePropogation}
                onTouchStart={handleBlockRipplePropogation}
              />
            }
            action={
              uid === id ? undefined : (
                <StyledActionButton
                  onClick={handleConnect}
                  onMouseDown={handleBlockRipplePropogation}
                  onTouchStart={handleBlockRipplePropogation}
                  style={connectButtonStyle}
                >
                  <StyledButtonIconArea style={connectButtonIconAreaStyle}>
                    <FontIcon
                      aria-label="Connected"
                      color={connectedTo ? theme.colors.connect : undefined}
                      size={20}
                    >
                      {connectedTo && connectedFrom ? (
                        <HandshakeSimpleSolidIcon />
                      ) : connectedTo ? (
                        <HandshakeSimpleDuotoneIcon />
                      ) : (
                        <HandshakeSimpleRegularIcon />
                      )}
                    </FontIcon>
                  </StyledButtonIconArea>
                  <StyledSecondaryButtonTypography variant="overline">
                    {connectedTo && connectedFrom
                      ? `Connected!`
                      : connectedTo
                      ? `Requested`
                      : `Connect`}
                  </StyledSecondaryButtonTypography>
                </StyledActionButton>
              )
            }
            title={
              authors ? (
                <StyledTitleArea>
                  {authorDisplayEntries.map(([createdBy, author], index) => (
                    <StyledUsernameArea key={createdBy}>
                      {index > 0 &&
                        (authorDisplayEntries?.length === 2 ? (
                          <StyledSeperatorTypography
                            variant="body2"
                            color="textSecondary"
                          >
                            {` and `}
                          </StyledSeperatorTypography>
                        ) : (
                          <StyledSeperatorTypography
                            variant="body2"
                            color="textSecondary"
                          >
                            {`, `}
                          </StyledSeperatorTypography>
                        ))}
                      <NextLink
                        href={author?.u ? getUserLink(author?.u) : ""}
                        passHref
                        prefetch={false}
                      >
                        <StyledKudoUsernameButton
                          disabled={!author}
                          color={
                            targetCreatedBy === createdBy
                              ? "primary"
                              : "inherit"
                          }
                          onClick={handleBlockRipplePropogation}
                          onMouseDown={handleBlockRipplePropogation}
                          onTouchStart={handleBlockRipplePropogation}
                        >
                          <StyledSingleLineEllipsisTypography
                            variant="body2"
                            style={
                              targetCreatedBy === createdBy
                                ? { opacity: 1 }
                                : { opacity: 0.9 }
                            }
                          >
                            @{author?.u || `Anonymous`}
                          </StyledSingleLineEllipsisTypography>
                        </StyledKudoUsernameButton>
                      </NextLink>
                    </StyledUsernameArea>
                  ))}
                  <StyledSubheaderContent>{details}</StyledSubheaderContent>
                </StyledTitleArea>
              ) : undefined
            }
            disableTypography
          />
        </StyledCardActionAreaContent>
        <StyledDivider absolute />
      </StyledCard>
    </>
  );
});

export default KudoCardLayout;
