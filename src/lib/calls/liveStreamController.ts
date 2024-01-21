import {MOUNT_CLASS_TO} from '../../config/debug';
import getGroupCallAudioAsset from '../../components/groupCall/getAudioAsset';
import {GroupCall} from '../../layer';
import LiveStreamInstance from './liveStreamInstance';
import {AppManagers} from '../appManagers/managers';
import {nextRandomUint} from '../../helpers/random';

export class LiveStreamController {
  private audioAsset: ReturnType<typeof getGroupCallAudioAsset>;
  public groupCall?: GroupCall;
  public liveStream?: LiveStreamInstance;
  private managers: AppManagers;

  private ssrc: number | undefined;

  public construct(managers: AppManagers) {
    this.managers = managers;
    this.audioAsset = getGroupCallAudioAsset();
  }

  public async joinLiveStream(groupCallId: GroupCall['id']) {
    this.groupCall = await this.managers.appGroupCallsManager.getGroupCallFull(groupCallId);

    if(this.groupCall._ !== 'groupCall') return;

    this.liveStream = new LiveStreamInstance(this.managers, this.groupCall);
    this.ssrc = nextRandomUint(32);

    const params = {
      _: 'dataJSON',
      data: JSON.stringify({
        'fingerprints': [],
        'pwd': '',
        'ssrc': this.ssrc,
        'ssrc-groups': [],
        'ufrag': ''
      })
    } as const;

    await this.managers.appGroupCallsManager.joinGroupCall(
      this.groupCall.id,
      params,
      {
        type: 'main'
      }
    );

    this.audioAsset.playSound('group_call_start.mp3');
  }

  public async leaveLiveStream(discard?: boolean) {
    if(!this.groupCall) return;

    this.liveStream?.disconnect();
    this.liveStream = undefined;
    await this.managers.appGroupCallsManager.hangUp(this.groupCall.id, discard ? true : this.ssrc);
    this.audioAsset.playSound('group_call_end.mp3');
  }
}

const liveStreamController = new LiveStreamController();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.liveStreamController = liveStreamController);
export default liveStreamController;
