import styled from "@emotion/styled";
import Typography from "@material-ui/core/Typography";
import React, { useMemo } from "react";
import { AuthorAttributes } from "../../impower-auth";
import { abbreviateAge } from "../../impower-config";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import { NoteDocument } from "../../impower-data-store/types/documents/noteDocument";
import NoteCardLayout from "./NoteCardLayout";

const StyledSingleLineTypography = styled(Typography)`
  white-space: pre;
  overflow: hidden;
  flex-shrink: 0;
`;

interface NoteCardContentProps {
  innerRef?: React.Ref<HTMLDivElement>;
  pitchId: string;
  contributionId: string;
  targetCreatedBy: string;
  id: string;
  author?: AuthorAttributes;
  content?: string;
  createdAt?: Date;
  createdBy: string;
  style?: React.CSSProperties;
}

const NoteCardContent = React.memo(
  (props: NoteCardContentProps): JSX.Element => {
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
      style,
    } = props;

    const authors = useMemo(
      () => ({ [createdBy]: author }),
      [author, createdBy]
    );

    return (
      <NoteCardLayout
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
        style={style}
      />
    );
  }
);

interface NoteCardProps {
  innerRef?: React.Ref<HTMLDivElement>;
  pitchId: string;
  contributionId: string;
  targetDoc: ProjectDocument | ContributionDocument;
  id: string;
  doc?: NoteDocument;
  style?: React.CSSProperties;
}

const NoteCard = React.memo((props: NoteCardProps): JSX.Element => {
  const { innerRef, pitchId, contributionId, targetDoc, id, doc, style } =
    props;
  const removed = doc?.removed;
  const removedPlaceholder = `[removed]`;
  return (
    <NoteCardContent
      innerRef={innerRef}
      pitchId={pitchId}
      contributionId={contributionId}
      targetCreatedBy={targetDoc?._createdBy}
      id={id}
      author={doc?._author}
      createdBy={id}
      createdAt={
        typeof doc?._createdAt === "string"
          ? new Date(doc?._createdAt)
          : doc?._createdAt?.toDate()
      }
      content={removed ? removedPlaceholder : doc?.content}
      style={style}
    />
  );
});

export default NoteCard;
