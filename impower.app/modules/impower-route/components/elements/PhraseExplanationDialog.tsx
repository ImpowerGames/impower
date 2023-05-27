import styled from "@emotion/styled";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import React, { useContext, useMemo } from "react";
import { getSubphrases } from "../../../../../concept-generator";
import { ConfigContext, capitalize } from "../../../impower-config";
import PhraseDialog from "./PhraseDialog";

const StyledDialogButton = styled(Button)``;

const StyledTagsArea = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
`;

const StyledTagTypography = styled(Typography)`
  margin: ${(props): string => props.theme.spacing(0, 0.5)};
`;

const StyledExplanationListArea = styled.div``;

const StyledExplanationItemArea = styled.div`
  padding: ${(props): string => props.theme.spacing(1, 0)};
`;

const StyledSubphraseTypography = styled(Typography)`
  text-align: center;
  font-weight: 600;
`;

interface PhraseExplanationDialogProps {
  open: boolean;
  phrase?: string;
  score?: number;
  tags?: string[];
  terms?: { [term: string]: string[] };
  onClose?: () => void;
}

const PhraseExplanationDialog = React.memo(
  (props: PhraseExplanationDialogProps) => {
    const { open, phrase, score, tags, terms, onClose } = props;

    const [configState] = useContext(ConfigContext);

    const breakdown = useMemo(() => {
      const subphrases = getSubphrases(phrase);
      const b: { [subphrase: string]: string[] } = {};
      subphrases.forEach((subphrase) => {
        const termTags = terms[subphrase];
        if (termTags) {
          const gameTags = configState?.projectTags;
          if (termTags.length > 0) {
            const officialGameTags = Object.values(gameTags)
              .flatMap((c) => c)
              .flatMap((g) => g)
              .map((t) => t.toLowerCase());
            const uniqueAssociatedTags = Array.from(
              new Set([
                ...termTags.filter((t) =>
                  officialGameTags.includes(t.toLowerCase())
                ),
                subphrase,
              ])
            );
            const includesTags = uniqueAssociatedTags.filter((t) =>
              tags.includes(t)
            );
            const excludesTags = uniqueAssociatedTags.filter(
              (t) => !tags.includes(t)
            );
            b[subphrase] = [...includesTags, ...excludesTags];
          }
        }
      });
      const includes = Object.entries(b).filter(([, associatedTags]) =>
        associatedTags.some((t) => tags.includes(t))
      );
      const excludes = Object.entries(b).filter(
        ([, associatedTags]) => !associatedTags.some((t) => tags.includes(t))
      );
      return [...includes, ...excludes];
    }, [configState?.projectTags, phrase, tags, terms]);

    const content = useMemo(
      () => (
        <StyledExplanationListArea>
          {breakdown.map(([subphrase, associatedTags]) => (
            <StyledExplanationItemArea key={subphrase}>
              <StyledSubphraseTypography>{`"${subphrase}"`}</StyledSubphraseTypography>
              {associatedTags && (
                <StyledTagsArea>
                  {associatedTags.map((tag, index) => {
                    const selected = tags?.includes(tag);
                    return (
                      <StyledTagTypography
                        key={tag}
                        style={{ fontWeight: selected ? 700 : undefined }}
                        variant="caption"
                      >
                        {capitalize(tag)}
                        {index < associatedTags.length - 1 && `, `}
                      </StyledTagTypography>
                    );
                  })}
                </StyledTagsArea>
              )}
            </StyledExplanationItemArea>
          ))}
        </StyledExplanationListArea>
      ),
      [breakdown, tags]
    );

    const actions = useMemo(
      () => (
        <StyledDialogButton onClick={onClose} color="primary">
          {`OK`}
        </StyledDialogButton>
      ),
      [onClose]
    );

    const tagCount = tags?.length || 0;

    const maxScore = useMemo(() => {
      let weight = 0;
      for (let index = 0; index < tagCount; index += 1) {
        const max = tagCount;
        weight += (max - index) / max;
      }
      return weight + 1;
    }, [tagCount]);

    return (
      <PhraseDialog
        open={open}
        onClose={onClose}
        title={phrase}
        subtitle={`(${Math.round(Math.min(1, score / maxScore) * 100)}% match)`}
        content={content}
        actions={actions}
      />
    );
  }
);

export default PhraseExplanationDialog;
