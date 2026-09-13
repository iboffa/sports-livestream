import { Component, OnInit, inject, signal } from '@angular/core';
import { AppStoreService } from '../../services/app-store/app-store.service';
import { VideoService } from '../../services/video/video.service';

const SELECTED_CAMERA = 'selectedCameraDeviceId';

@Component({
  selector: 'app-pre-game',
  templateUrl: './pre-game.component.html',
  styleUrls: ['./pre-game.component.scss'],
})
export class PreGameComponent implements OnInit {
  private videoService = inject(VideoService);
  private appStore = inject(AppStoreService);

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
}
