export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface ImageMetadata {
  filename: string;
  title: string;
  description: string;
  tags: string[];
}

export interface ImageFile {
  id: string;
  file: File;
  previewUrl: string;
  metadata: ImageMetadata | null;
  status: AppStatus;
  error: string | null;
}
