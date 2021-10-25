import styled from "@emotion/styled";
import dynamic from "next/dynamic";
import React, { useCallback } from "react";

const AudioPlayer = dynamic(() => import("./AudioPlayer"));

export type LoadEvent = React.SyntheticEvent<HTMLElement> & {
  target?: { offsetWidth?: number; offsetHeight?: number };
};

const StyledAudioPreviewArea = styled.div`
  flex: 1;
  display: flex;
  position: relative;
  align-items: center;
  background-color: inherit;
  transition: opacity 0.3s ease;
`;

interface AudioPreviewProps {
  src: string;
  waveform?: number[];
  style?: React.CSSProperties;
  innerStyle?: React.CSSProperties;
  onLoad?: (e: LoadEvent) => void;
  onWaveformReady?: (waveform: number[]) => void;
}

const AudioPreview = React.memo((props: AudioPreviewProps): JSX.Element => {
  const { src, waveform, style, innerStyle, onLoad, onWaveformReady } = props;

  const handleRef = useCallback(
    (instance: HTMLDivElement) => {
      if (instance) {
        const rect = instance.getBoundingClientRect();
        const event = {
          target: { offsetHeight: rect.height, offsetWidth: rect.width },
        } as LoadEvent;
        if (onLoad) {
          onLoad(event);
        }
      }
    },
    [onLoad]
  );

  return (
    <StyledAudioPreviewArea
      ref={handleRef}
      className={StyledAudioPreviewArea.displayName}
      key={src}
      style={style}
    >
      <AudioPlayer
        src={src}
        waveform={waveform}
        disableRegions
        style={innerStyle}
        onWaveformReady={onWaveformReady}
      />
    </StyledAudioPreviewArea>
  );
});

export default AudioPreview;
