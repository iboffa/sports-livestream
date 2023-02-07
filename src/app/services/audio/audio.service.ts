import { Injectable } from '@angular/core';
import { forkJoin, from, map, of, switchMap, tap, zip } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AudioService {
  private mixedAudioNode: MediaStreamAudioDestinationNode;
  private audioCtx = new AudioContext();
  private gains: { [deviceId: string]: { gainNode: GainNode; label: string } } =
    {};

  get audioTrack(): MediaStreamTrack {
    return this.mixedAudioNode.stream.getAudioTracks()[0];
  }

  get audioInputs(): {
    [deviceId: string]: { gainNode: GainNode; label: string };
  } {
    return this.gains;
  }

  constructor() {
    this.mixedAudioNode = this.audioCtx.createMediaStreamDestination();
    from(navigator.mediaDevices.enumerateDevices())
      .pipe(
        map((devices) =>
          devices.filter(
            (device) =>
              device.kind === 'audioinput' &&
              !['default', 'communications'].includes(device.deviceId)
          )
        ),
        tap((audioInputs) => {
          audioInputs.forEach((input) => {
            this.gains[input.deviceId] = {
              label: input.label,
              gainNode: this.audioCtx.createGain(),
            };
            this.gains[input.deviceId].gainNode.gain.setValueAtTime(
              0,
              this.audioCtx.currentTime
            );
          });
        }),
        map((audioInputs) =>
          audioInputs.map((device) =>
            zip(
              from(
                navigator.mediaDevices.getUserMedia({
                  audio: { deviceId: device.deviceId },
                })
              ),
              of(device.deviceId)
            )
          )
        ),
        switchMap((streams$) => forkJoin(streams$))
      )
      .subscribe((audioStreams) => {
        audioStreams.forEach(([stream, deviceId]) => {
          const audioSource = this.audioCtx.createMediaStreamSource(stream);
          audioSource.connect(this.gains[deviceId].gainNode);
          this.gains[deviceId].gainNode.connect(this.mixedAudioNode);
        });
      });
  }

  applyNoiseCancellation(node: AudioNode) {
    this.mixedAudioNode.disconnect(node);
    node.disconnect();
    const highPassFilter = this.audioCtx.createBiquadFilter();
    highPassFilter.type = 'highpass';
    highPassFilter.frequency.value = 150;

    const compressor = this.audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    highPassFilter.connect(compressor);
    node.connect(highPassFilter);
    node.connect(this.mixedAudioNode);
  }
}
