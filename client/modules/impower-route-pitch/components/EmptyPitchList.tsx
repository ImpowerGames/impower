import styled from "@emotion/styled";
import Typography from "@material-ui/core/Typography";
import React from "react";
import AnimatedLoadingMascotIllustration from "../../impower-route/components/illustrations/AnimatedLoadingMascotIllustration";

const StyledMark = styled.mark`
  background-color: transparent;
  color: inherit;
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  min-width: 0;
  max-width: 100%;
`;

const StyledLabelTypography = styled(Typography)`
  max-width: 100%;
`;

const StyledCaptionTypography = styled(Typography)`
  white-space: nowrap;
  padding: ${(props): string => props.theme.spacing(0, 0.25)};
  font-weight: 600;
`;

const StyledCaptionArea = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
`;

interface EmptyPitchListTextProps {
  filterLabel?: string;
  searchLabel?: string;
  emptySubtitle1?: string;
  emptySubtitle2?: string;
  emptyLabelStyle?: React.CSSProperties;
  searchLabelStyle?: React.CSSProperties;
}

const EmptyPitchListText = React.memo(
  (props: EmptyPitchListTextProps): JSX.Element => {
    const {
      filterLabel,
      searchLabel,
      emptySubtitle1,
      emptySubtitle2,
      emptyLabelStyle,
      searchLabelStyle,
    } = props;

    return (
      <>
        <StyledLabelTypography
          variant="h6"
          color="textSecondary"
          style={emptyLabelStyle}
        >
          {`That's all the ${filterLabel} for `}
          <StyledMark style={searchLabelStyle}>{searchLabel}</StyledMark>
        </StyledLabelTypography>
        {(emptySubtitle1 || emptySubtitle2) && (
          <StyledCaptionArea>
            {emptySubtitle1 && (
              <StyledCaptionTypography variant="body1" color="textSecondary">
                {emptySubtitle1}
              </StyledCaptionTypography>
            )}
            {emptySubtitle2 && (
              <StyledCaptionTypography variant="body1" color="textSecondary">
                {emptySubtitle2}
              </StyledCaptionTypography>
            )}
          </StyledCaptionArea>
        )}
      </>
    );
  }
);

interface EmptyPitchListProps {
  filterLabel?: string;
  searchLabel?: string;
  emptySubtitle1?: string;
  emptySubtitle2?: string;
  emptyLabelStyle?: React.CSSProperties;
  searchLabelStyle?: React.CSSProperties;
  loading?: boolean;
  loadedImage?: React.ReactNode;
  loadingMessage?: string;
}

const EmptyPitchList = React.memo((props: EmptyPitchListProps): JSX.Element => {
  const {
    filterLabel,
    searchLabel,
    emptySubtitle1,
    emptySubtitle2,
    emptyLabelStyle,
    searchLabelStyle,
    loading,
    loadedImage,
    loadingMessage,
  } = props;

  return (
    <AnimatedLoadingMascotIllustration
      loading={loading}
      loadedImage={loadedImage}
      loadingMessage={loadingMessage}
      loadedMessage={
        <EmptyPitchListText
          filterLabel={filterLabel}
          searchLabel={searchLabel}
          emptySubtitle1={emptySubtitle1}
          emptySubtitle2={emptySubtitle2}
          emptyLabelStyle={emptyLabelStyle}
          searchLabelStyle={searchLabelStyle}
        />
      }
    />
  );
});

export default EmptyPitchList;
