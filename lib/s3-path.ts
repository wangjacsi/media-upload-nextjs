/**
 * S3 저장 경로 생성 유틸리티
 *
 * 경로 구조:
 * - extraPath 있을 때: [extraPath]/[type]/[YYYY]/[MM]/[uuid].[ext]
 * - extraPath 없을 때: uploads/[type]/[YYYY]/[MM]/[uuid].[ext]
 *
 * 예시:
 * - profile/images/2025/10/abc123-def456.jpg (extraPath: 'profile')
 * - company-a/videos/2025/10/xyz789-abc123.mp4 (extraPath: 'company-a')
 * - uploads/images/2025/10/uuid-here.jpg (extraPath 없음)
 */

import { v4 as uuidv4 } from 'uuid';

export interface S3PathOptions {
  /**
   * 파일 타입 (images | videos | documents 등)
   */
  type: 'images' | 'videos' | 'documents';

  /**
   * 추가 경로 (선택사항)
   * 예: 'profile', 'company-a', 'tenant-123', 'users/john'
   */
  extraPath?: string;

  /**
   * 원본 파일명 (확장자 추출용)
   */
  filename: string;

  /**
   * 날짜 (선택사항, 기본값: 현재 시간)
   */
  date?: Date;

  /**
   * UUID 생성 여부 (기본값: true)
   * false로 설정하면 원본 파일명 사용 (안전화 처리됨)
   */
  useUUID?: boolean;
}

/**
 * S3 저장 경로 생성
 */
export function generateS3Path(options: S3PathOptions): string {
  const {
    type,
    extraPath,
    filename,
    date = new Date(),
    useUUID = true,
  } = options;

  // 날짜 포맷팅 (YYYY/MM)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  // 파일 확장자 추출
  const extension = getFileExtension(filename);
  const ext = extension ? `.${extension}` : '';

  // 파일명 생성
  let finalFilename: string;
  if (useUUID) {
    // UUID만 사용 (확장자 포함)
    finalFilename = `${uuidv4()}${ext}`;
  } else {
    // 원본 파일명 안전화 (특수문자 제거, 공백을 언더스코어로)
    const safeName = filename
      .replace(/[^\w\s.-]/g, '')
      .replace(/\s+/g, '_');
    finalFilename = safeName;
  }

  // 경로 구성 요소
  const parts: string[] = [];

  // 1. Extra Path 또는 기본 경로
  if (extraPath) {
    // extraPath가 있으면 해당 경로 사용 (uploads 제외)
    parts.push(extraPath);
  } else {
    // extraPath가 없으면 uploads 사용
    parts.push('uploads');
  }

  // 2. 타입
  parts.push(type);

  // 3. 날짜 (YYYY/MM)
  parts.push(year.toString());
  parts.push(month);

  // 4. 파일명 (UUID.ext 또는 안전화된 원본명)
  parts.push(finalFilename);

  return parts.join('/');
}

/**
 * S3 전체 URL 생성
 */
export function generateS3Url(key: string, options?: {
  bucket?: string;
  region?: string;
  cdnDomain?: string;
}): string {
  const { bucket, region, cdnDomain } = options || {};

  // CDN이 있으면 CDN URL 사용 (권장)
  if (cdnDomain) {
    return `https://${cdnDomain}/${key}`;
  }

  // S3 Direct URL
  const bucketName = bucket || process.env.AWS_S3_BUCKET;
  const awsRegion = region || process.env.AWS_REGION;

  if (!bucketName || !awsRegion) {
    throw new Error('AWS_S3_BUCKET and AWS_REGION are required');
  }

  return `https://${bucketName}.s3.${awsRegion}.amazonaws.com/${key}`;
}

/**
 * 파일 확장자 추출
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * MIME 타입으로 S3 경로 타입 결정
 */
export function getTypeFromMimeType(mimeType: string): S3PathOptions['type'] {
  if (mimeType.startsWith('image/')) return 'images';
  if (mimeType.startsWith('video/')) return 'videos';
  return 'documents';
}
