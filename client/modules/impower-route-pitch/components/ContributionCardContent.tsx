import styled from "@emotion/styled";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";
import React, { useCallback, useContext, useMemo, useState } from "react";
import TriangleExclamationSolidIcon from "../../../resources/icons/solid/triangle-exclamation.svg";
import { StorageFile } from "../../impower-core";
import { ContributionType } from "../../impower-data-store";
import { FontIcon } from "../../impower-icon";
import LazyImage from "../../impower-route/components/elements/LazyImage";
import Markdown from "../../impower-route/components/elements/Markdown";
import AspectRatioBox from "../../impower-route/components/inputs/AspectRatioBox";
import AudioPreview from "../../impower-route/components/inputs/AudioPreview";
import { getPlaceholderUrl } from "../../impower-storage";
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

const StyledNSFWOverlay = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: ${(props): string => props.theme.colors.black50};
  color: white;
`;

const StyledNSFWIconArea = styled.div`
  margin: ${(props): string => props.theme.spacing(1)};
`;
const StyledNSFWTypography = styled(Typography)`
  overflow-wrap: break-word;
  word-wrap: break-word;
  margin: ${(props): string => props.theme.spacing(0.5)};
  font-weight: 700;
`;

const StyledNSFWSubtitleTypography = styled(Typography)`
  overflow-wrap: break-word;
  word-wrap: break-word;
  margin: ${(props): string => props.theme.spacing(0.5)};
`;

interface ContributionCollapsedContentProps {
  contributionType?: ContributionType;
  prefix?: string;
  content?: string;
  file?: StorageFile;
  waveform?: number[];
  aspectRatio?: number;
  square?: boolean;
  crop?: number;
  preview?: boolean;
  nsfw?: boolean;
}

const ContributionCollapsedContent = React.memo(
  (props: ContributionCollapsedContentProps): JSX.Element => {
    const {
      contributionType,
      prefix,
      content,
      file,
      waveform,
      aspectRatio,
      square,
      crop,
      preview,
      nsfw,
    } = props;

    const [reveal, setReveal] = useState(false);

    const [userState] = useContext(UserContext);
    const { settings } = userState;
    const account = settings?.account;
    const nsfwBlurred =
      account === undefined
        ? undefined
        : account?.nsfwVisible && account?.nsfwBlurred !== undefined
        ? account?.nsfwBlurred
        : true;

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

    const handleClickNsfwOverlay = useCallback(() => {
      setReveal(true);
    }, []);

    const blurNSFW = nsfw && nsfw !== null && nsfwBlurred && !reveal;

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
                  blurNSFW || blurNSFW === undefined ? undefined : file?.fileUrl
                }
                placeholder={getPlaceholderUrl(file?.fileUrl)}
                pinchAndZoom
                style={imagePreviewStyle}
                innerStyle={previewInnerStyle}
              />
              {blurNSFW && (
                <StyledNSFWOverlay onClick={handleClickNsfwOverlay}>
                  <StyledNSFWIconArea>
                    <FontIcon aria-label={`NSFW`} size={48}>
                      <TriangleExclamationSolidIcon />
                    </FontIcon>
                  </StyledNSFWIconArea>
                  <StyledNSFWTypography variant="h4">{`NSFW`}</StyledNSFWTypography>
                  <StyledNSFWSubtitleTypography>{`sensitive content - tap to view`}</StyledNSFWSubtitleTypography>
                </StyledNSFWOverlay>
              )}
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
  nsfw?: boolean;
}

const ContributionCardContent = React.memo(
  (props: ContributionCardContentProps): JSX.Element => {
    const {
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
      nsfw,
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
              nsfw={nsfw}
            />
          </StyledOffset>
        </StyledContent>
      </StyledContributionCardContent>
    );
  }
);

export default ContributionCardContent;
