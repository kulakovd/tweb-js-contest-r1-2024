import PopupElement from './index';
import Icon from '../icon';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import {AppImManager} from '../../lib/appManagers/appImManager';
import ListenerSetter from '../../helpers/listenerSetter';
import rootScope from '../../lib/rootScope';
import liveStreamController from '../../lib/calls/liveStreamController';
import LiveStreamCreds from '../groupCall/liveStreamCreds';

export default class PopupLiveStreamSettings extends PopupElement {
  private streamCreds: LiveStreamCreds;

  constructor(
    private streamStarted: boolean,
    private peerId: PeerId,
    private appImManager: AppImManager
  ) {
    super('popup-live-stream-settings', {
      closable: true,
      overlayClosable: true,
      body: true,
      title: true,
      withConfirm: true,
      footer: true
    });

    const listenerSetter = new ListenerSetter();
    listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
      if(liveStreamController.groupCall.id !== groupCall.id) return;
      if(groupCall._ === 'groupCallDiscarded') {
        this.hide();
      }
    });

    this.construct();
  }

  private async construct() {
    this.footer.append(this.btnConfirm);

    if(this.streamStarted) {
      this.title.innerText = 'Stream settings';
      this.btnConfirm.innerText = 'End live stream';
      this.btnConfirm.classList.add('btn-color-danger');
      attachClickEvent(this.btnConfirm, async() => {
        this.hide();
        await liveStreamController.leaveLiveStream(true);
      });
    } else {
      this.title.innerText = 'Stream with...';
      this.btnConfirm.innerText = 'Start streaming';
      attachClickEvent(this.btnConfirm, async() => {
        this.hide();
        const call = await this.managers.appGroupCallsManager.startLiveStream(this.peerId);
        await this.appImManager.joinGroupCall(this.peerId, call.id);
      });
    }

    const instructions = document.createElement('div');
    instructions.classList.add('popup-live-stream-settings-instructions');
    instructions.innerText = 'To stream video with another app, enter these Server URL and Stream Key in your streaming app. Software encoding recommended (×264 in OBS).';

    this.streamCreds = new LiveStreamCreds(this.peerId, this.managers);

    this.btnConfirm.classList.add('popup-live-stream-settings-button');
    this.footer.append(this.btnConfirm);

    if(this.streamStarted) {
      const revokeKeyBtn = this.constructRevokeKeyBtn();
      this.body.prepend(revokeKeyBtn);
    } else {
      const yetAnotherInstructions = document.createElement('div');
      yetAnotherInstructions.classList.add('popup-live-stream-settings-instructions');
      yetAnotherInstructions.innerText = 'Once you start broadcasting in your streaming app, click Start Streaming below.';
      this.body.prepend(yetAnotherInstructions);
    }

    this.body.prepend(instructions, this.streamCreds.container);
    this.show();
  }

  private constructRevokeKeyBtn() {
    const revokeIcon = Icon('rotate_left', 'popup-live-stream-settings-revoke-icon');
    const revokeKeyBtn = document.createElement('button');
    revokeKeyBtn.className = 'popup-live-stream-settings-revoke btn-primary btn-transparent danger';
    revokeKeyBtn.append(revokeIcon, 'Revoke Stream Key');
    attachClickEvent(revokeKeyBtn, async() => {
      const rtmp = await this.managers.appGroupCallsManager.getGroupCallStreamRtmpUrl(this.peerId, true);
      this.streamCreds.updateWith(rtmp);
    });
    return revokeKeyBtn;
  }
}
