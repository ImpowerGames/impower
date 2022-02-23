import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { Container, Paper } from "@material-ui/core";
import { useSpring } from "framer-motion";
import React, {
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import EyeRegularIcon from "../../../../resources/icons/regular/eye.svg";
import GearRegularIcon from "../../../../resources/icons/regular/gear.svg";
import XmarkSolidIcon from "../../../../resources/icons/solid/xmark.svg";
import { StorageFile } from "../../../impower-core";
import { layout } from "../../../impower-route";
import FilePreview from "../../../impower-route/components/inputs/FilePreview";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import EngineToolbar from "../headers/EngineToolbar";
import SplitPane from "../layouts/SplitPane";

const StyledEditFileDocumentForm = styled(Paper)`
  position: relative;
  flex: 1;
  display: flex;
  box-shadow: none;
  border-radius: 0;
`;

const StyledContainer = styled(Container)`
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
  max-width: 100%;
  ${(props): string => props.theme.breakpoints.down("md")} {
    height: 100%;
  }
`;

const StyledForegroundArea = styled.div`
  flex: 2;
  display: flex;
  flex-direction: column;
  max-width: 100%;
`;

const StyledContentArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
`;

const StyledPane = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow: hidden;
`;

const StyledSplitArea = styled.div`
  position: relative;
  flex: 1;
`;

const StyledSplitPane = styled(SplitPane)`
  .Resizer {
    z-index: 100;
    box-sizing: border-box;
    background-clip: padding-box;
    background-color: ${(props): string => props.theme.colors.white00};
    transition: all 0.2s ease;
    border-radius: 8px;
    position: relative;
  }

  .Resizer.vertical:after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 8px;
    right: 7px;
    background-color: ${(props): string => props.theme.colors.white30};
  }

  .Resizer.horizontal:after {
    content: "";
    position: absolute;
    top: 8px;
    bottom: 7px;
    left: 0;
    right: 0;
    background-color: ${(props): string => props.theme.colors.white30};
  }

  @media (hover: hover) and (pointer: fine) {
    .Resizer:hover {
      transition: all 0.2s ease;
    }
  }

  .Resizer.horizontal {
    height: 16px;
    margin: -8px 0;
    cursor: row-resize;
    width: 100%;
  }

  @media (hover: hover) and (pointer: fine) {
    .Resizer.horizontal:hover {
      background-color: ${(props): string => props.theme.colors.white30};
    }
  }

  .Resizer.vertical {
    z-index: 100;
    width: 16px;
    margin: 0 -8px;
    cursor: col-resize;
  }

  .Resizer.vertical:hover {
    background-color: ${(props): string => props.theme.colors.white30};
  }
  .Resizer.disabled {
    cursor: auto;
    visibility: hidden;
  }

  @media (hover: hover) and (pointer: fine) {
    .Resizer.disabled:hover {
      border-color: transparent;
    }
  }
`;

interface EditFileFormProps {
  name?: string;
  value: StorageFile;
  style?: React.CSSProperties;
  configurable?: boolean;
  onClose?: () => void;
}

const FilePreviewOverlay = React.memo(
  (props: PropsWithChildren<EditFileFormProps>): JSX.Element | null => {
    const { name, value, style, children, configurable, onClose } = props;

    const { portrait } = useContext(WindowTransitionContext);
    const [configuring, setConfiguring] = useState(false);
    const firstPaneRef = useRef<HTMLDivElement>();
    const contentRef = useRef<HTMLDivElement>();

    const splitPercentageSpring = useSpring(100, {
      stiffness: 600,
      damping: 1000,
    });

    const theme = useTheme();

    const stickyStyle = useMemo(
      () => ({
        position: "absolute",
        zIndex: 2,
        boxShadow: theme.shadows[3],
      }),
      [theme]
    );

    const headerStyle: React.CSSProperties = {
      color: theme.colors.darkHeaderText,
      paddingTop: theme.spacing(2),
      paddingBottom: theme.spacing(1),
    };
    const leftStyle = {
      minWidth: theme.spacing(theme.space.panelLeft),
    };
    const rightStyle = {
      minWidth: 0,
    };
    const backButtonStyle = {
      minWidth: theme.spacing(theme.space.panelLeft),
    };
    const searchButtonStyle = {
      opacity: 1,
    };
    const moreButtonStyle = {
      opacity: 1,
    };

    const handleMore = useCallback(() => {
      const newConfiguring = !configuring;
      setConfiguring(newConfiguring);
      const configurePercentage = portrait ? 20 : 50;
      splitPercentageSpring.set(newConfiguring ? configurePercentage : 100);
    }, [configuring, portrait, splitPercentageSpring]);

    const handleSplitChange = useCallback(
      (newSize: number) => {
        const pane = firstPaneRef.current?.parentElement;
        const splitPane = pane?.parentElement;
        const splitPaneParent = splitPane?.parentElement;
        const splitPaneParentParent = splitPaneParent?.parentElement;
        if (splitPaneParent && splitPaneParentParent) {
          const parentSize = portrait
            ? splitPaneParentParent.offsetHeight
            : splitPaneParentParent.offsetWidth;
          const percentage = (newSize / parentSize) * 100;
          splitPercentageSpring.set(percentage, false);
        }
      },
      [portrait, splitPercentageSpring]
    );

    useEffect(() => {
      const unsubscribe = splitPercentageSpring.onChange((v: number) => {
        if (portrait) {
          firstPaneRef.current.parentElement.style.height = `${v}%`;
        } else {
          firstPaneRef.current.parentElement.style.width = `${v}%`;
        }
      });
      return (): void => {
        unsubscribe();
      };
    }, [portrait, splitPercentageSpring]);

    const minPaneWidth = layout.size.minWidth.panel;
    const minPaneHeight = 8 * 8;

    if (!value) {
      return null;
    }

    return (
      <StyledEditFileDocumentForm
        ref={contentRef}
        style={{ backgroundColor: "black", color: "white", ...style }}
      >
        <StyledForegroundArea>
          <StyledContentArea style={{ overflow: "hidden" }}>
            <StyledContainer>
              <EngineToolbar
                type="default"
                title={name || value?.fileName}
                minHeight={layout.size.minWidth.headerIcon}
                moreIcon={
                  configuring ? <EyeRegularIcon /> : <GearRegularIcon />
                }
                backIcon={<XmarkSolidIcon />}
                backLabel={`Close`}
                moreLabel={configuring ? `Preview` : `Configuration`}
                headerStyle={headerStyle}
                leftStyle={leftStyle}
                rightStyle={rightStyle}
                backButtonStyle={backButtonStyle}
                searchButtonStyle={searchButtonStyle}
                moreButtonStyle={moreButtonStyle}
                stickyStyle={stickyStyle}
                sticky="always"
                onBack={onClose}
                onMore={configurable ? handleMore : undefined}
                style={style}
              />
              <StyledSplitArea>
                <StyledSplitPane
                  key={portrait?.toString()}
                  split={portrait ? "horizontal" : "vertical"}
                  defaultSize="100%"
                  minSize={
                    configuring ? (portrait ? minPaneHeight : minPaneWidth) : 0
                  }
                  maxSize={
                    configuring
                      ? portrait
                        ? -minPaneHeight
                        : -minPaneWidth
                      : -0.01
                  }
                  allowResize={configuring}
                  onChange={handleSplitChange}
                >
                  <StyledPane ref={firstPaneRef}>
                    <FilePreview value={value} absolute zoomPan />
                  </StyledPane>
                  <StyledPane>{children}</StyledPane>
                </StyledSplitPane>
              </StyledSplitArea>
            </StyledContainer>
          </StyledContentArea>
        </StyledForegroundArea>
      </StyledEditFileDocumentForm>
    );
  }
);

export default FilePreviewOverlay;
