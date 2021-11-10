import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import CardHeader from "@material-ui/core/CardHeader";
import Divider from "@material-ui/core/Divider";
import Typography from "@material-ui/core/Typography";
import NextLink from "next/link";
import React, { useCallback, useMemo } from "react";
import CircleHeartSolidIcon from "../../../resources/icons/solid/circle-heart.svg";
import { AuthorAttributes } from "../../impower-auth";
import { abbreviateAge } from "../../impower-config";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import { FontIcon } from "../../impower-icon";
import Markdown from "../../impower-route/components/elements/Markdown";
import KudoCardAction from "./KudoCardAction";

const StyledCard = styled(Card)`
  flex: 1;
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

const StyledCardContent = styled(CardContent)`
  padding: ${(props): string => props.theme.spacing(0, 3, 1, 3)};
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

const StyledSummaryArea = styled.div`
  margin: ${(props): string => props.theme.spacing(-2, 0)};
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

interface KudoCardContentProps {
  innerRef?: React.Ref<HTMLDivElement>;
  targetId: string;
  targetCreatedBy: string;
  id: string;
  author?: AuthorAttributes;
  content?: string;
  createdAt?: Date;
  createdBy: string;
  style?: React.CSSProperties;
}

const KudoCardContent = React.memo(
  (props: KudoCardContentProps): JSX.Element => {
    const {
      innerRef,
      targetId,
      targetCreatedBy,
      id,
      author,
      content,
      createdAt,
      createdBy,
      style,
    } = props;

    const getUserLink = (username: string): string => `/u/${username}`;

    const handleBlockRipplePropogation = useCallback(
      (e: React.MouseEvent | React.TouchEvent): void => {
        e.stopPropagation();
      },
      []
    );

    const theme = useTheme();

    const isOP = targetCreatedBy === createdBy;

    const authorColor = isOP ? "primary" : "inherit";

    const authorStyle: React.CSSProperties = useMemo(
      () => ({
        opacity: isOP ? 1 : 0.9,
      }),
      [isOP]
    );

    return (
      <>
        <StyledCard elevation={0} ref={innerRef} style={style}>
          <StyledCardActionAreaContent>
            <StyledCardHeader
              avatar={
                <FontIcon
                  aria-label={content ? `Comment` : `Like`}
                  color={content ? theme.colors.like : theme.colors.kudo}
                  size={24}
                >
                  <CircleHeartSolidIcon />
                </FontIcon>
              }
              action={
                <KudoCardAction
                  targetId={targetId}
                  id={id}
                  createdBy={createdBy}
                />
              }
              title={
                <StyledTitleArea>
                  <NextLink
                    href={author?.u ? getUserLink(author?.u) : ""}
                    passHref
                    prefetch={false}
                  >
                    <StyledKudoUsernameButton
                      disabled={!author}
                      color={authorColor}
                      onClick={handleBlockRipplePropogation}
                      onMouseDown={handleBlockRipplePropogation}
                      onTouchStart={handleBlockRipplePropogation}
                    >
                      <StyledSingleLineEllipsisTypography
                        variant="body2"
                        style={authorStyle}
                      >
                        @{author?.u || `Anonymous`}
                      </StyledSingleLineEllipsisTypography>
                    </StyledKudoUsernameButton>
                  </NextLink>
                  <StyledSubheaderContent>
                    <StyledSingleLineTypography
                      variant="body2"
                      color="textSecondary"
                    >
                      {"  •  "}
                      {abbreviateAge(createdAt)}
                    </StyledSingleLineTypography>
                  </StyledSubheaderContent>
                </StyledTitleArea>
              }
              disableTypography
            />
            {content && (
              <StyledCardContent>
                <StyledSummaryArea>
                  <Markdown>{content}</Markdown>
                </StyledSummaryArea>
              </StyledCardContent>
            )}
          </StyledCardActionAreaContent>
          <StyledDivider absolute />
        </StyledCard>
      </>
    );
  }
);

interface KudoCardProps {
  innerRef?: React.Ref<HTMLDivElement>;
  targetId: string;
  targetDoc: ProjectDocument | ContributionDocument;
  id: string;
  data?: AggData;
  style?: React.CSSProperties;
}

const KudoCard = React.memo((props: KudoCardProps): JSX.Element => {
  const { innerRef, targetId, targetDoc, id, data, style } = props;

  return (
    <KudoCardContent
      innerRef={innerRef}
      targetId={targetId}
      targetCreatedBy={targetDoc?._createdBy}
      id={id}
      author={data?.a}
      createdBy={id}
      createdAt={data?.t ? new Date(data.t) : undefined}
      content={data?.c}
      style={style}
    />
  );
});

export default KudoCard;
