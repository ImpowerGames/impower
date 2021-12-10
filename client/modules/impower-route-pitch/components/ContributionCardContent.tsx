import styled from "@emotion/styled";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";
import React, { useContext, useMemo } from "react";
import { StorageFile } from "../../impower-core";
import { ContributionType } from "../../impower-data-store";
import LazyImage from "../../impower-route/components/elements/LazyImage";
import Markdown from "../../impower-route/components/elements/Markdown";
import AspectRatioBox from "../../impower-route/components/inputs/AspectRatioBox";
import AudioPreview from "../../impower-route/components/inputs/AudioPreview";
import { getPlaceholderUrl, getSfwUrl } from "../../impower-storage";
import { UserContext } from "../../impower-user";
import { getPreviewAspectRatio } from "../utils/getPreviewAspectRatio";
import { getPreviewInnerStyle } from "../utils/getPreviewInnerStyle";

const StyledContributionCardContent = styled(CardContent)`
  padding: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  position: relative;
  margin-top: ${(props): string => props.theme.spacing(-1)};
`;

const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  will-change: transform;
`;

const StyledOffset = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  will-change: transform;
`;

const StyledFileContent = styled.div`
  position: relative;
`;

const StyledTextContent = styled.div`
  padding: ${(props): string => props.theme.spacing(0, 3)};
  margin-top: ${(props): string => props.theme.spacing(-1)};
`;

const StyledTypography = styled(Typography)`
  margin: ${(props): string => props.theme.spacing(2, 0)};
  overflow-wrap: break-word;
  word-wrap: break-word;
`;

const StyledPrefixMark = styled.mark`
  color: ${(props): string => props.theme.palette.primary.dark};
  background-color: transparent;
  font-weight: 600;
`;

interface ContributionCollapsedContentProps {
  createdBy?: string;
  contributionType?: ContributionType;
  prefix?: string;
  content?: string;
  file?: StorageFile;
  waveform?: number[];
  aspectRatio?: number;
  square?: boolean;
  crop?: number;
  preview?: boolean;
}

const ContributionCollapsedContent = React.memo(
  (props: ContributionCollapsedContentProps): JSX.Element => {
    const {
      createdBy,
      contributionType,
      prefix,
      content,
      file,
      waveform,
      aspectRatio,
      square,
      crop,
      preview,
    } = props;

    const [userState] = useContext(UserContext);
    const { uid } = userState;

    const previewAspectRatio = getPreviewAspectRatio(aspectRatio, square);
    const positionHorizontally = aspectRatio > previewAspectRatio;
    const contentAspectRatio =
      positionHorizontally || preview ? previewAspectRatio : aspectRatio;
    const imagePreviewStyle: React.CSSProperties = useMemo(
      () => ({ height: "100%" }),
      []
    );
    const aspectRatioInnerStyle: React.CSSProperties = useMemo(
      () => (positionHorizontally ? { height: "100%" } : {}),
      [positionHorizontally]
    );
    const previewInnerStyle: React.CSSProperties = useMemo(
      () => getPreviewInnerStyle(aspectRatio, square, crop),
      [aspectRatio, crop, square]
    );
    // Don't allow displaying images with markdown because they can't be moderated.
    const overrides = useMemo(
      () => ({
        img: {
          component: "div" as React.ElementType,
          props: {},
        },
      }),
      []
    );

    return (
      <>
        {file?.fileUrl && file?.fileType === "image/*" && (
          <StyledFileContent>
            <AspectRatioBox
              aspectRatio={contentAspectRatio}
              innerStyle={aspectRatioInnerStyle}
            >
              <LazyImage
                aria-label={`Contribution`}
                src={
                  createdBy === uid ? file?.fileUrl : getSfwUrl(file?.fileUrl)
                }
                placeholder={getPlaceholderUrl(file?.fileUrl)}
                pinchAndZoom
                style={imagePreviewStyle}
                innerStyle={previewInnerStyle}
              />
            </AspectRatioBox>
          </StyledFileContent>
        )}
        {file?.fileUrl && file?.fileType === "audio/*" && (
          <StyledFileContent>
            <AudioPreview src={file?.fileUrl} waveform={waveform} />
          </StyledFileContent>
        )}
        {content && (
          <StyledTextContent>
            {contributionType === "story" ? (
              <Markdown overrides={overrides}>{content}</Markdown>
            ) : contributionType === "pitch" ? (
              <>
                <StyledTypography>
                  <StyledPrefixMark>{prefix}</StyledPrefixMark>
                  {content}
                </StyledTypography>
              </>
            ) : (
              <StyledTypography>{content}</StyledTypography>
            )}
          </StyledTextContent>
        )}
      </>
    );
  }
);

interface ContributionCardContentProps {
  createdBy?: string;
  contributionType?: ContributionType;
  contentRef?: React.Ref<HTMLDivElement>;
  prefix?: string;
  content?: string;
  file?: StorageFile;
  waveform?: number[];
  aspectRatio?: number;
  square?: boolean;
  crop?: number;
  preview?: boolean;
}

const ContributionCardContent = React.memo(
  (props: ContributionCardContentProps): JSX.Element => {
    const {
      createdBy,
      contributionType,
      contentRef,
      prefix,
      content,
      file,
      waveform,
      aspectRatio,
      square,
      crop,
      preview,
    } = props;

    return (
      <StyledContributionCardContent>
        <StyledContent ref={contentRef}>
          <StyledOffset>
            <ContributionCollapsedContent
              contributionType={contributionType}
              prefix={prefix}
              content={content}
              file={file}
              waveform={waveform}
              aspectRatio={aspectRatio}
              square={square}
              crop={crop}
              preview={preview}
              createdBy={createdBy}
            />
          </StyledOffset>
        </StyledContent>
      </StyledContributionCardContent>
    );
  }
);

export default ContributionCardContent;
