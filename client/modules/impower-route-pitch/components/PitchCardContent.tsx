import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";
import dynamic from "next/dynamic";
import React, { useCallback, useContext } from "react";
import format from "../../impower-config/utils/format";
import {
  escapeURI,
  ProjectDocument,
  ProjectDocumentInspector,
} from "../../impower-data-store";
import {
  NavigationContext,
  navigationSetSearchbar,
} from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";

const Skeleton = dynamic(() => import("@material-ui/core/Skeleton"), {
  ssr: false,
});

const StyledCardContent = styled(CardContent)`
  pointer-events: auto;
  padding: ${(props): string => props.theme.spacing(2, 3, 0.5, 3)};
`;

const StyledTitleArea = styled.div`
  margin-bottom: ${(props): string => props.theme.spacing(1.5)};
`;

const StyledSummaryArea = styled.div`
  margin-bottom: ${(props): string => props.theme.spacing(1.5)};
`;

const StyledTagsArea = styled.div`
  margin-left: ${(props): string => props.theme.spacing(-0.75)};
  margin-right: ${(props): string => props.theme.spacing(-0.75)};
  display: flex;
  flex-wrap: wrap;
`;

const StyledTagButton = styled(Button)`
  min-width: ${(props): string => props.theme.spacing(1)};
  color: black;
  padding: ${(props): string => props.theme.spacing(0.25, 0.75)};
  opacity: 0.7;
`;

const StyledTitleTypography = styled(Typography)<{ component?: string }>``;

const StyledTagSkeleton = styled(Skeleton)`
  margin: ${(props): string => props.theme.spacing(0.25, 0.75)};
`;

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

interface PitchCardContentProps {
  pitchDoc?: ProjectDocument;
  name?: string;
  summary?: string;
  tags?: string[];
  delisted?: boolean;
  archived?: boolean;
  titleRef?: React.Ref<HTMLDivElement>;
}

const PitchCardContent = React.memo(
  (props: PitchCardContentProps): JSX.Element => {
    const { pitchDoc, name, summary, tags, delisted, archived, titleRef } =
      props;

    const [, navigationDispatch] = useContext(NavigationContext);

    const handleBlockRipplePropogation = useCallback(
      (e: React.MouseEvent | React.TouchEvent): void => {
        e.stopPropagation();
      },
      []
    );

    const handleClickTag = useCallback(
      async (e: React.MouseEvent, tag: string): Promise<void> => {
        e.stopPropagation();
        const link = getTagLink(tag);
        if (window.location.pathname.endsWith(link)) {
          return;
        }
        navigationDispatch(navigationSetTransitioning(true));
        navigationDispatch(navigationSetSearchbar({ searching: true }));
        const router = (await import("next/router")).default;
        await router.push(link);
      },
      [navigationDispatch]
    );

    const mainTag = tags?.[0] || "";
    const spacer = summary?.[0]?.match(/[a-zA-Z]/) ? " " : "";
    const formattedContent =
      pitchDoc?.projectType === "voice" ? `"${summary}"` : summary;
    const formattedSummary = `${format(
      ProjectDocumentInspector.instance.getPropertyPlaceholder(
        "summary",
        pitchDoc
      ),
      {
        tag: mainTag,
      }
    )}${spacer}${formattedContent}`;
    return (
      <StyledCardContent>
        {(archived || !delisted) && (
          <>
            {name && (
              <StyledTitleArea ref={titleRef}>
                <StyledTitleTypography variant="h6" component="h2">
                  {name}
                </StyledTitleTypography>
              </StyledTitleArea>
            )}
            {summary !== "" && (
              <StyledSummaryArea>
                {summary === undefined ? (
                  <Skeleton variant="rectangular" height={96} />
                ) : (
                  <Typography variant="body1" component="p">
                    {formattedSummary}
                  </Typography>
                )}
              </StyledSummaryArea>
            )}
            <StyledTagsArea>
              {tags
                ? tags.map((tag) => (
                    <StyledTagButton
                      key={tag}
                      size="small"
                      onMouseDown={handleBlockRipplePropogation}
                      onTouchStart={handleBlockRipplePropogation}
                      onClick={(e): void => {
                        handleClickTag(e, tag);
                      }}
                    >
                      #{tag}
                    </StyledTagButton>
                  ))
                : Array(5)
                    .fill(0)
                    .map((_, i) => i)
                    .map((value) => (
                      <StyledTagSkeleton
                        variant="text"
                        key={value}
                        width={80}
                        height={24}
                      />
                    ))}
            </StyledTagsArea>
          </>
        )}
      </StyledCardContent>
    );
  }
);
export default PitchCardContent;
