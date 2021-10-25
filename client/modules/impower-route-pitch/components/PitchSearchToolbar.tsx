import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import React, { useCallback, useMemo } from "react";
import { getSearchedTerms } from "../../impower-data-store";
import FadeAnimation from "../../impower-route/components/animations/FadeAnimation";
import PitchToolbar from "./PitchToolbar";

const StyledToolbarContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
`;

const StyledSearchContent = styled.div`
  padding-bottom: ${(props): string => props.theme.spacing(1)};
  padding-left: ${(props): string => props.theme.spacing(1)};
  padding-right: ${(props): string => props.theme.spacing(1)};
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
`;

const StyledTextArea = styled.div`
  padding: ${(props): string => props.theme.spacing(0, 1)};
  flex: 2;
  min-width: 0;
  overflow: hidden;
  text-transform: uppercase;
  max-width: 100%;
`;

const StyledLeftButtonArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(2)};
  flex: 1;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    display: none;
  }
`;

const StyledRightButtonArea = styled(FadeAnimation)`
  padding-left: ${(props): string => props.theme.spacing(2)};
  flex: 1;
  display: flex;
  justify-content: flex-end;
`;

const StyledTypography = styled(Typography)`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  text-align: center;
  ${(props): string => props.theme.breakpoints.down("sm")} {
    text-align: left;
  }
`;

const StyledButton = styled(Button)`
  min-width: 112px;
`;

interface PitchSearchToolbarProps {
  contentRef?: React.Ref<HTMLDivElement>;
  following?: boolean;
  search?: string;
  onFollow?: (e: React.MouseEvent, followed: boolean) => void;
}

const PitchSearchToolbar = React.memo(
  (props: PitchSearchToolbarProps): JSX.Element => {
    const { contentRef, following, search, onFollow } = props;
    const searchSummary = useMemo(
      () =>
        search
          ? getSearchedTerms(search)
              .map((t) => `#${t}`)
              .join(" ")
          : undefined,
      [search]
    );
    const handleFollow = useCallback(
      (e: React.MouseEvent) => {
        if (onFollow) {
          onFollow(e, !following);
        }
      },
      [following, onFollow]
    );

    const showFollowButton = following !== undefined && search;
    const followButtonStyle = useMemo(
      () => ({
        opacity: following ? 0.7 : undefined,
      }),
      [following]
    );

    return (
      <PitchToolbar>
        <StyledToolbarContent ref={contentRef}>
          <StyledSearchContent>
            <StyledLeftButtonArea />
            <StyledTextArea>
              <StyledTypography variant="h5">{searchSummary}</StyledTypography>
            </StyledTextArea>
            <StyledRightButtonArea
              initial={showFollowButton ? 1 : 0}
              animate={showFollowButton ? 1 : 0}
            >
              <StyledButton
                disableElevation
                onClick={handleFollow}
                variant={following ? "outlined" : "contained"}
                color={following ? "inherit" : "secondary"}
                style={followButtonStyle}
              >
                {following ? `Unfollow` : `Follow`}
              </StyledButton>
            </StyledRightButtonArea>
          </StyledSearchContent>
        </StyledToolbarContent>
      </PitchToolbar>
    );
  }
);

export default PitchSearchToolbar;
