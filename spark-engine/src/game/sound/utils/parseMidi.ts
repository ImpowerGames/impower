/*!
 * Based on midi-json-parser-worker <https://github.com/chrisguttandin/midi-json-parser-worker>
 *
 * Copyright (c) 2023 Christoph Guttandin
 * Released under the MIT license.
 */

import { MIDI_CONTROLLER } from "../constants/MIDI_CONTROLLER";
import { MIDI_STATUS_DATA } from "../constants/MIDI_STATUS_DATA";
import {
  MIDI_STATUS_SYSTEM,
  MIDI_STATUS_TYPE,
} from "../constants/MIDI_STATUS_TYPE";
import { Midi } from "../types/Midi";
import {
  MidiEvent,
  MidiStatusChannel,
  MidiStatusVoiceType,
  MidiSystemExclusiveEvent,
  MidiSystemMetaEvent,
  MidiVoiceEvent,
} from "../types/MidiEvent";
import { hexify, hexifyNumber } from "./hexify";
import { stringifyDataView } from "./stringifyDataView";

const normalize = (value: number, min: number, max: number): number => {
  return (value - min) / (max - min);
};

export const parseMidi = (
  arrayBuffer: ArrayBuffer,
  normalizeValues = true
): Midi => {
  const dataView = new DataView(arrayBuffer);

  const header = _parseHeaderChunk(dataView);

  const tracks = [];
  let offset = 14;
  for (let i = 0; i < header.numberOfTracks; i += 1) {
    let track;
    ({ offset, track } = _parseTrackChunk(dataView, offset));
    if (normalizeValues) {
      track.forEach((event) => {
        if (event.statusType === MIDI_STATUS_TYPE.voice_note_off) {
          event.noteOffVelocity = normalize(event.noteOffVelocity, 0, 127);
        }
        if (event.statusType === MIDI_STATUS_TYPE.voice_note_on) {
          event.noteOnVelocity = normalize(event.noteOnVelocity, 0, 127);
        }
        if (event.statusType === MIDI_STATUS_TYPE.voice_pitch_bend) {
          // Typical range is +/- 2 semitones
          event.pitchBend = normalize(event.pitchBend, 8192, 8192 * 2) * 2;
        }
        if (event.statusType === MIDI_STATUS_TYPE.voice_controller_change) {
          if (
            event.controllerNumber === MIDI_CONTROLLER.sustain_pedal ||
            event.controllerNumber === MIDI_CONTROLLER.portamento_pedal ||
            event.controllerNumber === MIDI_CONTROLLER.sostenuto_pedal ||
            event.controllerNumber === MIDI_CONTROLLER.soft_pedal ||
            event.controllerNumber === MIDI_CONTROLLER.legato_pedal ||
            event.controllerNumber === MIDI_CONTROLLER.hold_pedal
          ) {
            event.controllerValue = event.controllerValue <= 63 ? 0 : 1;
          } else if (
            event.controllerNumber === MIDI_CONTROLLER.local_keyboard
          ) {
            event.controllerValue = event.controllerValue === 0 ? 0 : 1;
          } else if (
            event.controllerNumber === MIDI_CONTROLLER.mono_operation
          ) {
            event.controllerValue = event.controllerValue;
          } else {
            event.controllerValue = normalize(event.controllerValue, 0, 127);
          }
        }
      });
    }
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

  if (stringifyDataView(dataView, 0, 4) !== "MThd") {
    throw new Error(
      `Unexpected characters "${stringifyDataView(
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
  if (stringifyDataView(dataView, offset, 4) !== "MTrk") {
    throw new Error(
      `Unexpected characters "${stringifyDataView(
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
    if (
      (event as MidiVoiceEvent).statusChannel !== undefined &&
      (statusByte & 0x80) > 0
    ) {
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

  if (statusByte === MIDI_STATUS_SYSTEM.system_exclusive) {
    result = _parseSystemExclusiveEvent(statusByte, dataView, nextOffset + 1);
  } else if (statusByte === MIDI_STATUS_SYSTEM.system_meta) {
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
    event: { ...result.event, ticks },
    offset: result.offset,
  };
};

const _parseSystemExclusiveEvent = (
  statusType: 0xf0,
  dataView: DataView,
  offset: number
): { event: MidiSystemExclusiveEvent; offset: number } => {
  let event: MidiSystemExclusiveEvent;

  const { offset: nextOffset, value: length } = _readVariableLengthQuantity(
    dataView,
    offset
  );

  event = <MidiSystemExclusiveEvent>{
    statusType,
    statusData: hexify(dataView, nextOffset, length),
  };

  return {
    event,
    offset: nextOffset + length,
  };
};

const _parseSystemMetaEvent = (
  statusType: 0xff,
  dataView: DataView,
  offset: number
): { event: MidiSystemMetaEvent; offset: number } => {
  const statusData = dataView.getUint8(offset);
  const { offset: nextOffset, value: length } = _readVariableLengthQuantity(
    dataView,
    offset + 1
  );

  let event = {
    statusType,
    statusData,
  } as MidiSystemMetaEvent;

  if (event.statusData === MIDI_STATUS_DATA.system_meta_text) {
    event.text = stringifyDataView(dataView, nextOffset, length);
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_copyright) {
    event.copyrightNotice = stringifyDataView(dataView, nextOffset, length);
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_track_name) {
    event.trackName = stringifyDataView(dataView, nextOffset, length);
  } else if (
    event.statusData === MIDI_STATUS_DATA.system_meta_instrument_name
  ) {
    event.instrumentName = stringifyDataView(dataView, nextOffset, length);
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_lyric) {
    event.lyric = stringifyDataView(dataView, nextOffset, length);
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_marker) {
    event.marker = stringifyDataView(dataView, nextOffset, length);
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_cue) {
    event.cuePoint = stringifyDataView(dataView, nextOffset, length);
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_program_name) {
    event.programName = stringifyDataView(dataView, nextOffset, length);
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_device_name) {
    event.deviceName = stringifyDataView(dataView, nextOffset, length);
  } else if (
    event.statusData === MIDI_STATUS_DATA.system_meta_text_00 ||
    event.statusData === MIDI_STATUS_DATA.system_meta_text_01 ||
    event.statusData === MIDI_STATUS_DATA.system_meta_text_02 ||
    event.statusData === MIDI_STATUS_DATA.system_meta_text_03 ||
    event.statusData === MIDI_STATUS_DATA.system_meta_text_04 ||
    event.statusData === MIDI_STATUS_DATA.system_meta_text_05
  ) {
    event.text = stringifyDataView(dataView, nextOffset, length);
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_channel_prefix) {
    event.channelPrefix = dataView.getUint8(nextOffset);
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_port) {
    event.midiPort = dataView.getUint8(nextOffset);
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_track_end) {
    // TODO: length must be 0
    event.endOfTrack = true;
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_tempo) {
    // TODO: length must be 5
    event.tempoMPQ =
      (dataView.getUint8(nextOffset) << 16) +
      (dataView.getUint8(nextOffset + 1) << 8) +
      dataView.getUint8(nextOffset + 2);
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_smpte_offset) {
    let frameRate = 0;
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
    event.smpteFrame = dataView.getUint8(nextOffset + 3);
    event.smpteFrameRate = frameRate;
    event.smpteHour = hourByte & 0x1f;
    event.smpteMinutes = dataView.getUint8(nextOffset + 1);
    event.smpteSeconds = dataView.getUint8(nextOffset + 2);
    event.smpteSubFrame = dataView.getUint8(nextOffset + 4);
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_time_signature) {
    event.timeSignatureNumerator = dataView.getUint8(nextOffset);
    event.timeSignatureDenominator = Math.pow(
      2,
      dataView.getUint8(nextOffset + 1)
    );
    event.timeSignatureClicks = dataView.getUint8(nextOffset + 2);
    event.timeSignatureResolution = dataView.getUint8(nextOffset + 3);
  } else if (event.statusData === MIDI_STATUS_DATA.system_meta_key_signature) {
    // TODO: length must be 2
    event.keySignatureNote = dataView.getInt8(nextOffset);
    event.keySignatureScale = dataView.getInt8(nextOffset + 1);
  } else if (
    event.statusData === MIDI_STATUS_DATA.system_meta_sequencer_specific
  ) {
    event.sequencerSpecificData = hexify(dataView, nextOffset, length);
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

  let event = {
    statusType,
    statusChannel,
  } as MidiVoiceEvent;
  let sanitizedOffset = sanitizedLastStatusByte === null ? offset : offset - 1;

  if (event.statusType === MIDI_STATUS_TYPE.voice_note_off) {
    event.noteOffNumber = dataView.getUint8(sanitizedOffset);
    event.noteOffVelocity = dataView.getUint8(sanitizedOffset + 1);
    sanitizedOffset += 2;
  } else if (event.statusType === MIDI_STATUS_TYPE.voice_note_on) {
    const noteNumber = dataView.getUint8(sanitizedOffset);
    const velocity = dataView.getUint8(sanitizedOffset + 1);
    if (velocity === 0) {
      event = {
        ...event,
        statusType: 0x08,
        noteOffNumber: noteNumber,
        noteOffVelocity: velocity,
      };
    } else {
      event.noteOnNumber = noteNumber;
      event.noteOnVelocity = velocity;
    }
    sanitizedOffset += 2;
  } else if (
    event.statusType === MIDI_STATUS_TYPE.voice_polyphonic_key_pressure
  ) {
    event.keyPressureNote = dataView.getUint8(sanitizedOffset);
    event.keyPressureValue = dataView.getUint8(sanitizedOffset + 1);
    sanitizedOffset += 2;
  } else if (event.statusType === MIDI_STATUS_TYPE.voice_controller_change) {
    event.controllerNumber = dataView.getUint8(sanitizedOffset);
    event.controllerValue = dataView.getUint8(sanitizedOffset + 1);
    sanitizedOffset += 2;
  } else if (event.statusType === MIDI_STATUS_TYPE.voice_program_change) {
    (event.programNumber = dataView.getUint8(sanitizedOffset)),
      (sanitizedOffset += 1);
  } else if (event.statusType === MIDI_STATUS_TYPE.voice_channel_pressure) {
    event.channelPressure = dataView.getUint8(sanitizedOffset);
    sanitizedOffset += 1;
  } else if (event.statusType === MIDI_STATUS_TYPE.voice_pitch_bend) {
    event.pitchBend =
      dataView.getUint8(sanitizedOffset) |
      (dataView.getUint8(sanitizedOffset + 1) << 7);
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
