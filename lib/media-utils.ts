import { ImageMetadata, VideoMetadata } from './asset-types';

/**
 * 이미지 파일의 메타데이터(너비, 높이) 추출
 */
export async function getImageMetadata(file: File): Promise<ImageMetadata> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지 메타데이터를 읽을 수 없습니다.'));
    };

    img.src = url;
  });
}

/**
 * 비디오 파일의 메타데이터(너비, 높이, 길이) 추출
 */
export async function getVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('동영상 메타데이터를 읽을 수 없습니다.'));
    };

    video.src = url;
  });
}
