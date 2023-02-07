import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class VideoService {

  constructor() {

  }

  async groupCamerasByResolution() {
    const cameras:{[resolution: string]: MediaDeviceInfo[]} = {};
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    for (const device of videoDevices) {
      const constraints = {
        deviceId: device.deviceId,
      };

      const stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();

      const width = settings.width;
      const height = settings.height;
      const key = `${width}x${height}`;

      if (!cameras[key]) {
        cameras[key] = [];
      }

      cameras[key].push(device);
    }

    return cameras;
  }

}
