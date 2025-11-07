/**
 * Asset 종류
 */
export enum AssetKind {
  IMAGE = 'image',
  VIDEO = 'video',
}

/**
 * Asset 정보 DTO (백엔드 응답 형식)
 */
export interface AssetInfoDto {
  /**
   * S3 저장 경로 (Presigned URL 업로드 후)
   * @example 'companies/logos/xxx-123456.png'
   */
  storageKey: string;

  /**
   * 파일 MIME 타입
   * @example 'image/png'
   */
  mimeType: string;

  /**
   * 파일 크기 (바이트)
   * @example 50000
   */
  bytes: number;

  /**
   * Asset 종류
   * @example 'image'
   */
  kind: AssetKind;

  /**
   * 메타데이터 (너비, 높이, 동영상 길이 등)
   * @example { width: 1920, height: 1080 }
   * @example { width: 1920, height: 1080, duration: 120.5 }
   */
  meta?: Record<string, any>;
}

/**
 * 이미지 메타데이터
 */
export interface ImageMetadata {
  width: number;
  height: number;
}

/**
 * 비디오 메타데이터
 */
export interface VideoMetadata {
  width: number;
  height: number;
  duration: number; // 초 단위
}
