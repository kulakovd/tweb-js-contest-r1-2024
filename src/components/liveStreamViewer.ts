import {IS_MOBILE_SAFARI} from '../environment/userAgent';
import appNavigationController, {NavigationItem} from './appNavigationController';
import cancelEvent from '../helpers/dom/cancelEvent';
import liteMode from '../helpers/liteMode';
import {AppMediaViewerUnderlay} from './appMediaViewerUnderlay';
import ButtonIcon from './buttonIcon';
import {ShineAnimationCanvas} from './shineAnimationCanvas';
import rootScope from '../lib/rootScope';
import {GroupCall, PhotoSize} from '../layer';
import appDownloadManager from '../lib/appManagers/appDownloadManager';
import ListenerSetter from '../helpers/listenerSetter';
import liveStreamController from '../lib/calls/liveStreamController';

export default class LiveStreamViewer {
  protected navigationItem: NavigationItem;
  protected underlay: AppMediaViewerUnderlay<'forward'>;

  private streamPlayer: HTMLDivElement;
  private loadingContainer: HTMLDivElement;
  private thumb: HTMLDivElement;

  private liveBadge: HTMLDivElement;
  private watchingCounter: HTMLDivElement;

  private video1: HTMLVideoElement;
  private video2: HTMLVideoElement;

  private isPlaying: boolean = false;

  private loadingAnimation?: ShineAnimationCanvas = new ShineAnimationCanvas(
    'stream-player-loading-canvas',
    {
      border: 2,
      borderRadius: 10,
      gradientWidth: 500,
      blur: 50,
      animationDuration: 2000
    }
  );

  constructor(connectionPromise: Promise<void>) {
    const listenerSetter = new ListenerSetter();

    listenerSetter.add(rootScope)('group_call_update', this.updateCall.bind(this));

    this.underlay = new AppMediaViewerUnderlay(['forward']);
    this.underlay.onClick = this.onClick;
    this.underlay.onClose = this.close.bind(this);
    this.underlay.setListeners();

    this.streamPlayer = this.createStreamPlayer();
    this.underlay.append(this.streamPlayer);

    this.video1.preload = 'auto';
    this.video2.preload = 'auto';

    this.loadingAnimation.runInfinite();

    connectionPromise.then(() => {
      this.updateCall(liveStreamController.groupCall);
      this.play();
    });
  }

  private updateCall(groupCall: GroupCall) {
    if(liveStreamController.groupCall.id !== groupCall.id) return;

    if(groupCall?._ === 'groupCall') {
      const participantsCount = Math.max(0, groupCall.participants_count);

      this.watchingCounter.innerText = `${participantsCount} watching`;
    }
  }

  private async play() {
    let currentVideo = this.video1;
    let nextVideo = this.video2;

    currentVideo.style.zIndex = '2';
    nextVideo.style.zIndex = '1';

    function switchVideo() {
      [currentVideo, nextVideo] = [nextVideo, currentVideo];

      currentVideo.style.zIndex = '2';
      nextVideo.style.zIndex = '1';
    }

    const liveStream = liveStreamController.liveStream;

    if(!liveStream) {
      return;
    }

    await liveStream.initStream()
    await liveStream.waitForBuffer();
    this.onStartPlaying();

    const endedListener = segmentEnded.bind(this);
    async function segmentEnded(this: LiveStreamViewer) {
      currentVideo.removeEventListener('ended', endedListener);

      this.setThumbFromFrame(currentVideo);
      this.onStopPlaying();

      await liveStream.onChunkPlayed();
      await liveStream.waitForBuffer();

      this.onStartPlaying();

      if(currentVideo.src === undefined) {
        this.setThumbFromFrame(currentVideo);
        this.onStopPlaying();
      } else {
        switchVideo();
        nextVideo.src = await liveStream.nextChunk;
        currentVideo.addEventListener('ended', endedListener);
        currentVideo.play();
      }
    }

    currentVideo.src = await liveStream.currentChunk;
    nextVideo.src = await liveStream.nextChunk;
    currentVideo.addEventListener('ended', endedListener);
    await currentVideo.play();
  }

  private onStartPlaying = () => {
    this.isPlaying = true;
    this.updateView();
  }

  private onStopPlaying = () => {
    this.isPlaying = false;
    this.updateView();
  }

  private updateView() {
    this.liveBadge.classList.toggle('playing', this.isPlaying);
    this.loadingContainer?.classList.toggle('hidden', this.isPlaying);
    if(this.isPlaying) {
      this.loadingAnimation.stop();
    } else {
      this.loadingAnimation.runInfinite();
    }
  }

  onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if(target.tagName === 'A') return;

    cancelEvent(e);
    // this.close();
  }

  private setThumbFromUrl(url: string) {
    this.thumb.style.setProperty('--thumb', `url(${url})`);
  }

  private setThumbFromFrame(video: HTMLVideoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = video.width
    canvas.height = video.height
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL();
    this.thumb.style.setProperty('--thumb', `url(${url})`);
    liveStreamController.liveStream?.saveLastFrame(url);
  }

  private async setThumbFromAvatar(fromId: PeerId | string) {
    const isPeerId = fromId.isPeerId();

    if(isPeerId) {
      const photo = await rootScope.managers.appProfileManager.getFullPhoto(fromId as PeerId)

      if(photo._ === 'photoEmpty') {
        this.thumb.style.removeProperty('--thumb');
        return;
      }

      const photoSizes = photo.sizes.slice().filter((size) => (size as PhotoSize.photoSize).w) as PhotoSize.photoSize[];
      photoSizes && photoSizes.sort((a, b) => b.size - a.size);
      const fullPhotoSize = photoSizes?.[0];

      appDownloadManager.downloadMediaURL({
        media: photo,
        thumb: fullPhotoSize
      }).then((url) => {
        this.thumb.style.setProperty('--thumb', `url(${url})`);
      })
    }
  }

  public async open(fromId: PeerId | string) {
    const setAuthorPromise = this.underlay.setAuthorInfo(fromId, 'streaming'/* i18n? */);

    const lastFrame = liveStreamController.liveStream?.getLastFrame();
    if(lastFrame) {
      this.setThumbFromUrl(lastFrame);
    } else {
      this.setThumbFromAvatar(fromId);
    }

    this.navigationItem = {
      type: 'media',
      onPop: (canAnimate) => {
        if(!canAnimate && IS_MOBILE_SAFARI) {
          this.underlay.wholeDiv.remove();
        }

        this.close();
      }
    }

    appNavigationController.pushItem(this.navigationItem);

    this.underlay.toggleOverlay(true);
    // this.setGlobalListeners();
    await setAuthorPromise;
    this.underlay.insert();
  }

  public close(e?: MouseEvent) {
    if(e) {
      cancelEvent(e);
    }

    if(this.navigationItem) {
      appNavigationController.removeItem(this.navigationItem);
    }

    this.underlay.destroyAvatarMiddleware();

    this.streamPlayer.classList.toggle('hidden', true);
    this.underlay.toggleWholeActive(false);

    const promise = new Promise<void>((resolve) => {
      const delay = liteMode.isAvailable('animations') ? 200 : 0;
      setTimeout(resolve, delay);
    });

    if((window as any).appMediaViewer === this) {
      (window as any).appMediaViewer = undefined;
    }

    promise.finally(() => {
      this.underlay.remove();
    });

    liveStreamController.leaveLiveStream();
    return promise;
  }

  private createStreamPlayer() {
    const player = document.createElement('div');
    player.classList.add('stream-player');

    this.video1 = document.createElement('video');
    this.video1.classList.add('stream-player-video');

    this.video2 = document.createElement('video');
    this.video2.classList.add('stream-player-video');

    const controlsBar = document.createElement('div');
    controlsBar.classList.add('stream-player-controls');

    const controlsLeft = document.createElement('div');
    controlsLeft.classList.add('stream-player-controls-group');

    const controlsRight = document.createElement('div');
    controlsRight.classList.add('stream-player-controls-group');

    this.liveBadge = document.createElement('div');
    this.liveBadge.classList.add('stream-player-live-badge');
    this.liveBadge.innerText = 'Live'; // _i18n(liveBadge, 'LiveStream.Status.Live');

    const soundBtn = ButtonIcon('volume_up', {noRipple: true});

    this.watchingCounter = document.createElement('div');
    this.watchingCounter.classList.add('stream-player-watching-counter');
    this.watchingCounter.innerText = '28,395 watching';

    controlsLeft.append(this.liveBadge, soundBtn, this.watchingCounter);

    const pipBtn = ButtonIcon('pip', {noRipple: true});
    const fullscreenBtn = ButtonIcon('fullscreen', {noRipple: true});

    controlsRight.append(pipBtn, fullscreenBtn);

    controlsBar.append(controlsLeft, controlsRight);

    player.append(this.video1, this.video2, this.createLoading(), controlsBar);

    return player;
  }

  private createLoading() {
    this.loadingContainer = document.createElement('div');
    this.loadingContainer.classList.add('stream-player-loading');

    this.thumb = document.createElement('div');
    this.thumb.classList.add('stream-player-loading-thumb');

    const thumbBlur = document.createElement('div');
    thumbBlur.classList.add('stream-player-loading-thumb-blur');

    this.loadingContainer.append(this.thumb, thumbBlur, this.loadingAnimation.canvas);

    return this.loadingContainer;
  }
}
