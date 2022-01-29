import styled from "@emotion/styled";
import Typography from "@material-ui/core/Typography";
import React, { useCallback, useContext, useMemo } from "react";
import { AuthorAttributes } from "../../impower-auth";
import { abbreviateAge } from "../../impower-config";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  getDataStoreKey,
  ProjectDocument,
} from "../../impower-data-store";
import {
  UserContext,
  userDoConnect,
  userReadNotification,
  userUndoConnect,
} from "../../impower-user";
import KudoCardLayout from "./KudoCardLayout";

const StyledSingleLineTypography = styled(Typography)`
  white-space: pre;
  overflow: hidden;
  flex-shrink: 0;
`;

interface KudoCardContentProps {
  innerRef?: React.Ref<HTMLDivElement>;
  pitchId: string;
  contributionId: string;
  targetCreatedBy: string;
  id: string;
  author?: AuthorAttributes;
  content?: string;
  createdAt?: Date;
  createdBy: string;
  connectedTo?: boolean;
  connectedFrom?: boolean;
  style?: React.CSSProperties;
  onConnect?: (e: React.MouseEvent, connected: boolean) => void;
}

const KudoCardContent = React.memo(
  (props: KudoCardContentProps): JSX.Element => {
    const {
      innerRef,
      pitchId,
      contributionId,
      targetCreatedBy,
      id,
      author,
      content,
      createdAt,
      createdBy,
      connectedTo,
      connectedFrom,
      style,
      onConnect,
    } = props;

    const authors = useMemo(
      () => ({ [createdBy]: author }),
      [author, createdBy]
    );

    return (
      <KudoCardLayout
        innerRef={innerRef}
        pitchId={pitchId}
        contributionId={contributionId}
        targetCreatedBy={targetCreatedBy}
        id={id}
        authors={authors}
        content={content}
        details={
          <StyledSingleLineTypography variant="body2" color="textSecondary">
            {` • ${abbreviateAge(createdAt)}`}
          </StyledSingleLineTypography>
        }
        connectedTo={connectedTo}
        connectedFrom={connectedFrom}
        style={style}
        onConnect={onConnect}
      />
    );
  }
);

interface KudoCardProps {
  innerRef?: React.Ref<HTMLDivElement>;
  pitchId: string;
  contributionId: string;
  targetDoc: ProjectDocument | ContributionDocument;
  id: string;
  data?: AggData;
  style?: React.CSSProperties;
  onConnect?: (e: React.MouseEvent, connected: boolean) => void;
}

const KudoCard = React.memo((props: KudoCardProps): JSX.Element => {
  const {
    innerRef,
    pitchId,
    contributionId,
    targetDoc,
    id,
    data,
    style,
    onConnect,
  } = props;

  const [userState, userDispatch] = useContext(UserContext);
  const { connects, my_connects } = userState;
  const connectedTo =
    my_connects !== undefined && id
      ? Boolean(my_connects?.[getDataStoreKey("users", id)])
      : undefined;
  const connectedFrom =
    connects !== undefined && id ? Boolean(connects?.[id]) : undefined;

  const handleConnect = useCallback(
    async (e: React.MouseEvent, connected: boolean): Promise<void> => {
      if (connected) {
        userDispatch(userDoConnect("users", id));
        userDispatch(userReadNotification("connects", "users", id));
      } else {
        userDispatch(userUndoConnect("users", id));
      }
      if (onConnect) {
        onConnect(e, connected);
      }
    },
    [id, onConnect, userDispatch]
  );

  return (
    <KudoCardContent
      innerRef={innerRef}
      pitchId={pitchId}
      contributionId={contributionId}
      targetCreatedBy={targetDoc?._createdBy}
      id={id}
      author={data?.a}
      createdBy={id}
      createdAt={new Date(data?.t)}
      content={data?.c}
      connectedTo={connectedTo}
      connectedFrom={connectedFrom}
      style={style}
      onConnect={handleConnect}
    />
  );
});

export default KudoCard;
