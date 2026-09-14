import { KeyValuePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { tap } from 'rxjs';
import { AppStoreService } from '../../services/app-store/app-store.service';
import { AudioInputs, AudioService } from '../../services/audio/audio.service';
import { VideoService } from '../../services/video/video.service';

const SELECTED_CAMERA = 'selectedCameraDeviceId';
const MIC_GAINS = 'micGains';

@Component({
  selector: 'app-pre-game',
  templateUrl: './pre-game.component.html',
  styleUrls: ['./pre-game.component.scss'],
  imports: [KeyValuePipe],
})
export class PreGameComponent implements OnInit {
  private audioService = inject(AudioService);
  private videoService = inject(VideoService);
  private appStore = inject(AppStoreService);

  // Gains are restored in `tap` rather than an effect so they are already on the
  // nodes the first time the template reads `micInputs()` and renders a slider.
  micInputs = toSignal(
    this.audioService.audioInputs$.pipe(tap((inputs) => this.restoreGains(inputs))),
    { initialValue: {} as AudioInputs }
  );

  /** Camera devices keyed by the resolution they reported while probing. */
  cameraGroups = signal<{ [resolution: string]: MediaDeviceInfo[] }>({});
  selectedCameraId = signal<string | undefined>(undefined);
  preview = signal<MediaStream | undefined>(undefined);

  async ngOnInit() {
    this.selectedCameraId.set(this.appStore.get<string | undefined>(SELECTED_CAMERA));
    this.cameraGroups.set(await this.videoService.groupCamerasByResolution());
  }

  get resolutions(): string[] {
    return Object.keys(this.cameraGroups());
  }

  async selectCamera(deviceId: string) {
    this.selectedCameraId.set(deviceId);
    this.appStore.set(SELECTED_CAMERA, deviceId);

    // Release the previous preview before opening the next camera.
    this.preview()?.getTracks().forEach((track) => track.stop());
    this.preview.set(
      await navigator.mediaDevices.getUserMedia({ video: { deviceId } })
    );
  }

  setGain(deviceId: string, value: string) {
    const gain = Number(value);
    const input = this.micInputs()[deviceId];
    if (!input) return;

    input.gainNode.gain.value = gain;
    const gains = this.appStore.get<{ [id: string]: number }>(MIC_GAINS) ?? {};
    this.appStore.set(MIC_GAINS, { ...gains, [deviceId]: gain });
  }

  gainOf(deviceId: string): number {
    return this.micInputs()[deviceId]?.gainNode.gain.value ?? 0;
  }

  private restoreGains(inputs: AudioInputs) {
    const gains = this.appStore.get<{ [id: string]: number }>(MIC_GAINS) ?? {};
    for (const [deviceId, gain] of Object.entries(gains)) {
      if (inputs[deviceId]) inputs[deviceId].gainNode.gain.value = gain;
    }
  }
}
