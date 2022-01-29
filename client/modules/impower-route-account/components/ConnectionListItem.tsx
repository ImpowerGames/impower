import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import {
  Button,
  Divider,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  useMediaQuery,
} from "@material-ui/core";
import React, { useCallback, useContext } from "react";
import DiscordBrandsIcon from "../../../resources/icons/brands/discord.svg";
import EnvelopeRegularIcon from "../../../resources/icons/regular/envelope.svg";
import { abbreviateAge } from "../../impower-config";
import { AggData } from "../../impower-data-state";
import { useDialogNavigation } from "../../impower-dialog";
import { FontIcon } from "../../impower-icon";
import Avatar from "../../impower-route/components/elements/Avatar";
import { useRouter } from "../../impower-router";
import {
  UserContext,
  userDoConnect,
  userUndoConnect,
  userReadNotification,
  userRejectConnect,
} from "../../impower-user";

const StyledListItem = styled(ListItem)``;

const StyledListItemButton = styled(ListItemButton)`
  max-width: 100%;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding: ${(props): string => props.theme.spacing(1)};
  }
`;

const StyledListItemText = styled(ListItemText)`
  & .MuiListItemText-secondary {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const StyledItemDivider = styled(Divider)`
  width: calc(100% - 72px);
`;

const StyledButton = styled(Button)`
  margin: ${(props): string => props.theme.spacing(0, 0.5)};
  flex-shrink: 0;
  min-width: 0;
`;

const StyledContactArea = styled.div`
  display: flex;
  align-items: center;
`;

const StyledContactIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1)};
  opacity: 0.8;
`;

const StyledContactLabelArea = styled.div`
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

interface ConnectionListItemSecondaryTextProps {
  data: AggData;
  connectStatus: "connected" | "incoming" | "outgoing";
  notificationStatus: "read" | "unread";
}

const ConnectionListItemSecondaryText = React.memo(
  (props: ConnectionListItemSecondaryTextProps): JSX.Element | null => {
    const { data, connectStatus, notificationStatus } = props;

    const theme = useTheme();
    const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("sm"));

    if (connectStatus === "connected") {
      return (
        <>
          {data?.c && (
            <StyledContactArea
              style={{
                color:
                  notificationStatus === "unread"
                    ? theme.palette.secondary.main
                    : undefined,
                fontWeight: notificationStatus === "unread" ? 600 : undefined,
              }}
            >
              <StyledContactIconArea>
                <FontIcon
                  aria-label={data?.c?.includes("@") ? "email" : "discord"}
                  size={14}
                >
                  {data?.c?.includes("@") ? (
                    <EnvelopeRegularIcon />
                  ) : (
                    <DiscordBrandsIcon />
                  )}
                </FontIcon>
              </StyledContactIconArea>
              <StyledContactLabelArea>{data?.c}</StyledContactLabelArea>
            </StyledContactArea>
          )}
        </>
      );
    }

    if (connectStatus === "incoming") {
      return (
        <StyledContactArea
          style={{
            color:
              notificationStatus === "unread"
                ? theme.palette.secondary.main
                : undefined,
            fontWeight: notificationStatus === "unread" ? 600 : undefined,
          }}
        >
          {`${belowSmBreakpoint ? "" : "wants to connect — "}${abbreviateAge(
            new Date(data?.t)
          )}`}
        </StyledContactArea>
      );
    }

    if (connectStatus === "outgoing") {
      return (
        <StyledContactArea
          style={{
            color:
              notificationStatus === "unread"
                ? theme.palette.secondary.main
                : undefined,
            fontWeight: notificationStatus === "unread" ? 600 : undefined,
          }}
        >
          {`${belowSmBreakpoint ? "" : "was sent a request — "}${abbreviateAge(
            new Date(data?.t)
          )}`}
        </StyledContactArea>
      );
    }

    return null;
  }
);

interface ConnectionListItemButtonProps {
  id: string;
  data: AggData;
  status: "connected" | "incoming" | "outgoing";
}

const ConnectionListItemButtons = React.memo(
  (props: ConnectionListItemButtonProps): JSX.Element | null => {
    const { id, data, status } = props;
    const [userState, userDispatch] = useContext(UserContext);

    const { settings } = userState;
    const account = settings?.account;
    const contact = account === undefined ? undefined : account?.contact || "";

    const [openAccountDialog] = useDialogNavigation("a");

    const handleBlockRipplePropogation = useCallback(
      (e: React.MouseEvent | React.TouchEvent): void => {
        e.stopPropagation();
      },
      []
    );

    const handleCopy = useCallback((e: React.MouseEvent, value: string) => {
      e.stopPropagation();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(value);
      }
    }, []);

    const handleIgnore = useCallback(
      async (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        userDispatch(userRejectConnect("users", id));
        userDispatch(userReadNotification("connects", "users", id));
      },
      [userDispatch]
    );

    const handleDoConnect = useCallback(
      (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!contact) {
          openAccountDialog(`contact_${id}`);
          return;
        }
        userDispatch(userDoConnect("users", id));
        userDispatch(userReadNotification("connects", "users", id));
      },
      [contact, openAccountDialog, userDispatch]
    );

    const handleUndoConnect = useCallback(
      (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        userDispatch(userUndoConnect("users", id));
      },
      [userDispatch]
    );
    if (status === "connected") {
      return (
        <>
          {data?.c && data?.c?.includes("@") ? (
            <StyledButton
              variant="outlined"
              href={`mailto:${data?.c}`}
              onMouseDown={handleBlockRipplePropogation}
              onTouchStart={handleBlockRipplePropogation}
              onClick={handleBlockRipplePropogation}
            >
              {`Contact`}
            </StyledButton>
          ) : data?.c ? (
            <StyledButton
              variant="outlined"
              onMouseDown={handleBlockRipplePropogation}
              onTouchStart={handleBlockRipplePropogation}
              onClick={(e: React.MouseEvent): void => {
                handleCopy(e, data?.c);
              }}
            >
              {`Copy`}
            </StyledButton>
          ) : null}
        </>
      );
    }
    if (status === "incoming") {
      return (
        <>
          {!data?.r && (
            <>
              <StyledButton
                onMouseDown={handleBlockRipplePropogation}
                onTouchStart={handleBlockRipplePropogation}
                onClick={(e): void => {
                  handleIgnore(e, id);
                }}
              >{`Ignore`}</StyledButton>
              <StyledButton
                variant="outlined"
                onMouseDown={handleBlockRipplePropogation}
                onTouchStart={handleBlockRipplePropogation}
                onClick={(e): void => {
                  handleDoConnect(e, id);
                }}
              >{`Connect`}</StyledButton>
            </>
          )}
        </>
      );
    }
    if (status === "outgoing") {
      return (
        <StyledButton
          variant="outlined"
          onMouseDown={handleBlockRipplePropogation}
          onTouchStart={handleBlockRipplePropogation}
          onClick={(e): void => {
            handleUndoConnect(e, id);
          }}
        >{`Cancel`}</StyledButton>
      );
    }
    return null;
  }
);

interface ConnectionListItemProps {
  id: string;
  data: AggData;
  connectStatus: "connected" | "incoming" | "outgoing";
  notificationStatus?: "read" | "unread";
  onLoading?: (isLoading: boolean) => void;
}

const ConnectionListItem = React.memo(
  (props: ConnectionListItemProps): JSX.Element | null => {
    const { id, data, connectStatus, notificationStatus, onLoading } = props;

    const [, userDispatch] = useContext(UserContext);

    const router = useRouter();

    const handleClick = useCallback(
      async (e: React.MouseEvent, id: string, data: AggData) => {
        if (notificationStatus === "unread") {
          userDispatch(userReadNotification("connects", "users", id));
        }
        onLoading?.(true);
        await router.push(`/u/${data?.a?.u}?t=contributions`);
        onLoading?.(false);
      },
      [notificationStatus, onLoading, router, userDispatch]
    );

    return (
      <StyledListItem alignItems="flex-start" disablePadding>
        <StyledListItemButton
          onClick={(e): void => {
            handleClick(e, id, data);
          }}
        >
          <ListItemAvatar>
            <Avatar
              alt={data?.a?.u}
              src={data?.a?.i}
              backgroundColor={data?.a?.h}
            />
          </ListItemAvatar>
          <StyledListItemText
            primary={data?.a?.u}
            secondary={
              <ConnectionListItemSecondaryText
                data={data}
                connectStatus={connectStatus}
                notificationStatus={notificationStatus}
              />
            }
          />
          <ConnectionListItemButtons
            id={id}
            data={data}
            status={connectStatus}
          />
        </StyledListItemButton>
        <StyledItemDivider variant="inset" absolute />
      </StyledListItem>
    );
  }
);

export default ConnectionListItem;
