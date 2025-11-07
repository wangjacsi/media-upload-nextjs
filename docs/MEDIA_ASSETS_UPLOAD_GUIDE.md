# 백엔드 개발자를 위한 API 가이드

## 목차
1. [프론트엔드 업로드 프로세스](#프론트엔드-업로드-프로세스)
2. [백엔드가 받게 될 데이터](#백엔드가-받게-될-데이터)
3. [DB 저장 권장 방법](#db-저장-권장-방법)
4. [CDN URL 생성](#cdn-url-생성)
5. [참고 문서](#참고-문서)

---

## 프론트엔드 업로드 프로세스

### 전체 흐름 요약

```
1. 사용자가 파일 선택
   ↓
2. 프론트엔드에서 메타데이터 추출
   - 이미지: width, height
   - 비디오: width, height, duration
   ↓
3. 프론트엔드 → Next.js API → S3 Presigned URL 발급
   ↓
4. 프론트엔드 → S3 직접 업로드 (서버 부담 없음)
   - 이미지: 단일 PUT 업로드
   - 비디오: 멀티파트 업로드 (8MB 청크, 4개 병렬)
   ↓
5. 업로드 완료 후 S3 경로 수집
   ↓
6. 최종 제출: 프론트엔드 → 백엔드 API
   - AssetInfoDto[] 형식으로 전송
```

### 핵심 포인트

- **서버는 파일 데이터를 처리하지 않음**: Presigned URL만 생성
- **S3 직접 업로드**: 클라이언트 → S3 (서버 대역폭 절약)
- **메타데이터는 프론트엔드에서 추출**: 서버 부담 없음
- **병렬 업로드**: 여러 파일 동시 업로드 (Promise.all)

---

## 백엔드가 받게 될 데이터

### API 엔드포인트

```
POST /api/submit
Content-Type: application/json
```

### 요청 데이터 구조

```typescript
{
  name: string;
  assets: AssetInfoDto[];
}
```

### AssetInfoDto 인터페이스

```typescript
interface AssetInfoDto {
  storageKey: string;    // S3 저장 경로
  mimeType: string;      // MIME 타입 (예: 'image/jpeg')
  bytes: number;         // 파일 크기 (바이트)
  kind: 'image' | 'video'; // 파일 종류
  meta?: {
    width: number;       // 너비 (픽셀)
    height: number;      // 높이 (픽셀)
    duration?: number;   // 동영상 길이 (초, 비디오만 해당)
  };
}
```

### 실제 요청 예시

```json
{
  "name": "홍길동",
  "assets": [
    {
      "storageKey": "profile/images/2025/10/a3b2c1d4-e5f6-7890-abcd-ef1234567890.jpg",
      "mimeType": "image/jpeg",
      "bytes": 524288,
      "kind": "image",
      "meta": {
        "width": 1920,
        "height": 1080
      }
    },
    {
      "storageKey": "profile/images/2025/10/b4c3d2e1-f6g7-8901-bcde-fg2345678901.webp",
      "mimeType": "image/webp",
      "bytes": 327680,
      "kind": "image",
      "meta": {
        "width": 1280,
        "height": 720
      }
    },
    {
      "storageKey": "profile/videos/2025/10/c5d4e3f2-g7h8-9012-cdef-gh3456789012.mp4",
      "mimeType": "video/mp4",
      "bytes": 104857600,
      "kind": "video",
      "meta": {
        "width": 1920,
        "height": 1080,
        "duration": 125.5
      }
    }
  ]
}
```

### 주요 특징

1. **단일 배열**: 이미지와 비디오가 `assets` 배열에 통합
2. **순서 보장**: 배열 인덱스가 업로드 순서를 나타냄
3. **풍부한 메타데이터**: 프론트엔드에서 추출한 정보 포함
4. **S3 경로 포함**: `storageKey`로 파일 접근 가능

---

## DB 저장 권장 방법

### Entity 예시 (TypeORM)

```typescript
// submission.entity.ts
@Entity('submissions')
export class Submission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @OneToMany(() => Asset, asset => asset.submission)
  assets: Asset[];

  @CreateDateColumn()
  createdAt: Date;
}

// asset.entity.ts
@Entity('assets')
export class Asset {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Submission, submission => submission.assets)
  submission: Submission;

  @Column({ type: 'varchar', length: 500 })
  storageKey: string;  // S3 경로

  @Column({ type: 'varchar', length: 1000 })
  url: string;  // CDN URL (생성 필요)

  @Column({ type: 'varchar', length: 50 })
  mimeType: string;

  @Column({ type: 'bigint' })
  bytes: number;

  @Column({ type: 'enum', enum: ['image', 'video'] })
  kind: string;

  @Column({ type: 'int', nullable: true })
  width: number;

  @Column({ type: 'int', nullable: true })
  height: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  duration: number;  // 비디오만

  @Column({ type: 'int' })
  order: number;  // 배열 인덱스 저장

  @CreateDateColumn()
  uploadedAt: Date;
}
```

### Service 저장 로직

```typescript
// submission.service.ts
async create(dto: CreateSubmissionDto) {
  // 1. Submission 생성
  const submission = this.submissionRepository.create({
    name: dto.name,
  });
  await this.submissionRepository.save(submission);

  // 2. Assets 생성
  const assets = dto.assets.map((asset, index) =>
    this.assetRepository.create({
      submission,
      storageKey: asset.storageKey,
      url: this.generateCdnUrl(asset.storageKey), // CDN URL 생성
      mimeType: asset.mimeType,
      bytes: asset.bytes,
      kind: asset.kind,
      width: asset.meta?.width,
      height: asset.meta?.height,
      duration: asset.meta?.duration,
      order: index, // 순서 저장
    })
  );
  await this.assetRepository.save(assets);

  return { id: submission.id, success: true };
}
```

---

## CDN URL 생성

### S3 경로 → CDN URL 변환

백엔드에서 `storageKey`를 받아 CDN URL로 변환합니다.

```typescript
// S3 Direct URL (권장하지 않음)
const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${storageKey}`;
// 예: https://my-bucket.s3.ap-northeast-2.amazonaws.com/profile/images/2025/10/uuid.jpg

// CloudFront CDN URL (권장)
const cdnUrl = `https://${cloudFrontDomain}/${storageKey}`;
// 예: https://d1234567890.cloudfront.net/profile/images/2025/10/uuid.jpg
```

### 환경변수 설정

```bash
# .env
AWS_S3_BUCKET=my-bucket
AWS_REGION=ap-northeast-2
CDN_DOMAIN=d1234567890.cloudfront.net
```

### 유틸리티 함수

```typescript
// utils/s3.util.ts
export function generateCdnUrl(storageKey: string): string {
  const cdnDomain = process.env.CDN_DOMAIN;

  if (!cdnDomain) {
    // CDN 없으면 S3 Direct URL
    const bucket = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION;
    return `https://${bucket}.s3.${region}.amazonaws.com/${storageKey}`;
  }

  return `https://${cdnDomain}/${storageKey}`;
}
```

---

## 참고 문서

### 상세 문서

- **[ASSET_INFO_DTO.md](./ASSET_INFO_DTO.md)**: AssetInfoDto 통합 가이드 (DB 저장 예시 포함)
- **[S3_UPLOAD_GUIDE.md](./S3_UPLOAD_GUIDE.md)**: S3 경로 구조 및 NestJS 예시
- **[VIDEO_UPLOAD_PROCESS.md](./VIDEO_UPLOAD_PROCESS.md)**: 비디오 멀티파트 업로드 프로세스
- **[METADATA_PERFORMANCE.md](./METADATA_PERFORMANCE.md)**: 메타데이터 추출 성능 분석

### 주요 파일 위치

- **타입 정의**: `lib/asset-types.ts`
- **메타데이터 유틸**: `lib/media-utils.ts`
- **프론트엔드**: `app/upload/page.tsx`
- **API 엔드포인트**: `app/api/submit/route.ts`

---

## FAQ

### Q1. 파일 용량 제한은?
- **이미지**: 5MB (개당)
- **비디오**: 1GB (개당)
- **개수 제한**: 환경변수로 설정 가능 (기본값: 이미지 10개, 비디오 3개)

### Q2. 지원하는 파일 형식은?
- **이미지**: `image/*` (jpeg, png, webp, gif 등)
- **비디오**: `video/mp4`, `video/quicktime`, `video/webm`, `video/ogg`

### Q3. 메타데이터는 신뢰할 수 있나?
- 프론트엔드에서 브라우저 네이티브 API로 추출
- 매우 정확하며 빠름 (0.01-0.5초)
- 서버에서 재검증이 필요하면 `ffprobe` 등 사용 가능

### Q4. S3 경로 구조는?
```
[extraPath]/[type]/[YYYY]/[MM]/[uuid].[ext]

예시:
- profile/images/2025/10/uuid.jpg
- company-a/videos/2025/10/uuid.mp4
- uploads/images/2025/10/uuid.jpg (extraPath 없을 때)
```

### Q5. 파일 순서는 어떻게 보장되나?
- 배열 인덱스가 업로드 순서
- DB 저장 시 `order` 필드에 인덱스 저장 권장

### Q6. 실패한 업로드는 어떻게 처리하나?
- 프론트엔드에서 업로드 실패 시 사용자에게 에러 표시
- 백엔드는 성공적으로 업로드된 파일만 받음
- S3에 미완성 파일이 남을 수 있으므로 수명 주기 정책 권장

---

## 빠른 시작

### 1. DTO 정의

```typescript
// create-submission.dto.ts
export class AssetInfoDto {
  @IsString()
  storageKey: string;

  @IsString()
  mimeType: string;

  @IsNumber()
  bytes: number;

  @IsEnum(['image', 'video'])
  kind: string;

  @IsOptional()
  @IsObject()
  meta?: {
    width?: number;
    height?: number;
    duration?: number;
  };
}

export class CreateSubmissionDto {
  @IsString()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssetInfoDto)
  assets: AssetInfoDto[];
}
```

### 2. Controller 작성

```typescript
// submission.controller.ts
@Post()
async create(@Body() dto: CreateSubmissionDto) {
  return this.submissionService.create(dto);
}
```

### 3. Service 구현

```typescript
// submission.service.ts
async create(dto: CreateSubmissionDto) {
  const submission = await this.submissionRepository.save({
    name: dto.name,
  });

  const assets = dto.assets.map((asset, index) => ({
    submission,
    storageKey: asset.storageKey,
    url: this.generateCdnUrl(asset.storageKey),
    mimeType: asset.mimeType,
    bytes: asset.bytes,
    kind: asset.kind,
    width: asset.meta?.width,
    height: asset.meta?.height,
    duration: asset.meta?.duration,
    order: index,
  }));

  await this.assetRepository.save(assets);

  return { id: submission.id };
}

private generateCdnUrl(storageKey: string): string {
  return `https://${process.env.CDN_DOMAIN}/${storageKey}`;
}
```

---

## 문의 및 지원

추가 문서나 예시 코드가 필요하면 프론트엔드 팀에 문의하세요.
