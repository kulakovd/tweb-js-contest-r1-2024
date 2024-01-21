import PopupElement from './index';
import {_i18n, I18n} from '../../lib/langPack';
import Icon from '../icon';
import liveStreamController from '../../lib/calls/liveStreamController';

export class PopupOutputDevice extends PopupElement {
  constructor() {
    super('popup-output-device', {
      closable: true,
      overlayClosable: true,
      body: true,
      title: true,
      buttons: [{
        langKey: 'OK',
        callback: () => {
          this.hide();
        }
      }],
      preventNightMode: true
    });

    const enumerateDevicesSupported = navigator.mediaDevices && navigator.mediaDevices.enumerateDevices
    const sinkIdSupported = AudioContext.prototype.hasOwnProperty('setSinkId');
    if(!enumerateDevicesSupported || !sinkIdSupported) {
      // Choosing Audio Output Device not supported
      return;
    }

    this.construct();
  }

  private async construct() {
    const devices = await this.getDevices();
    const currentDevice = liveStreamController?.liveStream?.audioOutputDeviceId;

    _i18n(this.title, 'LiveStream.PopUp.OutputDevice.Title');

    const defaultDevice = this.constructRadioButton('default', currentDevice);
    const radioButtons = devices.map((d) => this.constructRadioButton(d, currentDevice)).filter(Boolean);

    this.body.append(defaultDevice, ...radioButtons);

    this.show();
  }

  private constructRadioButton(device: MediaDeviceInfo | 'default', currentDevice: string) {
    const deviceKind = device === 'default' ? 'audiooutput' : device.kind;
    const deviceId = device === 'default' ? '' : device.deviceId;
    const deviceLabel = device === 'default' ?
      I18n.format('LiveStream.PopUp.OutputDevice.Default', true) :
      device.label;

    if(deviceKind !== 'audiooutput') return;
    const input = document.createElement('input');
    input.className = 'popup-output-device-input';
    input.type = 'radio';
    input.name = 'outputDevice';
    input.value = deviceId;
    input.hidden = true;
    input.checked = deviceId === currentDevice;
    input.addEventListener('change', (e) => {
      if((e.target as HTMLInputElement).checked) {
        liveStreamController?.liveStream?.setAudioOutputDeviceId(deviceId);
      }
    });

    const label = document.createElement('label');
    label.classList.add('popup-output-device-item');

    const radio = document.createElement('div');
    radio.classList.add('popup-output-device-radio');

    const icon = Icon('check', 'popup-output-device-check');
    radio.append(icon);

    label.append(input, radio, deviceLabel);

    return label;
  }

  private async getDevices() {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    const devices = await navigator.mediaDevices.enumerateDevices();
    stream.getTracks().forEach(track => track.stop());
    return devices;
  }
}
