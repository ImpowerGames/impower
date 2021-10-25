import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { IconButton, LinearProgress, Typography } from "@material-ui/core";
import React, { useCallback, useRef, useState } from "react";
import CirclePauseSolidIcon from "../../../../resources/icons/solid/circle-pause.svg";
import CirclePlaySolidIcon from "../../../../resources/icons/solid/circle-play.svg";
import RotateSolidIcon from "../../../../resources/icons/solid/rotate.svg";
import { FontIcon } from "../../../impower-icon";

export const StyledAudioPlayer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  flex: 1;
  background-color: inherit;
`;

export const StyledWaveArea = styled.div`
  position: relative;
  flex: 1;
  background-color: inherit;
`;

export const StyledWave = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  transition: opacity 0.3s ease;
`;

export const StyledLoopOverlayArea = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  z-index: 10;
  display: flex;
  pointer-events: none;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  background-color: inherit;
  border-radius: 50%;
`;

export const StyledTimeOverlayArea = styled.div`
  position: absolute;
  bottom: 0;
  right: 0;
  z-index: 10;
  display: flex;
  pointer-events: none;
  flex-direction: row;
  align-items: flex-end;
  justify-content: space-between;
  background-color: inherit;
`;

export const StyledButtonArea = styled.div`
  display: flex;
  margin-right: ${(props): string => props.theme.spacing(1)};
`;

const StyledTypography = styled(Typography)`
  position: relative;
  margin-right: ${(props): string => props.theme.spacing(0.5)};
`;

const StyledLinearProgressArea = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: stretch;
`;

const StyledLinearProgress = styled(LinearProgress)`
  width: 100%;
  height: 2px;
`;

const getDisplayTime = (seconds: number): string => {
  if (!seconds) {
    return new Date(0).toISOString().slice(14, 19);
  }
  return new Date(1000 * seconds).toISOString().slice(14, 19);
};

const getTimeSummary = (current: number, duration: number): string => {
  return `${getDisplayTime(current)} / ${getDisplayTime(duration)}`;
};

interface AudioPlayerProps {
  src: string;
  waveform?: number[];
  disableRegions?: boolean;
  height?: number;
  barRadius?: number;
  barWidth?: number;
  cursorWidth?: number;
  barMinHeight?: number;
  minRegionLength?: number;
  waveColor?: string;
  progressColor?: string;
  cursorColor?: string;
  textColor?: string;
  style?: React.CSSProperties;
  onWaveformReady?: (waveform: number[]) => void;
}

const AudioPlayer = React.memo((props: AudioPlayerProps): JSX.Element => {
  const theme = useTheme();
  const {
    src,
    waveform,
    disableRegions,
    height = 64,
    barRadius = 2,
    barWidth = 2,
    barMinHeight = 1,
    cursorWidth = 0,
    minRegionLength = 2,
    waveColor = theme.palette.secondary.main,
    progressColor = theme.colors.selected,
    cursorColor = theme.palette.secondary.main,
    textColor = theme.palette.secondary.main,
    style,
    onWaveformReady,
  } = props;

  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(false);
  const [timeSummary, setTimeSummary] = useState(getTimeSummary(0, 0));

  const inRegion = useRef(false);
  const playingRegion = useRef(false);
  const loopingRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wavesurfer = useRef<any>();

  const handleRef = useCallback(
    async (container: HTMLDivElement): Promise<void> => {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      const RegionsPlugin = (
        await import("wavesurfer.js/dist/plugin/wavesurfer.regions")
      ).default;
      if (!container) {
        return;
      }
      if (wavesurfer.current) {
        wavesurfer.current.destroy();
      }
      const plugins = [];
      if (!disableRegions) {
        plugins.push(
          RegionsPlugin.create({
            dragSelection: true,
            minLength: minRegionLength,
          })
        );
      }
      wavesurfer.current = WaveSurfer.create({
        container,
        backend: "MediaElement",
        height,
        barRadius,
        barWidth,
        barMinHeight,
        cursorWidth,
        waveColor,
        progressColor,
        cursorColor,
        responsive: true,
        reflection: false,
        hideScrollbar: true,
        normalize: true,
        interact: true,
        plugins,
      });
      if (waveform && waveform.length > 0) {
        setVisible(true);
        if (onWaveformReady) {
          onWaveformReady(waveform);
        }
        wavesurfer.current.load(src, waveform);
      } else {
        wavesurfer.current.load(src);
      }
      const onReady = (): void => {
        setVisible(true);
        if (onWaveformReady) {
          const waveform: number[] = wavesurfer.current.backend.mergedPeaks;
          onWaveformReady(waveform.map((x) => x || 0));
        }
      };
      const onPlay = (): void => {
        setPlaying(true);
      };
      const onPause = (): void => {
        setPlaying(false);
      };
      const onAudioProcess = (): void => {
        setTimeSummary(
          getTimeSummary(
            wavesurfer.current?.getCurrentTime(),
            wavesurfer.current?.getDuration()
          )
        );
      };
      const onFinish = (): void => {
        if (loopingRef.current) {
          wavesurfer.current.play();
        }
      };
      const onSeek = (): void => {
        inRegion.current = false;
        playingRegion.current = false;
        const regions = wavesurfer.current.regions?.list;
        if (regions) {
          const keys = Object.keys(regions);
          const firstRegionKey = keys[0];
          if (firstRegionKey) {
            regions[firstRegionKey].remove();
          }
        }
      };
      const onRegionUpdated = (region): void => {
        if (disableRegions) {
          return;
        }
        const regions = region.wavesurfer.regions.list;
        const keys = Object.keys(regions);
        if (keys.length > 1) {
          regions[keys[0]].remove();
        }
        if (region.end - region.start < minRegionLength) {
          region.end = region.start + minRegionLength;
        }
        playingRegion.current = true;
        region.play();
      };
      const onRegionClick = (region, event: MouseEvent): void => {
        if (disableRegions) {
          return;
        }
        event.stopPropagation();
        playingRegion.current = true;
        region.play();
      };
      const onRegionDoubleClick = (region, event: MouseEvent): void => {
        if (disableRegions) {
          return;
        }
        event.stopPropagation();
        const regions = region.wavesurfer.regions.list;
        const keys = Object.keys(regions);
        if (keys.length > 0) {
          regions[keys[0]].remove();
        }
        inRegion.current = false;
        playingRegion.current = false;
      };
      const onRegionIn = (): void => {
        if (disableRegions) {
          return;
        }
        inRegion.current = true;
      };
      const onRegionOut = (region): void => {
        if (disableRegions) {
          return;
        }
        if (playingRegion.current && loopingRef.current) {
          region.play();
        } else {
          inRegion.current = false;
        }
      };
      wavesurfer.current.on("waveform-ready", onReady);
      wavesurfer.current.on("play", onPlay);
      wavesurfer.current.on("pause", onPause);
      wavesurfer.current.on("audioprocess", onAudioProcess);
      wavesurfer.current.on("finish", onFinish);
      wavesurfer.current.on("seek", onSeek);
      wavesurfer.current.on("region-update-end", onRegionUpdated);
      wavesurfer.current.on("region-click", onRegionClick);
      wavesurfer.current.on("region-dblclick", onRegionDoubleClick);
      wavesurfer.current.on("region-in", onRegionIn);
      wavesurfer.current.on("region-out", onRegionOut);
    },
    [
      barMinHeight,
      barRadius,
      barWidth,
      cursorColor,
      cursorWidth,
      disableRegions,
      height,
      minRegionLength,
      onWaveformReady,
      progressColor,
      src,
      waveColor,
      waveform,
    ]
  );

  const handleLoop = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();
      setLooping(!looping);
      loopingRef.current = !looping;
    },
    [looping]
  );

  const handlePlay = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();
      const shouldPlay = !playing;
      setPlaying(shouldPlay);
      wavesurfer.current.playPause();
      if (shouldPlay && !inRegion.current) {
        playingRegion.current = false;
      }
    },
    [playing]
  );

  return (
    <StyledAudioPlayer className={StyledAudioPlayer.displayName} style={style}>
      <StyledButtonArea className={StyledButtonArea.displayName}>
        <IconButton
          onClick={handlePlay}
          style={{
            padding: 0,
          }}
        >
          <FontIcon
            aria-label={playing ? "Pause" : "Play"}
            color={cursorColor}
            size={height - 24}
          >
            {playing ? <CirclePauseSolidIcon /> : <CirclePlaySolidIcon />}
          </FontIcon>
        </IconButton>
      </StyledButtonArea>
      <StyledWaveArea
        className={StyledWaveArea.displayName}
        style={{
          minHeight: height,
        }}
      >
        <StyledLinearProgressArea style={{ opacity: visible ? 0 : 1 }}>
          <StyledLinearProgress color="secondary" />
        </StyledLinearProgressArea>
        <StyledWave ref={handleRef} style={{ opacity: visible ? 1 : 0 }} />
        <StyledTimeOverlayArea style={{ opacity: 0.5 }}>
          <StyledTypography
            className={StyledTypography.displayName}
            variant="caption"
            style={{
              color: textColor,
              padding: theme.spacing(0, 0.5),
            }}
          >
            {timeSummary}
          </StyledTypography>
          <IconButton
            onClick={handleLoop}
            style={{
              padding: theme.spacing(0.75),
              margin: theme.spacing(-0.75),
              backgroundColor: looping ? theme.colors.black90 : undefined,
            }}
          >
            <FontIcon
              aria-label="Loop"
              color={looping ? theme.colors.white90 : cursorColor}
              size={theme.fontSize.regular}
            >
              <RotateSolidIcon />
            </FontIcon>
          </IconButton>
        </StyledTimeOverlayArea>
        <StyledTimeOverlayArea style={{ backgroundColor: "transparent" }}>
          <StyledTypography
            className={StyledTypography.displayName}
            variant="caption"
            style={{
              color: textColor,
              padding: theme.spacing(0, 0.5),
            }}
          >
            {timeSummary}
          </StyledTypography>
          <FontIcon
            aria-label="Loop"
            color={looping ? theme.colors.white90 : cursorColor}
            size={theme.fontSize.regular}
          >
            <RotateSolidIcon />
          </FontIcon>
        </StyledTimeOverlayArea>
      </StyledWaveArea>
    </StyledAudioPlayer>
  );
});

export default AudioPlayer;
