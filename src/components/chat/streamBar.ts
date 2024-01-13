import {_i18n} from '../../lib/langPack';
import {AppManagers} from '../../lib/appManagers/managers';
import {GroupCall} from '../../layer';
import ListenerSetter from '../../helpers/listenerSetter';
import rootScope from '../../lib/rootScope';
import Chat from './chat';

export default class ChatStreamBar {
  public container: HTMLDivElement;
  private watchingCounter: HTMLDivElement;

  private callId?: string | number;

  constructor(
    private chat: Chat,
    private managers: AppManagers
  ) {
    const listenerSetter = new ListenerSetter();

    listenerSetter.add(rootScope)('group_call_update', async(groupCall) => {
      if(!this.callId) {
        this.callId = await this.getCallIdByPeerId(this.chat.peerId);
      }

      await this.updateCall(groupCall);
    });

    this.container = document.createElement('div');
    this.container.classList.add('sidebar-header', 'stream-bar');

    const gradient = document.createElement('div');
    gradient.classList.add('stream-bar-gradient');

    const plate = document.createElement('div');
    plate.id = 'stream-bar-plate';
    plate.classList.add('stream-bar-plate');
    gradient.append(plate);

    const line = document.createElement('div');
    line.classList.add('stream-bar-line');

    const liveStreamTitle = document.createElement('div');
    liveStreamTitle.classList.add('stream-bar-title');
    // _i18n(liveStreamTitle, 'LiveStream.Status.Title');
    _i18n(liveStreamTitle, 'PeerInfo.Action.LiveStream');

    this.watchingCounter = document.createElement('div');
    this.watchingCounter.classList.add('stream-bar-viewers');

    const liveSteamText = document.createElement('div');
    liveSteamText.classList.add('stream-bar-text');
    liveSteamText.append(liveStreamTitle, this.watchingCounter);

    const joinBtn = document.createElement('button');
    joinBtn.classList.add('stream-bar-button');
    // _i18n(joinBtn, 'LiveStream.Action.Join');
    joinBtn.innerText = 'Join';

    plate.append(line, liveSteamText, joinBtn);
    this.container.append(gradient);
  }

  public async finishPeerChange(peerId: PeerId) {
    this.callId = await this.getCallIdByPeerId(peerId);

    const call = this.callId ?
      await this.managers.appGroupCallsManager.getGroupCallFull(this.callId) :
      undefined;

    return () => {
      this.updateCall(call);
    }
  }

  public cleanup() {
    if(!this.chat.peerId) {
      this.hide();
    }
  }

  private async getCallIdByPeerId(peerId: PeerId) {
    if(!peerId || !peerId.isAnyChat()) return;

    const chatFull = await this.managers.appProfileManager.getChatFull(peerId.toChatId());
    return chatFull?.call?.id;
  }

  private async updateCall(groupCall?: GroupCall) {
    if(this.callId !== groupCall?.id) return

    const isLiveStream = groupCall?._ === 'groupCall' && groupCall.pFlags.rtmp_stream
    if(groupCall && isLiveStream) {
      const participantsCount = Math.max(0, groupCall.participants_count);

      this.container.classList.remove('hide');
      // _i18n(this.watchingCounter, 'LiveStream.Status.Participants', [groupCall.participants_count]);
      this.watchingCounter.innerText = `${participantsCount} watching`;
    } else {
      this.hide();
    }
  }

  private hide() {
    this.container.classList.add('hide');
    this.callId = undefined;
  }
}
