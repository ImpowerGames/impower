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
import { FontIcon } from "../../impower-icon";
import Avatar from "../../impower-route/components/elements/Avatar";
import Markdown from "../../impower-route/components/elements/Markdown";
import NoteCardAction from "./NoteCardAction";

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

const StyledSummaryArea = styled.div`
  margin: ${(props): string => props.theme.spacing(-2, 0)};
`;

const StyledUsernameArea = styled.div`
  display: flex;
  align-items: center;
`;

const StyledNoteUsernameButton = styled(Button)`
  min-width: 0;
  text-transform: none;
  padding: ${(props): string => props.theme.spacing(0.5, 0.5)};
  margin: ${(props): string => props.theme.spacing(-0.5, -0.5)};
  &.MuiButton-root.Mui-disabled {
    color: rgba(0, 0, 0, 0.6);
  }
`;

const StyledDivider = styled(Divider)``;

interface NoteCardLayoutProps {
  innerRef?: React.Ref<HTMLDivElement>;
  pitchId: string;
  contributionId: string;
  targetCreatedBy: string;
  id?: string;
  authors?: { [uid: string]: AuthorAttributes };
  authorDisplayLimit?: number;
  content?: string;
  details?: React.ReactNode;
  style?: React.CSSProperties;
}

const NoteCardLayout = React.memo((props: NoteCardLayoutProps): JSX.Element => {
  const {
    innerRef,
    pitchId,
    contributionId,
    targetCreatedBy,
    id,
    authors,
    authorDisplayLimit = 1,
    content,
    details,
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

  const authorDisplayEntries = useMemo(
    () =>
      authors
        ? Object.entries(authors).slice(0, authorDisplayLimit)
        : undefined,
    [authorDisplayLimit, authors]
  );

  const mainAuthor = id ? authors?.[id] : undefined;

  return (
    <>
      <StyledCard elevation={0} ref={innerRef} style={style}>
        <StyledCardActionAreaContent>
          <StyledCardHeader
            avatar={
              id ? (
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
              ) : (
                <FontIcon
                  aria-label={`Kudo`}
                  color={theme.colors.kudo}
                  size={24}
                >
                  <CircleHeartSolidIcon />
                </FontIcon>
              )
            }
            action={
              <NoteCardAction
                pitchId={pitchId}
                contributionId={contributionId}
                id={id}
                content={content}
              />
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
                        <StyledNoteUsernameButton
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
                        </StyledNoteUsernameButton>
                      </NextLink>
                    </StyledUsernameArea>
                  ))}
                  <StyledSubheaderContent>{details}</StyledSubheaderContent>
                </StyledTitleArea>
              ) : undefined
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
});

export default NoteCardLayout;
