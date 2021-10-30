import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import React, { useCallback, useContext } from "react";
import { ConfigContext, ConfigParameters } from "../../impower-config";
import ConfigCache from "../../impower-config/classes/configCache";
import format from "../../impower-config/utils/format";
import { escapeURI } from "../../impower-data-store";
import {
  NavigationContext,
  navigationSetSearchbar,
} from "../../impower-navigation";

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

const StyledSummaryArea = styled.div``;

const StyledTagsArea = styled.div`
  margin-left: ${(props): string => props.theme.spacing(-0.75)};
  margin-right: ${(props): string => props.theme.spacing(-0.75)};
  margin-top: ${(props): string => props.theme.spacing(1.5)};
  display: flex;
  flex-wrap: wrap;
`;

const StyledTagButton = styled(Button)`
  min-width: ${(props): string => props.theme.spacing(1)};
  color: black;
  padding: ${(props): string => props.theme.spacing(0.25, 0.75)};
  opacity: 0.7;
`;

const StyledMark = styled.mark`
  background-color: inherit;
  color: inherit;
`;

const StyledTitleTypography = styled(Typography)<{ component?: string }>``;

const StyledTagSkeleton = styled(Skeleton)`
  margin: ${(props): string => props.theme.spacing(0.25, 0.75)};
`;

const getTagLink = (tag: string): string => `/pitch/search/${escapeURI(tag)}`;

interface PitchCardContentProps {
  config: ConfigParameters;
  name?: string;
  summary?: string;
  tags?: string[];
  delisted?: boolean;
  archived?: boolean;
  titleRef?: React.Ref<HTMLDivElement>;
}

const PitchCardContent = React.memo(
  (props: PitchCardContentProps): JSX.Element => {
    const pitchedCollection = "pitched_games";

    const { config, name, summary, tags, delisted, archived, titleRef } = props;

    const [configState] = useContext(ConfigContext);
    const [, navigationDispatch] = useContext(NavigationContext);

    const handleBlockRipplePropogation = useCallback(
      (e: React.MouseEvent | React.TouchEvent): void => {
        e.stopPropagation();
      },
      []
    );

    const handleClickTag = useCallback(
      (e: React.MouseEvent): void => {
        e.stopPropagation();
        navigationDispatch(navigationSetSearchbar({ searching: true }));
      },
      [navigationDispatch]
    );

    const mainTag = tags?.[0] || "";
    const currentConfig = configState || config || ConfigCache.instance.params;
    const summaryPreamble = currentConfig?.messages
      ? `${format(currentConfig?.messages?.[`${pitchedCollection}_preamble`], {
          tag: mainTag,
        })}${summary?.[0]?.match(/[a-zA-Z]/) ? " " : ""}`
      : undefined;

    return (
      <StyledCardContent>
        {(archived || !delisted) && (
          <>
            <StyledTitleArea ref={titleRef}>
              <StyledTitleTypography variant="h6" component="h2">
                {name}
              </StyledTitleTypography>
            </StyledTitleArea>
            {summary !== "" && (
              <StyledSummaryArea>
                {summary === undefined ? (
                  <Skeleton variant="rectangular" height={96} />
                ) : (
                  <Typography variant="body1" component="p">
                    <StyledMark>{summaryPreamble}</StyledMark>
                    {summary}
                  </Typography>
                )}
              </StyledSummaryArea>
            )}
            <StyledTagsArea>
              {tags
                ? tags.map((tag) => (
                    <NextLink
                      key={tag}
                      href={getTagLink(tag)}
                      passHref
                      prefetch={false}
                    >
                      <StyledTagButton
                        size="small"
                        onMouseDown={handleBlockRipplePropogation}
                        onTouchStart={handleBlockRipplePropogation}
                        onClick={handleClickTag}
                      >
                        #{tag}
                      </StyledTagButton>
                    </NextLink>
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
