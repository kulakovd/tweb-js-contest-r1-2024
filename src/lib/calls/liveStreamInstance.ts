import {AppManagers} from '../appManagers/managers';
import {GroupCall, GroupCallStreamChannel} from '../../layer';

type VideoStreamPartPromise = Promise<VideoStreamPart> & {
  timestamp: bigint;
}

export default class LiveStreamInstance {
  private chunks: Array<VideoStreamPartPromise> = [];

  public get currentChunk(): Promise<string> {
    return this.chunks[0].then(chunk => chunk.getSrc());
  }

  public get nextChunk(): Promise<string> {
    return this.chunks[1].then(chunk => chunk.getSrc());
  }

  private readonly streamDcId: number;
  private scale: number = 0;
  private channel: number = 1;
  private videoQuality: number = 2;

  private chunkDuration = 1000;
  private bufferChunks = 2;

  private lastChunkTimestamp: bigint = BigInt(0);

  private lastFrameUrl: string | null = null;

  private streamChannelsTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private managers: AppManagers,
    private call: GroupCall.groupCall
  ) {
    (window as any).liveStreamInstance = this;

    this.streamDcId = call.stream_dc_id;
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

  public async onChunkPlayed() {
    const removed = await this.chunks.shift();
    removed?.revokeSrc();
    this.enqueueLoadingChunk();
  }

  public async waitForBuffer(): Promise<void> {
    const chunksToLoad = this.bufferChunks - this.chunks.length;
    this.enqueueLoadingChunks(chunksToLoad);
    await Promise.all(this.chunks.slice(0, this.bufferChunks));
  }

  public async initStream() {
    this.chunks = [];

    const channel = await this.getVideoChannel();
    const startTimestamp = BigInt(channel.last_timestamp_ms);

    if(startTimestamp === undefined) {
      throw new Error('Invalid start timestamp');
    }

    this.lastChunkTimestamp = startTimestamp - BigInt(this.bufferChunks + 1) * BigInt(this.chunkDuration);
    this.enqueueLoadingChunks(this.bufferChunks + 1);
  }

  public async disconnect() {
    if(this.streamChannelsTimeout !== null) {
      clearTimeout(this.streamChannelsTimeout);
    }
  }

  private async getVideoChannel(): Promise<GroupCallStreamChannel> {
    this.streamChannelsTimeout = null;
    const streamChannels = await this.managers.appGroupCallsManager.getGroupCallStreamChannels(this.call.id, this.streamDcId);
    const channel = streamChannels.channels.find(channel => channel.channel === this.channel);
    if(channel !== undefined) {
      return channel;
    }
    this.streamChannelsTimeout = setTimeout(() => this.getVideoChannel(), 1000);
  }

  private enqueueLoadingChunks(n: number) {
    for(let i = 0; i < n; i++) {
      this.enqueueLoadingChunk();
    }
  }

  private enqueueLoadingChunk() {
    const time = this.lastChunkTimestamp + BigInt(this.chunkDuration);
    this.lastChunkTimestamp = time;
    const promise = this.loadChunk(time) as VideoStreamPartPromise;
    promise.timestamp = time;
    this.chunks.push(promise);
  }

  private async loadChunk(time: bigint): Promise<VideoStreamPart> {
    const load = async() => {
      const chunk = await this.managers.appGroupCallsManager.getGroupCallStreamChunk(
        this.streamDcId,
        this.call,
        time.toString(),
        this.scale,
        this.channel,
        this.videoQuality
      );

      if(chunk._ !== 'upload.file') {
        throw new Error('Invalid chunk');
      }

      const {bytes} = chunk;
      return new VideoStreamPart(bytes, time);
    }

    try {
      return load();
    } catch(e) {
      console.error(e);
      setTimeout(load, this.chunkDuration / 10);
    }
  }
}

class VideoStreamPart {
  private offset: number;
  public data: Uint8Array;
  public info: VideoStreamInfo | null;

  private src: string | null = null;

  constructor(data: ArrayBuffer, public timestamp: bigint) {
    this.data = new Uint8Array(data);
    this.offset = 0;
    this.info = this.consumeVideoStreamInfo();
  }

  public getSrc(): string {
    if(this.src === null) {
      this.src = URL.createObjectURL(new Blob([this.data.buffer], {type: 'video/mp4'}))
    }
    return this.src;
  }

  public revokeSrc() {
    URL.revokeObjectURL(this.src)
  }

  public consumeVideoStreamInfo(): VideoStreamInfo | null {
    const signature = this.readInt32();
    if(signature === null || signature !== 0xa12e810d) {
      return null;
    }

    const info: VideoStreamInfo = {signature};

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

    this.data = this.data.slice(this.offset);

    return info;
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
  signature?: number;
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

