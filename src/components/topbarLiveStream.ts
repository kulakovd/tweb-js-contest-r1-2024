import {GroupCall} from '../layer';
import {_i18n} from '../lib/langPack';
import ListenerSetter from '../helpers/listenerSetter';
import rootScope from '../lib/rootScope';
import {AppManagers} from '../lib/appManagers/managers';
import liveStreamController from '../lib/calls/liveStreamController';
import SetTransition from './singleTransition';

export class TopbarLiveStream {
  public container: HTMLElement;

  private chatName: HTMLDivElement;
  private watchingCounter: HTMLDivElement;

  constructor(
    private managers: AppManagers
  ) {
    const listenerSetter = new ListenerSetter();

    listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
      this.updateCall(groupCall);
    });

    listenerSetter.add(liveStreamController)('connect', (groupCall) => {
      this.updateCall(groupCall, true);
    });

    listenerSetter.add(liveStreamController)('disconnect', () => {
      this.hide();
    });

    const live = document.createElement('div');
    live.classList.add('topbar-live-stream-live');
    _i18n(live, 'LiveStream.MediaViewer.Live');

    const center = document.createElement('div');
    center.classList.add('topbar-live-stream-center');

    this.chatName = document.createElement('div');
    this.chatName.classList.add('topbar-live-stream-chat-name');
    center.append(this.chatName);

    this.watchingCounter = document.createElement('div');
    this.watchingCounter.classList.add('topbar-live-stream-watching');
    center.append(this.watchingCounter);

    this.container = document.createElement('div');
    this.container.classList.add('topbar-live-stream-container');
    this.container.append(live, center);

    document.getElementById('column-center').prepend(this.container);
  }

  private async getChatName(peerId: PeerId) {
    if(!peerId || !peerId.isAnyChat()) return;

    const chatFull = await this.managers.appChatsManager.getChat(peerId.toChatId());
    return chatFull?.title;
  }

  private async updateCall(groupCall?: GroupCall, isChangingStream = false, isClosed = false) {
    const currentCallId = liveStreamController.groupCall?.id;
    if(currentCallId !== groupCall?.id || !liveStreamController.connected) return;

    const isLiveStream = groupCall?._ === 'groupCall' && groupCall.pFlags.rtmp_stream
    if(groupCall && isLiveStream) {
      const participantsCount = Math.max(0, groupCall.participants_count);

      this.container.classList.remove('hide');
      _i18n(this.watchingCounter, 'LiveStream.Bar.Watching', [participantsCount]);

      this.chatName.textContent = await this.getChatName(liveStreamController.chatId.toPeerId(true));

      this.show(isChangingStream);
    } else {
      this.hide();
    }
  }

  private show(isChangingStream = false) {
    if((!document.body.classList.contains('is-calling') || isChangingStream)) {
      SetTransition({
        element: document.body,
        className: 'is-live-stream-connected',
        forwards: true,
        duration: 250
      });
    }
  }

  private hide() {
    SetTransition({
      element: document.body,
      className: 'is-live-stream-connected',
      forwards: false,
      duration: 250
    });
  }
}
