import {IS_MOBILE_SAFARI} from '../environment/userAgent';
import appNavigationController, {NavigationItem} from './appNavigationController';
import cancelEvent from '../helpers/dom/cancelEvent';
import liteMode from '../helpers/liteMode';
import {AppMediaViewerUnderlay} from './appMediaViewerUnderlay';
import ButtonIcon from './buttonIcon';
import {ShineAnimationCanvas} from './shineAnimationCanvas';
import {getMiddleware} from '../helpers/middleware';
import rootScope from '../lib/rootScope';
import setAttachmentSize from '../helpers/setAttachmentSize';
import {Photo, PhotoSize} from '../layer';
import getMediaThumbIfNeeded from '../helpers/getStrippedThumbIfNeeded';
import appDownloadManager from '../lib/appManagers/appDownloadManager';

export default class LiveStreamViewer {
  protected navigationItem: NavigationItem;
  protected underlay: AppMediaViewerUnderlay<'forward'>;

  private liveBadge: HTMLDivElement;
  private thumb: HTMLDivElement;
  private thumbBlur: HTMLDivElement;
  private watchingCounter: HTMLDivElement;

  private middlewareHelper: ReturnType<typeof getMiddleware>;
  private avatarMiddlewareHelper: ReturnType<typeof getMiddleware>;

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

  constructor() {
    this.middlewareHelper = getMiddleware();

    this.underlay = new AppMediaViewerUnderlay(['forward']);
    this.underlay.onClick = this.onClick;
    this.underlay.onClose = this.close.bind(this);
    this.underlay.setListeners();

    const streamPlayer = this.createStreamPlayer();
    this.underlay.append(streamPlayer);

    this.loadingAnimation.runInfinite();
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
    this.thumbBlur.classList.toggle('hidden', this.isPlaying);
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
    this.close();
  }

  private async setThumb(fromId: PeerId | string) {
    // let thumbPromise = Promise.resolve();
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

  public async open({fromId, userCaption}: {fromId: PeerId | string, userCaption: string}) {
    const setAuthorPromise = this.underlay.setAuthorInfo(fromId, userCaption);
    this.setThumb(fromId);

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

    return promise;
  }

  private createStreamPlayer() {
    const player = document.createElement('div');
    player.classList.add('stream-player');

    const video = document.createElement('video');
    video.classList.add('stream-player-video');

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

    player.append(video, this.createLoading(), controlsBar);

    return player;
  }

  private createLoading() {
    const loading = document.createElement('div');
    loading.classList.add('stream-player-loading');

    this.thumb = document.createElement('div');
    this.thumb.classList.add('stream-player-loading-thumb');

    this.thumbBlur = document.createElement('div');
    this.thumbBlur.classList.add('stream-player-loading-thumb-blur');

    loading.append(this.thumb, this.thumbBlur, this.loadingAnimation.canvas);

    return loading;
  }
}
