import {_i18n} from '../../lib/langPack';
import {AppManagers} from '../../lib/appManagers/managers';
import {GroupCall} from '../../layer';
import ListenerSetter from '../../helpers/listenerSetter';
import rootScope from '../../lib/rootScope';
import Chat from './chat';

export default class ChatStreamBar {
  public container: HTMLDivElement;
  private watchingCounter: HTMLDivElement;

  constructor(
    private chat: Chat,
    private managers: AppManagers
  ) {
    const listenerSetter = new ListenerSetter();

    listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
      this.updateCall(groupCall);
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
    const chatFull = peerId.isAnyChat() ?
      await this.managers.appProfileManager.getChatFull(peerId.toChatId()) :
      undefined;
    const call = chatFull?.call?.id ?
      await this.managers.appGroupCallsManager.getGroupCallFull(chatFull.call.id) :
      undefined;

    return () => {
      this.updateCall(call);
    }
  }

  public cleanup() {
    if(!this.chat.peerId) {
      this.container.classList.add('hide');
    }
  }

  private updateCall(groupCall?: GroupCall) {
    const isLiveStream = groupCall?._ === 'groupCall' && this.chat.isBroadcast // && groupCall.pFlags.rtmp_stream
    if(groupCall && isLiveStream) {
      this.container.classList.remove('hide');
      // _i18n(this.watchingCounter, 'LiveStream.Status.Participants', [groupCall.participants_count]);
      this.watchingCounter.innerText = `${groupCall.participants_count} watching`;
    } else {
      this.container.classList.add('hide');
    }
  }
}
