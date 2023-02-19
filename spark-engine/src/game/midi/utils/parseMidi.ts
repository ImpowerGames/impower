/*!
 * Based on midi-json-parser-worker <https://github.com/chrisguttandin/midi-json-parser-worker>
 *
 * Copyright (c) 2023 Christoph Guttandin
 * Released under the MIT license.
 */

import {
  IMidiSystemExclusiveEvent,
  IMidiSystemMetaChannelPrefixEvent,
  IMidiSystemMetaCopyrightEvent,
  IMidiSystemMetaCueEvent,
  IMidiSystemMetaDeviceNameEvent,
  IMidiSystemMetaInstrumentNameEvent,
  IMidiSystemMetaKeySignatureEvent,
  IMidiSystemMetaLyricEvent,
  IMidiSystemMetaMarkerEvent,
  IMidiSystemMetaPortEvent,
  IMidiSystemMetaProgramNameEvent,
  IMidiSystemMetaSequencerSpecificEvent,
  IMidiSystemMetaSmpteOffsetEvent,
  IMidiSystemMetaTempoEvent,
  IMidiSystemMetaTextEvent,
  IMidiSystemMetaTimeSignatureEvent,
  IMidiSystemMetaTrackEndEvent,
  IMidiSystemMetaTrackNameEvent,
  IMidiVoiceControlEvent,
  IMidiVoiceNoteOffEvent,
  IMidiVoiceNoteOnEvent,
  IMidiVoicePitchBendEvent,
  IMidiVoicePolyphonicEvent,
  IMidiVoicePressureEvent,
  IMidiVoiceProgramEvent,
  MidiEvent,
  MidiStatusChannel,
  MidiStatusSystemExclusiveType,
  MidiStatusSystemMetaType,
  MidiStatusVoiceType,
  MidiSystemExclusiveEvent,
  MidiSystemMetaEvent,
  MidiVoiceEvent,
} from "../types/MidiEvent";
import { hexify, hexifyNumber } from "./hexify";
import { isMidiVoiceEvent } from "./isMidiVoiceEvent";
import { stringify } from "./stringify";

export const parseMidi = (arrayBuffer: ArrayBuffer) => {
  const dataView = new DataView(arrayBuffer);

  const header = _parseHeaderChunk(dataView);

  const tracks = [];
  let offset = 14;
  for (let i = 0; i < header.numberOfTracks; i += 1) {
    let track;
    ({ offset, track } = _parseTrackChunk(dataView, offset));
    tracks.push(track);
  }

  return {
    format: header.format,
    tpq: header.tpq,
    tracks,
  };
};

const _parseHeaderChunk = (dataView: DataView) => {
  if (dataView.byteLength < 14) {
    throw new Error(
      `Expected at least 14 bytes instead of ${dataView.byteLength}`
    );
  }

  if (stringify(dataView, 0, 4) !== "MThd") {
    throw new Error(
      `Unexpected characters "${stringify(
        dataView,
        0,
        4
      )}" found instead of "MThd"`
    );
  }

  if (dataView.getUint32(4) !== 6) {
    throw new Error(
      `The header has an unexpected length of ${dataView.getUint32(
        4
      )} instead of 6`
    );
  }

  const format = dataView.getUint16(8);
  const numberOfTracks = dataView.getUint16(10);
  const tpq = dataView.getUint16(12);

  return {
    format,
    numberOfTracks,
    tpq: tpq,
  };
};

const _parseTrackChunk = (dataView: DataView, offset: number) => {
  if (stringify(dataView, offset, 4) !== "MTrk") {
    throw new Error(
      `Unexpected characters "${stringify(
        dataView,
        offset,
        4
      )}" found instead of "MTrk"`
    );
  }

  const events = [];
  const length = dataView.getUint32(offset + 4) + offset + 8;

  let lastStatusByte: null | number = null;
  let nextOffset = offset + 8;

  while (nextOffset < length) {
    const result = _parseEvent(dataView, nextOffset, lastStatusByte);
    const { event, statusByte } = result;
    events.push(event);
    nextOffset = result.offset;
    if (isMidiVoiceEvent(event) && (statusByte & 0x80) > 0) {
      lastStatusByte = statusByte;
    }
  }

  return {
    offset: nextOffset,
    track: events,
  };
};

const _readVariableLengthQuantity = (dataView: DataView, offset: number) => {
  let nextOffset = offset;
  let value = 0;

  while (true) {
    const byte = dataView.getUint8(nextOffset);

    nextOffset += 1;

    if (byte > 127) {
      value += byte & 0x7f;
      value <<= 7;
    } else {
      value += byte;

      return {
        offset: nextOffset,
        value,
      };
    }
  }
};

const _parseEvent = (
  dataView: DataView,
  offset: number,
  lastStatusByte: null | number
): { statusByte: number; event: MidiEvent; offset: number } => {
  let result: { event: MidiEvent; offset: number };

  const { offset: nextOffset, value: ticks } = _readVariableLengthQuantity(
    dataView,
    offset
  );

  const statusByte = dataView.getUint8(nextOffset);

  if (statusByte === 0xf0) {
    result = _parseSystemExclusiveEvent(statusByte, dataView, nextOffset + 1);
  } else if (statusByte === 0xff) {
    result = _parseSystemMetaEvent(statusByte, dataView, nextOffset + 1);
  } else {
    result = _parseVoiceEvent(
      statusByte,
      dataView,
      nextOffset + 1,
      lastStatusByte
    );
  }

  return {
    statusByte,
    event: { ticks, ...result.event },
    offset: result.offset,
  };
};

const _parseSystemExclusiveEvent = (
  statusType: MidiStatusSystemExclusiveType,
  dataView: DataView,
  offset: number
): { event: MidiSystemExclusiveEvent; offset: number } => {
  let event: MidiSystemExclusiveEvent;

  const { offset: nextOffset, value: length } = _readVariableLengthQuantity(
    dataView,
    offset
  );

  event = <IMidiSystemExclusiveEvent>{
    statusType,
    statusData: hexify(dataView, nextOffset, length),
  };

  return {
    event,
    offset: nextOffset + length,
  };
};

const _parseSystemMetaEvent = (
  statusType: MidiStatusSystemMetaType,
  dataView: DataView,
  offset: number
): { event: MidiSystemMetaEvent; offset: number } => {
  let event: MidiSystemMetaEvent;

  const statusData = dataView.getUint8(offset);
  const { offset: nextOffset, value: length } = _readVariableLengthQuantity(
    dataView,
    offset + 1
  );

  if (statusData === 0x01) {
    event = <IMidiSystemMetaTextEvent>{
      statusType,
      statusData,
      text: stringify(dataView, nextOffset, length),
    };
  } else if (statusData === 0x02) {
    event = <IMidiSystemMetaCopyrightEvent>{
      statusType,
      statusData,
      copyrightNotice: stringify(dataView, nextOffset, length),
    };
  } else if (statusData === 0x03) {
    event = <IMidiSystemMetaTrackNameEvent>{
      statusType,
      statusData,
      trackName: stringify(dataView, nextOffset, length),
    };
  } else if (statusData === 0x04) {
    event = <IMidiSystemMetaInstrumentNameEvent>{
      statusType,
      statusData,
      instrumentName: stringify(dataView, nextOffset, length),
    };
  } else if (statusData === 0x05) {
    event = <IMidiSystemMetaLyricEvent>{
      statusType,
      statusData,
      lyric: stringify(dataView, nextOffset, length),
    };
  } else if (statusData === 0x06) {
    event = <IMidiSystemMetaMarkerEvent>{
      statusType,
      statusData,
      marker: stringify(dataView, nextOffset, length),
    };
  } else if (statusData === 0x07) {
    event = <IMidiSystemMetaCueEvent>{
      statusType,
      statusData,
      cuePoint: stringify(dataView, nextOffset, length),
    };
  } else if (statusData === 0x08) {
    event = <IMidiSystemMetaProgramNameEvent>{
      statusType,
      statusData,
      programName: stringify(dataView, nextOffset, length),
    };
  } else if (statusData === 0x09) {
    event = <IMidiSystemMetaDeviceNameEvent>{
      statusType,
      statusData,
      deviceName: stringify(dataView, nextOffset, length),
    };
  } else if (
    statusData === 0x0a ||
    statusData === 0x0b ||
    statusData === 0x0c ||
    statusData === 0x0d ||
    statusData === 0x0e ||
    statusData === 0x0f
  ) {
    event = <IMidiSystemMetaTextEvent>{
      statusType,
      statusData,
      text: stringify(dataView, nextOffset, length),
    };
  } else if (statusData === 0x20) {
    event = <IMidiSystemMetaChannelPrefixEvent>{
      statusType,
      statusData,
      channelPrefix: dataView.getUint8(nextOffset),
    };
  } else if (statusData === 0x21) {
    event = <IMidiSystemMetaPortEvent>{
      statusType,
      statusData,
      midiPort: dataView.getUint8(nextOffset),
    };
  } else if (statusData === 0x2f) {
    // TODO: length must be 0
    event = <IMidiSystemMetaTrackEndEvent>{
      statusType,
      statusData,
      endOfTrack: true,
    };
  } else if (statusData === 0x51) {
    // TODO: length must be 5
    event = <IMidiSystemMetaTempoEvent>{
      statusType,
      statusData,
      tempo: {
        mpq:
          (dataView.getUint8(nextOffset) << 16) +
          (dataView.getUint8(nextOffset + 1) << 8) +
          dataView.getUint8(nextOffset + 2),
      },
    };
  } else if (statusData === 0x54) {
    let frameRate;
    // TODO: length must be 5
    const hourByte = dataView.getUint8(nextOffset);
    if ((hourByte & 0x60) === 0x00) {
      frameRate = 24;
    } else if ((hourByte & 0x60) === 0x20) {
      frameRate = 25;
    } else if ((hourByte & 0x60) === 0x40) {
      frameRate = 29;
    } else if ((hourByte & 0x60) === 0x60) {
      frameRate = 30;
    }
    event = <IMidiSystemMetaSmpteOffsetEvent>{
      statusType,
      statusData,
      smpteOffset: {
        frame: dataView.getUint8(nextOffset + 3),
        frameRate,
        hour: hourByte & 0x1f,
        minutes: dataView.getUint8(nextOffset + 1),
        seconds: dataView.getUint8(nextOffset + 2),
        subFrame: dataView.getUint8(nextOffset + 4),
      },
    };
  } else if (statusData === 0x58) {
    event = <IMidiSystemMetaTimeSignatureEvent>{
      statusType,
      statusData,
      timeSignature: {
        denominator: Math.pow(2, dataView.getUint8(nextOffset + 1)),
        metronome: dataView.getUint8(nextOffset + 2),
        numerator: dataView.getUint8(nextOffset),
        thirtyseconds: dataView.getUint8(nextOffset + 3),
      },
    };
  } else if (statusData === 0x59) {
    // TODO: length must be 2
    event = <IMidiSystemMetaKeySignatureEvent>{
      statusType,
      statusData,
      keySignature: {
        key: dataView.getInt8(nextOffset),
        scale: dataView.getInt8(nextOffset + 1),
      },
    };
  } else if (statusData === 0x7f) {
    event = <IMidiSystemMetaSequencerSpecificEvent>{
      statusType,
      statusData,
      sequencerSpecificData: hexify(dataView, nextOffset, length),
    };
  } else {
    throw new Error(
      `Cannot parse a system meta event with a type of "${hexifyNumber(
        statusData
      )}"`
    );
  }

  return {
    event,
    offset: nextOffset + length,
  };
};

const _parseVoiceEvent = (
  statusByte: number,
  dataView: DataView,
  offset: number,
  lastStatusByte: null | number
): { event: MidiVoiceEvent; offset: number } => {
  const sanitizedLastStatusByte =
    (statusByte & 0x80) === 0 ? lastStatusByte : null;
  const statusFirstHalf =
    (sanitizedLastStatusByte === null ? statusByte : sanitizedLastStatusByte) >>
    4;
  const statusSecondHalf =
    (sanitizedLastStatusByte === null ? statusByte : sanitizedLastStatusByte) &
    0x0f;
  const statusType = statusFirstHalf as MidiStatusVoiceType;
  const statusChannel = statusSecondHalf as MidiStatusChannel;

  let event: MidiVoiceEvent;
  let sanitizedOffset = sanitizedLastStatusByte === null ? offset : offset - 1;

  if (statusType === 0x08) {
    event = <IMidiVoiceNoteOffEvent>{
      statusType,
      statusChannel,
      noteOff: {
        noteNumber: dataView.getUint8(sanitizedOffset),
        velocity: dataView.getUint8(sanitizedOffset + 1),
      },
    };
    sanitizedOffset += 2;
  } else if (statusType === 0x09) {
    const noteNumber = dataView.getUint8(sanitizedOffset);
    const velocity = dataView.getUint8(sanitizedOffset + 1);
    if (velocity === 0) {
      event = <IMidiVoiceNoteOffEvent>{
        statusType,
        statusChannel,
        noteOff: {
          noteNumber,
          velocity,
        },
      };
    } else {
      event = <IMidiVoiceNoteOnEvent>{
        statusType,
        statusChannel,
        noteOn: {
          noteNumber,
          velocity,
        },
      };
    }
    sanitizedOffset += 2;
  } else if (statusType === 0x0a) {
    event = <IMidiVoicePolyphonicEvent>{
      statusType,
      statusChannel,
      keyPressure: {
        noteNumber: dataView.getUint8(sanitizedOffset),
        pressure: dataView.getUint8(sanitizedOffset + 1),
      },
    };
    sanitizedOffset += 2;
  } else if (statusType === 0x0b) {
    event = <IMidiVoiceControlEvent>{
      statusType,
      statusChannel,
      controlChange: {
        controller: dataView.getUint8(sanitizedOffset),
        value: dataView.getUint8(sanitizedOffset + 1),
      },
    };
    sanitizedOffset += 2;
  } else if (statusType === 0x0c) {
    event = <IMidiVoiceProgramEvent>{
      statusType,
      statusChannel,
      programChange: {
        programNumber: dataView.getUint8(sanitizedOffset),
      },
    };
    sanitizedOffset += 1;
  } else if (statusType === 0x0d) {
    event = <IMidiVoicePressureEvent>{
      statusType,
      statusChannel,
      channelPressure: {
        pressure: dataView.getUint8(sanitizedOffset),
      },
    };
    sanitizedOffset += 1;
  } else if (statusType === 0x0e) {
    event = <IMidiVoicePitchBendEvent>{
      statusType,
      statusChannel,
      pitchBend:
        dataView.getUint8(sanitizedOffset) |
        (dataView.getUint8(sanitizedOffset + 1) << 7),
    };
    sanitizedOffset += 2;
  } else {
    throw new Error(
      `Cannot parse a voice event with a status byte of "${hexifyNumber(
        statusByte
      )}"`
    );
  }

  return { event, offset: sanitizedOffset };
};
