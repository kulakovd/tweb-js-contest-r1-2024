export type MP4TrackId = number;

export interface MP4Track {
  id: MP4TrackId;
  codec: string;
}

export interface MP4Info {
  duration: number;
  timescale: number;
  fragment_duration: number;
  isFragmented: boolean;
  isProgressive: boolean;
  hasIOD: boolean;
  brands: string[];
  created: Date;
  modified: Date;
  tracks: MP4Track[];
  audioTracks: MP4Track[];
  videoTracks: MP4Track[];
}

export type MP4ArrayBuffer = ArrayBuffer & {fileStart: number};

export interface MP4Sample {
  data: Uint8Array;
}

export interface MP4InitSegment {
  buffer: ArrayBuffer;
}

export interface MP4File {
  onReady: (info: MP4Info) => void;
  onSegment: (id: MP4TrackId, user: any, buffer: ArrayBuffer, sampleNum: number, isLast: boolean) => void;
  onSamples: (id: MP4TrackId, user: any, samples: MP4Sample[]) => void;
  setExtractionOptions(trackId: MP4TrackId): void;
  setSegmentOptions(trackId: MP4TrackId): void;
  initializeSegmentation(): MP4InitSegment[];
  appendBuffer(buffer: MP4ArrayBuffer): void;
  flush(): void;
  start(): void;
}

export function createFile(): MP4File;
