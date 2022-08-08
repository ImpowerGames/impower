import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import MobileStepper from "@material-ui/core/MobileStepper";
import { CSSProperties, useCallback, useEffect, useState } from "react";
import AngleLeftRegularIcon from "../../../../resources/icons/regular/angle-left.svg";
import AngleRightRegularIcon from "../../../../resources/icons/regular/angle-right.svg";
import { FontIcon } from "../../../impower-icon";
import FadeAnimation from "../animations/FadeAnimation";

const StyledSlideshow = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background-color: black;
`;

const StyledImageArea = styled.div`
  position: relative;
`;

const StyledImageContent = styled(FadeAnimation)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;

const StyledIconButton = styled(IconButton)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;

const StyledImage = styled.img`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100%;
`;

const StyledButton = styled(Button)``;

interface SlideshowProps {
  index?: number;
  images: string[];
  placeholders?: { [originalSrc: string]: string };
  backLabel?: string;
  nextLabel?: string;
  transitionDuration?: number;
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  imageStyle?: CSSProperties;
  style?: CSSProperties;
  onSetIndex?: (index: number) => void;
}

export const Slideshow = (props: SlideshowProps): JSX.Element => {
  const {
    index,
    images,
    placeholders,
    backLabel,
    nextLabel,
    transitionDuration = 0.3,
    objectFit = "contain",
    imageStyle,
    style,
    onSetIndex,
  } = props;

  const [indexState, setIndexState] = useState(index);
  const [loadedPlaceholders, setLoadedPlaceholders] = useState<string[]>([]);
  const [loadedImages, setLoadedImages] = useState<string[]>([]);

  useEffect(() => {
    setIndexState(index);
  }, [index]);

  const handlePrevious = useCallback(() => {
    const newIndex = indexState - 1;
    setIndexState(newIndex);
    onSetIndex(newIndex);
  }, [indexState, onSetIndex]);

  const handleNext = useCallback(() => {
    const newIndex = indexState + 1;
    setIndexState(newIndex);
    onSetIndex(newIndex);
  }, [indexState, onSetIndex]);

  const handleNextImage = useCallback((): void => {
    const newIndex =
      indexState < (images?.length || 0) - 1 ? indexState + 1 : 0;
    setIndexState(newIndex);
    onSetIndex(newIndex);
  }, [indexState, images?.length, onSetIndex]);

  const handleLoadPlaceholder = useCallback(
    (src: string) => {
      if (!loadedPlaceholders.includes(src)) {
        setLoadedPlaceholders([...loadedPlaceholders, src]);
      }
    },
    [loadedPlaceholders]
  );

  const handleLoadImage = useCallback(
    (src: string) => {
      if (!loadedImages.includes(src)) {
        setLoadedImages([...loadedImages, src]);
      }
    },
    [loadedImages]
  );

  const currentImage = images[indexState];
  const currentPlaceholder = placeholders[currentImage];

  return (
    <StyledSlideshow style={style}>
      <StyledImageArea
        style={{
          ...imageStyle,
        }}
      >
        <StyledIconButton
          style={{
            borderRadius: 0,
            width: "100%",
          }}
          onClick={handleNextImage}
        >
          {Object.values(placeholders).map((placeholder) => (
            <StyledImageContent
              key={placeholder}
              initial={0}
              animate={currentPlaceholder === placeholder ? 1 : 0}
              ease="ease-in-out"
              duration={transitionDuration}
              aria-hidden="true"
            >
              <StyledImage
                src={placeholder}
                onLoad={(): void => handleLoadPlaceholder(placeholder)}
                style={{ objectFit }}
              />
            </StyledImageContent>
          ))}
          {images.map((image) => (
            <StyledImageContent
              key={image}
              initial={0}
              animate={
                loadedImages.includes(currentImage) && currentImage === image
                  ? 1
                  : 0
              }
              ease="ease-in-out"
              duration={transitionDuration}
              aria-hidden={currentImage === image ? "true" : undefined}
            >
              <StyledImage
                src={image}
                onLoad={(): void => handleLoadImage(image)}
                style={{ objectFit }}
              />
            </StyledImageContent>
          ))}
        </StyledIconButton>
      </StyledImageArea>
      <MobileStepper
        steps={images.length}
        position="static"
        variant="text"
        activeStep={indexState}
        backButton={
          <StyledButton disabled={indexState === 0} onClick={handlePrevious}>
            <FontIcon aria-label="Next" size={16}>
              <AngleLeftRegularIcon />
            </FontIcon>
            {backLabel}
          </StyledButton>
        }
        nextButton={
          <StyledButton
            disabled={indexState === images.length - 1}
            onClick={handleNext}
          >
            {nextLabel}
            <FontIcon aria-label="Next" size={16}>
              <AngleRightRegularIcon />
            </FontIcon>
          </StyledButton>
        }
      />
    </StyledSlideshow>
  );
};

export default Slideshow;
