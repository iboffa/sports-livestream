import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class VideoService {

  constructor() {

  }

  async groupCamerasByResolution() {
    const cameras: { [resolution: string]: MediaDeviceInfo[] } = {};
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === 'videoinput');

    for (const device of videoDevices) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: device.deviceId },
      });

      try {
        const settings = stream.getVideoTracks()[0].getSettings();
        const key = `${settings.width}x${settings.height}`;
        (cameras[key] ??= []).push(device);
      } finally {
        // Probing holds the camera open otherwise: recording light on, and the
        // device locked against the app's own later getUserMedia call.
        stream.getTracks().forEach((track) => track.stop());
      }
    }

    return cameras;
  }

}
