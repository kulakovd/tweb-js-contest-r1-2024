import {AppManagers} from '../appManagers/managers';
import {GroupCall, GroupCallStreamChannel} from '../../layer';
import EventListenerBase from '../../helpers/eventListenerBase';
import * as MP4Box from '../../vendor/mp4box.all';
import {MP4ArrayBuffer, MP4Info} from '../../vendor/mp4box.all';
import {OpusDecoder} from 'opus-decoder';
import ListenerSetter from '../../helpers/listenerSetter';
import appMediaPlaybackController from '../../components/appMediaPlaybackController';

type VideoStreamPartPromise = Promise<VideoStreamPart> & {
  timestamp: bigint;
}

const OOPS_TIMEOUT = 3000;
const WAIT_FOR_CHANNELS_INTERVAL = 1000;
const CHUNK_DURATION = 1000;
const BUFFER_CHUNKS = 3;

const SCALE = 0;
const CHANNEL = 1;
const VIDEO_QUALITY = 2;

export default class LiveStreamInstance extends EventListenerBase<{
  oops: () => void;
  timeupdate: (time: number) => void;
}> {
  private audioContext = new AudioContext();
  private volumeGain = this.audioContext.createGain();

  private mediaSource = new MediaSource();
  public mediaSrc: string = URL.createObjectURL(this.mediaSource);
  private streamEnded: boolean = false;

  private firstLoadedOffset: number = -1;

  private readonly streamDcId: number;

  private startTimestamp: bigint = BigInt(0);

  private lastFrameUrl: string | null = null;

  private spentWaitingForChannels: number = 0;
  private oops: boolean = false;

  private buffer: ChunkBuffer;

  constructor(
    private managers: AppManagers,
    private call: GroupCall.groupCall
  ) {
    super();
    const listenerSetter = new ListenerSetter();

    this.streamDcId = call.stream_dc_id;

    this.volumeGain.connect(this.audioContext.destination);
    listenerSetter.add(appMediaPlaybackController)('playbackParams', () => this.setVolume());
    this.setVolume();

    this.buffer = new ChunkBuffer(managers, this.audioContext, this.streamDcId, call);
    this.buffer.addEventListener('chunk', (chunk) => this.appendAudio(chunk));
    this.mediaSource.addEventListener('sourceopen', () => this.initMediaSource());
  }

  private setVolume = () => {
    const volume = appMediaPlaybackController.muted ? 0 : appMediaPlaybackController.volume;
    this.volumeGain.gain.setValueAtTime(volume, this.audioContext.currentTime);
  }

  public saveLastFrame(url: string) {
    if(this.lastFrameUrl) {
      URL.revokeObjectURL(this.lastFrameUrl);
    }
    this.lastFrameUrl = url;
  }

  public getLastFrame(): string | null {
    return this.lastFrameUrl;
  }

  public async waitForBuffer(): Promise<void> {
    return this.buffer.waitForBuffer();
  }

  public async initStream() {
    this.buffer.clearBuffer();

    const channel = await this.getVideoChannel();
    const startTimestamp = BigInt(channel.last_timestamp_ms) - BigInt(BUFFER_CHUNKS) * BigInt(CHUNK_DURATION);

    if(startTimestamp === undefined) {
      throw new Error('Invalid start timestamp');
    }

    this.startTimestamp = startTimestamp;
    this.buffer.setLastChunkTimestamp(startTimestamp);

    await this.waitForBuffer();
  }

  public async disconnect() {
    this.streamEnded = true;
    this.audioContext.close();
    if(this.mediaSource.readyState === 'open') {
      this.mediaSource.endOfStream();
    }
    URL.revokeObjectURL(this.mediaSrc);
    this.buffer.endOfStream();
  }

  private async getVideoChannel(): Promise<GroupCallStreamChannel> {
    if(this.streamEnded) {
      return;
    }

    if(this.spentWaitingForChannels > OOPS_TIMEOUT && !this.oops) {
      this.dispatchEvent('oops');
      this.oops = true;
    }

    const streamChannels = await this.managers.appGroupCallsManager.getGroupCallStreamChannels(this.call.id, this.streamDcId);
    const channel = streamChannels.channels.find(channel => channel.channel === CHANNEL);
    const appropiateTimestamp = channel && (BigInt(channel.last_timestamp_ms) >= BigInt(BUFFER_CHUNKS + 1) * BigInt(CHUNK_DURATION));
    if(appropiateTimestamp) {
      this.oops = false;
      return channel;
    }
    return new Promise(resolve => setTimeout(() => {
      resolve(this.getVideoChannel())
      this.spentWaitingForChannels += WAIT_FOR_CHANNELS_INTERVAL;
    }, WAIT_FOR_CHANNELS_INTERVAL));
  }

  private async initMediaSource() {
    await this.buffer.waitForFirstChunk();
    const first = await this.buffer.chunks[0];
    const videoBuffer = this.mediaSource.addSourceBuffer(`video/mp4; codecs="${first.videoCodec}"`);

    const appendQueue: VideoStreamPart[] = await Promise.all(this.buffer.chunks.slice());

    const getBufferedAhead = () => {
      const currentTime = this.audioContext.currentTime;
      for(let i = 0; i < videoBuffer.buffered.length; i++) {
        if(videoBuffer.buffered.start(i) <= currentTime && currentTime <= videoBuffer.buffered.end(i)) {
          return videoBuffer.buffered.end(i) - currentTime;
        }
      }
      return 0;
    }

    const appendVideo = async() => {
      if(appendQueue.length > 0 && !videoBuffer.updating) {
        const chunk = appendQueue.shift();
        const when = Number((chunk.timestamp - this.startTimestamp) / BigInt(1000)) + this.firstLoadedOffset;
        videoBuffer.timestampOffset = when;
        videoBuffer.appendBuffer(chunk.videoMediaSegment);
      }
    }

    this.buffer.addEventListener('chunk', (chunk) => {
      appendQueue.push(chunk);
      appendVideo();
    });

    videoBuffer.addEventListener('updateend', (e) => {
      this.dispatchEvent('timeupdate', this.audioContext.currentTime);
      appendVideo();
    });

    videoBuffer.appendBuffer(first.videoInitSegment);
  }

  private async appendAudio(chunk: VideoStreamPart) {
    await this.buffer.waitForBuffer();
    if(this.audioContext.state === 'closed') return;

    if(this.firstLoadedOffset === -1) {
      this.firstLoadedOffset = this.audioContext.currentTime;
    }

    const {audioBuffer} = chunk;

    const when = Number((chunk.timestamp - this.startTimestamp) / BigInt(1000)) + this.firstLoadedOffset;

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.volumeGain);

    source.addEventListener('ended', () => {
      source.disconnect();
      this.buffer.dropChunk(chunk.timestamp);
    });

    source.start(when);
  };
}

class ChunkBuffer extends EventListenerBase<{
  chunk: (chunk: VideoStreamPart) => void;
}> {
  private decoder = new VideoStreamDecoder(this.audioContext);
  public chunks: Array<VideoStreamPartPromise> = [];
  private lastChunkTimestamp: bigint = BigInt(0);
  private streamEnded: boolean = false;

  private initPromise: Promise<void>;
  private resolveInitPromise: () => void;

  constructor(
    private managers: AppManagers,
    private audioContext: AudioContext,
    private streamDcId: number,
    private call: GroupCall.groupCall
  ) {
    super();
    // when lastChunkTimestamp is set, initPromise is resolved
    this.initPromise = new Promise(resolve => this.resolveInitPromise = resolve);
  }

  public setLastChunkTimestamp(timestamp: bigint) {
    this.lastChunkTimestamp = timestamp;
    this.resolveInitPromise();
  }

  public clearBuffer() {
    this.chunks = [];
  }

  public dropChunk(timestamp: bigint) {
    this.chunks = this.chunks.filter(chunk => chunk.timestamp !== timestamp);
    this.fillBuffer();
  }

  public async waitForFirstChunk(): Promise<VideoStreamPart> {
    await this.initPromise;
    const firstChunk = this.chunks[0];
    if(!firstChunk) {
      this.enqueueLoadingChunk();
    }
    return firstChunk;
  }

  public async waitForBuffer(): Promise<void> {
    await this.initPromise;
    this.fillBuffer();
    await Promise.all(this.chunks.slice(0, BUFFER_CHUNKS));
  }

  public endOfStream() {
    this.streamEnded = true;
  }

  private enqueueLoadingChunks(n: number) {
    for(let i = 0; i < n; i++) {
      this.enqueueLoadingChunk();
    }
  }

  private enqueueLoadingChunk() {
    const time = this.lastChunkTimestamp + BigInt(CHUNK_DURATION);
    this.lastChunkTimestamp = time;
    const promise = this.loadChunk(time) as VideoStreamPartPromise;
    promise.timestamp = time;
    promise.then((p) => this.dispatchEvent('chunk', p));
    this.chunks.push(promise);
  }

  private fillBuffer() {
    const chunksToLoad = BUFFER_CHUNKS - this.chunks.length;
    this.enqueueLoadingChunks(chunksToLoad);
  }

  private async loadChunk(time: bigint, attempt = 1): Promise<VideoStreamPart> {
    await this.initPromise;
    if(attempt > 3) {
      throw new Error('Too many attempts');
    }
    if(this.streamEnded) {
      throw new Error('Stream ended');
    }
    try {
      const chunk = await this.managers.appGroupCallsManager.getGroupCallStreamChunk(
        this.streamDcId,
        this.call,
        time.toString(),
        SCALE,
        CHANNEL,
        VIDEO_QUALITY
      );

      if(chunk._ !== 'upload.file') {
        throw new Error('Invalid chunk');
      }

      return this.decoder.decode(time, chunk.bytes);
    } catch(e) {
      return new Promise(resolve => setTimeout(() => resolve(this.loadChunk(time, attempt + 1)), CHUNK_DURATION));
    }
  }
}

class VideoStreamDecoder {
  private opusDecoder = new OpusDecoder({ // TODO use web worker
    streamCount: 2,
    coupledStreamCount: 0
  });

  constructor(private audioContext: AudioContext) {}

  public async decode(timestamp: bigint, input: Uint8Array): Promise<VideoStreamPart> {
    const uint8Array = new Uint8Array(input);
    const {info, offset} = new VideoStreamPartHeadReader(uint8Array).consumeVideoStreamInfo();

    if(!info) throw new Error('Invalid video stream part');

    const data = uint8Array.slice(offset).buffer;

    const [audioBuffer, extractedVideo] = await Promise.all([
      this.extractAudio(data).then((rawAudio) => this.decodeAudio(rawAudio)),
      this.extractVideo(data)
    ]);

    return {
      timestamp,
      info,
      audioBuffer,
      ...extractedVideo
    };
  }

  private async createMP4File(input: ArrayBuffer) {
    const mp4f = MP4Box.createFile();
    const ready = new Promise<MP4Info>((resolve) => {
      mp4f.onReady = resolve;
    });

    const inputBuffer = input as MP4ArrayBuffer;
    inputBuffer.fileStart = 0;
    mp4f.appendBuffer(inputBuffer);
    mp4f.flush();

    return {
      mp4f,
      info: await ready
    };
  }

  private async extractAudio(input: ArrayBuffer) {
    const {mp4f, info} = await this.createMP4File(input);
    const audioTrack = info.audioTracks[0];
    if(!audioTrack) {
      return null;
    }

    mp4f.setExtractionOptions(audioTrack.id);

    const rawAudio = new Promise<Uint8Array[]>((resolve) => {
      mp4f.onSamples = function(_, _2, samples) {
        const data = samples.map((sample) => sample.data);
        resolve(data);
      };
    });

    mp4f.start();

    return rawAudio;
  }

  private async decodeAudio(rawAudio: Uint8Array[]) {
    await this.opusDecoder.ready;
    const decodedAudio = this.opusDecoder.decodeFrames(rawAudio); // TODO use web worker

    const audioBuffer = this.audioContext.createBuffer(decodedAudio.channelData.length, decodedAudio.samplesDecoded, decodedAudio.sampleRate);

    decodedAudio.channelData.forEach((channelData, i) => {
      audioBuffer.copyToChannel(channelData, i);
    });

    return audioBuffer;
  }

  private async extractVideo(input: ArrayBuffer) {
    const {mp4f, info} = await this.createMP4File(input);
    const videoTrack = info.videoTracks[0];
    if(!videoTrack) {
      return null;
    }

    mp4f.setSegmentOptions(videoTrack.id);

    const mediaSegment = new Promise<ArrayBuffer>((resolve) => {
      mp4f.onSegment = function(_, _2, buffer) {
        resolve(buffer);
      };
    });

    const initSegment = mp4f.initializeSegmentation()[0].buffer;

    mp4f.start();

    return {
      videoInitSegment: initSegment,
      videoMediaSegment: await mediaSegment,
      videoCodec: videoTrack.codec
    };
  }
}

interface VideoStreamPart {
  timestamp: bigint;
  info: VideoStreamInfo;
  audioBuffer: AudioBuffer;
  videoCodec: string;
  videoInitSegment: ArrayBuffer;
  videoMediaSegment: ArrayBuffer;
}

class VideoStreamPartHeadReader {
  private static readonly SIGNATURE = 0xa12e810d;

  private offset: number;

  constructor(private data: Uint8Array) {
    this.offset = 0;
  }

  public consumeVideoStreamInfo(): { info: VideoStreamInfo | null, offset: number } {
    const signature = this.readInt32();
    if(signature === null || signature !== VideoStreamPartHeadReader.SIGNATURE) {
      return null;
    }

    const info: VideoStreamInfo = {};

    const container = this.readSerializedString();
    if(container === null) {
      return null;
    }
    info.container = container;

    const activeMask = this.readInt32();
    if(activeMask === null) {
      return null;
    }
    info.activeMask = activeMask;

    const eventCount = this.readInt32();
    if(eventCount === null || eventCount <= 0) {
      return null;
    }

    info.events = [];
    for(let i = 0; i < eventCount; i++) {
      const event = this.readVideoStreamEvent();
      if(event === null) {
        return null;
      }
      info.events.push(event);
    }

    return {info, offset: this.offset};
  }

  private readInt32(): number | null {
    if(this.offset + 4 > this.data.length) {
      return null;
    }

    const value = new DataView(this.data.buffer, this.offset, 4).getInt32(0, true);
    this.offset += 4;

    return value >>> 0;
  }

  private readSerializedString(): string | null {
    const tmp = this.readBytesAsInt32(1);
    if(tmp === null) {
      return null;
    }

    let length = 0;
    let paddingBytes = 0;

    if(tmp === 254) {
      const len = this.readBytesAsInt32(3);
      if(len === null) {
        return null;
      }
      length = len;
      paddingBytes = this.roundUp(length, 4) - length;
    } else {
      length = tmp;
      paddingBytes = this.roundUp(length + 1, 4) - (length + 1);
    }

    if(this.offset + length > this.data.length) {
      return null;
    }

    const result = new TextDecoder().decode(this.data.slice(this.offset, this.offset + length));
    this.offset += length + paddingBytes;

    return result;
  }

  private readVideoStreamEvent(): VideoStreamEvent | null {
    const event: VideoStreamEvent = {offset: 0, endpointId: '', rotation: 0, extra: 0};

    const offsetValue = this.readInt32();
    if(offsetValue === null) {
      return null;
    }
    event.offset = offsetValue;

    const endpointId = this.readSerializedString();
    if(endpointId === null) {
      return null;
    }
    event.endpointId = endpointId;

    const rotation = this.readInt32();
    if(rotation === null) {
      return null;
    }
    event.rotation = rotation;

    const extra = this.readInt32();
    if(extra === null) {
      return null;
    }
    event.extra = extra;

    return event;
  }

  private readBytesAsInt32(count: number): number | null {
    if(this.offset + count > this.data.length || count === 0) {
      return null;
    }

    if(count <= 4) {
      let value = 0;
      for(let i = 0; i < count; i++) {
        value |= this.data[this.offset + i] << (i * 8);
      }
      this.offset += count;
      return value;
    }

    return null;
  }

  private roundUp(numToRound: number, multiple: number): number {
    if(multiple === 0) {
      return numToRound;
    }

    const remainder = numToRound % multiple;
    if(remainder === 0) {
      return numToRound;
    }

    return numToRound + multiple - remainder;
  }
}

type VideoStreamInfo = {
  container?: string;
  activeMask?: number;
  events?: VideoStreamEvent[];
};

type VideoStreamEvent = {
  offset: number;
  endpointId: string;
  rotation: number;
  extra: number;
};

