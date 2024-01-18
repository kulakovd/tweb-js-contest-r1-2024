import {getMiddleware, MiddlewareHelper} from '../helpers/middleware';
import {avatarNew} from './avatarNew';
import ButtonIcon from './buttonIcon';
import wrapPeerTitle from './wrappers/peerTitle';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import {NULL_PEER_ID} from '../lib/mtproto/mtproto_config';
import replaceContent from '../helpers/dom/replaceContent';
import overlayCounter from '../helpers/overlayCounter';
import animationIntersector from './animationIntersector';
import {attachClickEvent} from '../helpers/dom/clickEvent';

const MEDIA_VIEWER_CLASSNAME = 'media-viewer';

// TODO Use this in appMediaViewerBase
export class AppMediaViewerUnderlay<
  ButtonsAdditionType extends string
> {
  public wholeDiv: HTMLElement;
  protected overlaysDiv: HTMLElement;
  public author: {
    avatarEl: ReturnType<typeof avatarNew>,
    avatarMiddlewareHelper?: MiddlewareHelper,
    container: HTMLElement,
    nameEl: HTMLElement,
    caption: HTMLElement
  } = {} as any;
  public content: {[k in 'main' | 'container' | 'media']: HTMLElement} = {} as any;
  public buttons: {[k in 'close' | 'mobile-close' | ButtonsAdditionType]: HTMLElement} = {} as any;
  public topbar: HTMLElement;

  public pageEl = document.getElementById('page-chats') as HTMLDivElement;

  public middlewareHelper: MiddlewareHelper;
  public closing: boolean;

  public onClick?: (e: MouseEvent) => void;
  public onClose?: () => void;

  constructor(
    topButtons: Array<keyof AppMediaViewerUnderlay<ButtonsAdditionType>['buttons']>
  ) {
    this.middlewareHelper = getMiddleware();

    this.wholeDiv = document.createElement('div');
    this.wholeDiv.classList.add(MEDIA_VIEWER_CLASSNAME + '-whole');

    this.overlaysDiv = document.createElement('div');
    this.overlaysDiv.classList.add('overlays');

    const mainDiv = document.createElement('div');
    mainDiv.classList.add(MEDIA_VIEWER_CLASSNAME);

    const topbar = this.topbar = document.createElement('div');
    topbar.classList.add(MEDIA_VIEWER_CLASSNAME + '-topbar', MEDIA_VIEWER_CLASSNAME + '-appear');

    const topbarLeft = document.createElement('div');
    topbarLeft.classList.add(MEDIA_VIEWER_CLASSNAME + '-topbar-left');

    this.buttons['mobile-close'] = ButtonIcon('close', {onlyMobile: true});

    // * author
    this.author.container = document.createElement('div');
    this.author.container.classList.add(MEDIA_VIEWER_CLASSNAME + '-author', 'no-select');
    const authorRight = document.createElement('div');

    this.author.nameEl = document.createElement('div');
    this.author.nameEl.classList.add(MEDIA_VIEWER_CLASSNAME + '-name');

    this.author.caption = document.createElement('div');
    this.author.caption.classList.add(MEDIA_VIEWER_CLASSNAME + '-date');

    authorRight.append(this.author.nameEl, this.author.caption);

    this.author.container.append(authorRight);

    // * buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.classList.add(MEDIA_VIEWER_CLASSNAME + '-buttons');

    topButtons.concat(['close']).forEach((name) => {
      const button = ButtonIcon(name as Icon, {noRipple: true});
      this.buttons[name] = button;
      buttonsDiv.append(button);
    });

    topbarLeft.append(this.buttons['mobile-close'], this.author.container);
    topbar.append(topbarLeft, buttonsDiv);

    // * content
    this.content.main = document.createElement('div');
    this.content.main.classList.add(MEDIA_VIEWER_CLASSNAME + '-content');

    this.content.container = document.createElement('div');
    this.content.container.classList.add(MEDIA_VIEWER_CLASSNAME + '-container');

    this.content.media = document.createElement('div');
    this.content.media.classList.add(MEDIA_VIEWER_CLASSNAME + '-media');

    this.content.container.append(this.content.media);

    this.content.main.append(this.content.container);
    mainDiv.append(this.content.main);
    this.overlaysDiv.append(mainDiv);
    // * overlays end

    this.wholeDiv.append(this.overlaysDiv, this.topbar);

    // * constructing html end
  }

  public setListeners() {
    [this.buttons.close, this.buttons['mobile-close']].forEach((el) => {
      attachClickEvent(el, () => this.onClose());
    });

    this.wholeDiv.addEventListener('click', this.onClick);
  }

  public toggleWholeActive(active: boolean) {
    if(active) {
      this.wholeDiv.classList.add('active');
    } else {
      this.wholeDiv.classList.add('backwards');
      setTimeout(() => {
        this.wholeDiv.classList.remove('active');
      }, 0);
    }
  }

  public toggleOverlay(active: boolean) {
    overlayCounter.isDarkOverlayActive = active;
    animationIntersector.checkAnimations2(active);
  }

  public setAuthorInfo(fromId: PeerId | string, caption: string) {
    const isPeerId = fromId.isPeerId();
    let wrapTitlePromise: Promise<HTMLElement> | HTMLElement;
    if(isPeerId) {
      wrapTitlePromise = wrapPeerTitle({
        peerId: fromId as PeerId,
        dialog: false,
        onlyFirstName: false,
        plainText: false
      })
    } else {
      const title = wrapTitlePromise = document.createElement('span');
      title.append(wrapEmojiText(fromId));
      title.classList.add('peer-title');
    }

    const oldAvatar = this.author.avatarEl;
    const oldAvatarMiddlewareHelper = this.author.avatarMiddlewareHelper;
    const newAvatar = this.author.avatarEl = avatarNew({
      middleware: (this.author.avatarMiddlewareHelper = this.middlewareHelper.get().create()).get(),
      size: 44,
      peerId: fromId as PeerId || NULL_PEER_ID,
      peerTitle: isPeerId ? undefined : '' + fromId
    });

    newAvatar.node.classList.add(MEDIA_VIEWER_CLASSNAME + '-userpic');

    return Promise.all([
      newAvatar.readyThumbPromise,
      wrapTitlePromise
    ]).then(([_, title]) => {
      replaceContent(this.author.caption, caption);
      replaceContent(this.author.nameEl, title);

      if(oldAvatar?.node && oldAvatar.node.parentElement) {
        oldAvatar.node.replaceWith(this.author.avatarEl.node);
      } else {
        this.author.container.prepend(this.author.avatarEl.node);
      }

      if(oldAvatar) {
        oldAvatar.node.remove();
        oldAvatarMiddlewareHelper.destroy();
      }
    });
  }

  append(wholeDiv: HTMLElement) {
    this.wholeDiv.append(wholeDiv);
  }

  public insert() {
    if(!this.wholeDiv.parentElement) {
      this.pageEl.insertBefore(this.wholeDiv, document.getElementById('main-columns'));
      void this.wholeDiv.offsetLeft; // reflow
    }

    this.toggleWholeActive(true);
  }

  public destroyAvatarMiddleware() {
    this.author.avatarMiddlewareHelper?.destroy();
  }

  public destroyMiddlewareHelper() {
    this.middlewareHelper.destroy();
  }

  public remove() {
    this.wholeDiv.remove();
    this.toggleOverlay(false);
    this.destroyMiddlewareHelper();
  }
}
