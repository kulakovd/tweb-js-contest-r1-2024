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
import {attachClickEvent} from '../helpers/dom/clickEvent';
import ButtonMenuToggle from './buttonMenuToggle';
import PopupElement from './popups';
import PopupLiveStreamSettings from './popups/liveStreamSettings';
import {AppImManager} from '../lib/appManagers/appImManager';
import {AppManagers} from '../lib/appManagers/managers';
import LiveStreamCreds from './groupCall/liveStreamCreds';
import {_i18n, I18n} from '../lib/langPack';
import {ButtonMenuItemOptionsVerifiable} from './buttonMenu';
import VolumeSelector from './volumeSelector';
import appMediaPlaybackController, {AppMediaPlaybackController} from './appMediaPlaybackController';
import {PopupOutputDevice} from './popups/outputDevice';

const VIDEO_RATIO = 16 / 9; // CSS is not reliable
const ALLOWED_TIME_DIFF = 0.1;

export default class LiveStreamViewer {
  protected navigationItem: NavigationItem;
  protected underlay: AppMediaViewerUnderlay<'forward'>;

  private streamPlayer: HTMLDivElement;
  private loadingContainer: HTMLDivElement;
  private thumb: HTMLDivElement;
  private oopsContainer?: HTMLDivElement;

  private liveBadge: HTMLDivElement;
  private watchingCounter: HTMLDivElement;

  private video: HTMLVideoElement;

  private isPlaying: boolean = false;

  private resizeObserver: ResizeObserver;
  private readonly listenerSetter = new ListenerSetter();

  private releaseSingleMedia: ReturnType<AppMediaPlaybackController['setSingleMedia']>;

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

  constructor(
    private peerId: PeerId,
    connectionPromise: Promise<void>,
    private managers: AppManagers,
    private appImManager: AppImManager
  ) {
    this.listenerSetter.add(rootScope)('group_call_update', this.updateCall.bind(this));

    this.underlay = new AppMediaViewerUnderlay(['forward']);
    this.underlay.onClick = this.onClick;
    this.underlay.onClose = this.close.bind(this);
    this.underlay.setListeners();

    this.streamPlayer = this.createStreamPlayer();
    this.underlay.append(this.streamPlayer);

    this.resize();
    this.resizeObserver = new ResizeObserver(this.resize.bind(this));
    this.resizeObserver.observe(this.streamPlayer);

    this.loadingAnimation.runInfinite();

    this.video.addEventListener('enterpictureinpicture', () => {
      this.onPictureInPictureChange(true);
    });

    this.video.addEventListener('leavepictureinpicture', () => {
      this.onPictureInPictureChange(false);
    });

    connectionPromise.then(() => {
      liveStreamController.liveStream.addEventListener('oops', this.showOops.bind(this));

      this.updateCall(liveStreamController.groupCall);
      this.play();
    });
  }

  private async showOops() {
    const chatId = this.peerId.toChatId();
    const hasRight = await this.managers.appChatsManager.hasRights(chatId, 'manage_call');

    if(!hasRight) return;

    this.oopsContainer = document.createElement('div');
    this.oopsContainer.classList.add('stream-player-oops-container', 'night');

    const title = document.createElement('div');
    title.classList.add('stream-player-oops-title');
    _i18n(title, 'LiveStream.MediaViewer.Failed.Title');

    const explanation = document.createElement('div');
    explanation.classList.add('stream-player-oops-explanation');
    _i18n(explanation, 'LiveStream.MediaViewer.Failed.Description');

    const textWrapper = document.createElement('div');
    textWrapper.classList.add('stream-player-oops-text-wrapper');
    textWrapper.append(title, explanation);

    const creds = new LiveStreamCreds(this.peerId, this.managers);
    await creds.promise;

    this.oopsContainer.append(textWrapper, creds.container);
    this.streamPlayer.append(this.oopsContainer);
  }

  private hideOops() {
    this.oopsContainer?.remove();
  }

  private resize() {
    const width = this.streamPlayer.clientWidth;
    const height = Math.round(width / VIDEO_RATIO);
    this.streamPlayer.style.height = `${height}px`;
  }

  private onPictureInPictureChange = (pip: boolean) => {
    this.streamPlayer.classList.toggle('hidden', pip);

    this.underlay.toggleWholeActive(!pip);
    this.underlay.toggleOverlay(!pip);

    if(!pip) {
      this.updateView();
      this.video.play();
    }
  }

  private toggleFullScreen() {
    if(!document.fullscreenElement) {
      this.streamPlayer.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  private updateCall(groupCall?: GroupCall) {
    if(liveStreamController?.groupCall?.id !== groupCall.id) return;

    if(groupCall?._ === 'groupCall') {
      const participantsCount = Math.max(0, groupCall.participants_count);

      _i18n(this.watchingCounter, 'LiveStream.Bar.Watching', [participantsCount]);
    } else {
      this.close();
    }
  }

  private async play() {
    this.releaseSingleMedia = appMediaPlaybackController.setSingleMedia(this.video);
    const liveStream = liveStreamController.liveStream;

    if(!liveStream) {
      return;
    }

    this.video.src = liveStream.mediaSrc;

    this.video.addEventListener('timeupdate', () => {
      this.setThumbFromFrame(this.video);
    });

    this.video.addEventListener('waiting', () => {
      this.onStopPlaying();
    });

    this.video.addEventListener('playing', () => {
      this.onStartPlaying();
    });

    await liveStream.initStream();

    liveStream.addEventListener('timeupdate', (t) => {
      if(Math.abs(this.video.currentTime - t) > ALLOWED_TIME_DIFF) {
        this.video.currentTime = t;
      }
    });
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
    if(this.isPlaying) {
      this.hideOops();
    }
  }

  onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if(target.tagName === 'A') return;

    cancelEvent(e);
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
    if(url === 'data:,') return; // blank frame
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

  public async open() {
    const setAuthorPromise = this.underlay.setAuthorInfo(this.peerId, I18n.format('LiveStream.MediaViewer.Streaming', true));

    const lastFrame = liveStreamController.liveStream?.getLastFrame();
    if(lastFrame) {
      this.setThumbFromUrl(lastFrame);
    } else {
      await this.setThumbFromAvatar(this.peerId);
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

  public close(discard?: boolean) {
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

    this.resizeObserver.disconnect();
    this.releaseSingleMedia?.();

    liveStreamController.leaveLiveStream(discard);
    return promise;
  }

  private menuButtons: ButtonMenuItemOptionsVerifiable[] = [
    {
      icon: 'volume_up',
      text: 'LiveStream.MediaViewer.Menu.Option.OutputDevice',
      onClick: () => {
        PopupElement.createPopup(PopupOutputDevice);
      }
    },
    {
      icon: 'radioon',
      text: 'LiveStream.MediaViewer.Menu.Option.StartRecording',
      onClick: () => {}
    },
    {
      icon: 'settings',
      text: 'LiveStream.MediaViewer.Menu.Option.StreamSettings',
      onClick: () => {
        PopupElement.createPopup(PopupLiveStreamSettings, true, this.peerId, this.appImManager);
      }
    },
    {
      icon: 'crossround',
      danger: true,
      text: 'LiveStream.MediaViewer.Menu.Option.EndLiveStream',
      onClick: () => {
        this.close(true);
      }
    }
  ];

  private createStreamPlayer() {
    const player = document.createElement('div');
    player.classList.add('stream-player', 'default');

    this.video = document.createElement('video');
    this.video.classList.add('stream-player-video');
    this.video.setAttribute('autoplay', '');

    const controlsBar = document.createElement('div');
    controlsBar.classList.add('stream-player-controls');

    const controlsLeft = document.createElement('div');
    controlsLeft.classList.add('stream-player-controls-group');

    const controlsRight = document.createElement('div');
    controlsRight.classList.add('stream-player-controls-group');

    this.liveBadge = document.createElement('div');
    this.liveBadge.classList.add('stream-player-live-badge');
    _i18n(this.liveBadge, 'LiveStream.MediaViewer.Live');

    const volumeSelector = new VolumeSelector(this.listenerSetter);

    volumeSelector.btn.classList.remove('btn-icon');

    this.watchingCounter = document.createElement('div');
    this.watchingCounter.classList.add('stream-player-watching-counter');

    controlsLeft.append(this.liveBadge, volumeSelector.btn, this.watchingCounter);

    const pipBtn = ButtonIcon('pip', {noRipple: true});

    attachClickEvent(pipBtn, () => {
      this.video.requestPictureInPicture();
    });

    const fullScreenBtn = ButtonIcon('fullscreen', {noRipple: true});

    attachClickEvent(fullScreenBtn, () => {
      this.toggleFullScreen();
    });

    controlsRight.append(pipBtn, fullScreenBtn);

    controlsBar.append(controlsLeft, controlsRight);

    player.append(this.video, this.createLoading(), controlsBar);

    const chatId = this.peerId.toChatId();
    this.managers.appChatsManager.hasRights(chatId, 'manage_call').then((hasRights) => {
      if(hasRights) {
        const btnMore = ButtonMenuToggle({
          listenerSetter: this.listenerSetter,
          direction: 'top-left',
          buttons: this.menuButtons
        });

        controlsRight.prepend(btnMore);
      }
    });

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
