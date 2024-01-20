import {PhoneGroupCallStreamRtmpUrl} from '../../layer';
import ButtonIcon from '../buttonIcon';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import Icon from '../icon';
import {AppManagers} from '../../lib/appManagers/managers';
import {copyTextToClipboard} from '../../helpers/clipboard';
import {toast} from '../toast';
import {_i18n, I18n} from '../../lib/langPack';

export default class LiveStreamCreds {
  public container: HTMLDivElement;

  private streamUrl: string;
  private streamKey: string;

  private streamUrlDiv: HTMLDivElement;
  private streamKeyDiv: HTMLDivElement;

  private hiddenText = '••••••••••••••••••••';

  private keyVisible: boolean = false;

  public promise: Promise<void>;

  constructor(private peerId: PeerId, private managers: AppManagers) {
    this.container = document.createElement('div');
    this.promise = this.construct();
  }

  private async construct() {
    const [streamUrlCred, streamUrlValue] = this.constructCred('url');
    const [streamKeyCred, streamKeyValue] = this.constructCred('key');

    this.streamUrlDiv = streamUrlValue;
    this.streamKeyDiv = streamKeyValue;

    this.container.append(streamUrlCred, streamKeyCred);

    const rtmp = await this.managers.appGroupCallsManager.getGroupCallStreamRtmpUrl(this.peerId);
    this.updateWith(rtmp);
  }

  public updateWith(rtmp: PhoneGroupCallStreamRtmpUrl.phoneGroupCallStreamRtmpUrl) {
    this.streamUrl = rtmp.url;
    this.streamKey = rtmp.key;
    this.streamUrlDiv.innerText = rtmp.url;
    this.streamKeyDiv.innerText = this.hiddenText;
  }

  private constructCred(t: 'url' | 'key') {
    const cred = document.createElement('div');
    cred.classList.add('popup-live-stream-settings-cred');

    const credIcon = t === 'url' ?
      Icon('link', 'popup-live-stream-settings-cred-icon') :
      Icon('lock', 'popup-live-stream-settings-cred-icon');

    const value = document.createElement('div');
    value.classList.add('popup-live-stream-settings-cred-value');

    const label = document.createElement('div');
    label.classList.add('popup-live-stream-settings-cred-label');
    if(t === 'url') {
      _i18n(label, 'LiveStream.PopUp.Stream.ServerURL');
    } else {
      _i18n(label, 'LiveStream.PopUp.Stream.StreamKey');
      label.append(this.constructEyeBtn());
    }

    const wrapper = document.createElement('div');
    wrapper.classList.add('popup-live-stream-settings-cred-wrapper');
    wrapper.append(value, label);

    const copyBtn = ButtonIcon('copy');

    attachClickEvent(cred, () => {
      const text = t === 'url' ? this.streamUrl : this.streamKey;
      copyTextToClipboard(text);
      if(t === 'url') {
        toast(I18n.format('LiveStream.PopUp.Stream.URLCopied', true));
      } else {
        toast(I18n.format('LiveStream.PopUp.Stream.KeyCopied', true));
      }
    });

    cred.append(credIcon, wrapper, copyBtn);
    return [cred, value];
  }

  private constructEyeBtn() {
    const eyeBtn = ButtonIcon('eye1 popup-live-stream-settings-eye');
    attachClickEvent(eyeBtn, () => {
      if(this.keyVisible) {
        this.streamKeyDiv.innerText = this.hiddenText;
      } else {
        this.streamKeyDiv.innerText = this.streamKey || '';
      }
      this.keyVisible = !this.keyVisible;
    });
    return eyeBtn;
  }
}
