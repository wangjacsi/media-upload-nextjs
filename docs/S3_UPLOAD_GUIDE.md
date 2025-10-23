# S3 업로드 경로 구조 가이드

## 개요

확장성 있는 S3 저장 경로 구조를 구현했습니다. 날짜별 폴더 구분과 추가 경로(extraPath)를 통한 유연한 파일 분류를 지원합니다.

## ⭐ 핵심 포인트

1. **업로드 함수는 S3 경로를 반환합니다**
   - `uploadImageWithProgress()` → S3 storageKey 반환
   - `uploadVideoMultipart()` → S3 storageKey 반환

2. **반환된 경로를 반드시 활용하세요**
   - 업로드 후 반환되는 `storageKey`를 서버로 전송
   - 서버는 이 경로를 DB에 저장
   - 나중에 이 경로로 파일에 접근

3. **콘솔에서 확인 가능**
   - 브라우저 콘솔(F12)에서 업로드된 모든 경로 확인
   - 최종 제출 데이터도 JSON 형식으로 출력

4. **다중 파일 업로드**
   - `Promise.all`로 병렬 업로드
   - 순서가 보장되며 `order` 필드로 추적

## 경로 구조

### extraPath가 있을 때
```
[extraPath]/[type]/[YYYY]/[MM]/[uuid].[ext]
```

### extraPath가 없을 때
```
uploads/[type]/[YYYY]/[MM]/[uuid].[ext]
```

### 구성 요소

1. **extraPath** (선택사항): 추가 경로 (예: 'profile', 'company-a', 'users/john')
2. **uploads**: extraPath가 없을 때만 사용되는 기본 경로
3. **type**: 파일 타입 (images, videos, documents)
4. **YYYY**: 연도 (4자리)
5. **MM**: 월 (2자리, 01-12)
6. **uuid**: 고유 식별자 (uuid v4, 자동 생성)
7. **ext**: 원본 파일 확장자 (예: jpg, mp4, pdf)

## 경로 예시

### extraPath가 있을 때

```
profile/images/2025/10/a3b2c1d4-e5f6-7890-abcd-ef1234567890.jpg
company-a/videos/2025/10/b4c3d2e1-f6g7-8901-bcde-fg2345678901.mp4
users/john/images/2025/11/c5d4e3f2-g7h8-9012-cdef-gh3456789012.webp
tenant-123/documents/2025/10/d6e5f4g3-h8i9-0123-defg-hi4567890123.pdf
```

### extraPath가 없을 때

```
uploads/images/2025/10/e7f6g5h4-i9j0-1234-efgh-ij5678901234.jpg
uploads/videos/2025/10/f8g7h6i5-j0k1-2345-fghi-jk6789012345.mp4
uploads/documents/2025/10/g9h8i7j6-k1l2-3456-ghij-kl7890123456.pdf
```

## 사용 방법

### 1. 프론트엔드에서 extraPath 지정

```typescript
// app/upload/page.tsx
const [extraPath, setExtraPath] = useState("profile"); // 또는 'company-a', 'users/john' 등

// 업로드 시 extraPath 전달
await uploadImageWithProgress(file, extraPath, onProgress);
await uploadVideoMultipart(file, duration, extraPath, onProgress);
```

### 1-1. 업로드 결과값 활용 (중요!)

**이미지 업로드 - 반환되는 S3 경로 사용**:
```typescript
// 이미지 업로드 함수는 S3 storageKey를 반환합니다
const storageKey = await uploadImageWithProgress(file, extraPath, onProgress);
console.log('업로드된 이미지 경로:', storageKey);
// 출력: profile/images/2025/10/a3b2c1d4-e5f6-7890-abcd-ef1234567890.jpg

// 이 경로를 서버에 전달하여 DB에 저장
await fetch('/api/submit', {
  method: 'POST',
  body: JSON.stringify({
    imageKey: storageKey,
    originalFilename: file.name
  })
});
```

**동영상 업로드 - 반환되는 S3 경로 사용**:
```typescript
// 동영상 업로드 함수도 S3 storageKey를 반환합니다
const storageKey = await uploadVideoMultipart(file, duration, extraPath, onProgress);
console.log('업로드된 동영상 경로:', storageKey);
// 출력: profile/videos/2025/10/b4c3d2e1-f6g7-8901-bcde-fg2345678901.mp4

// 이 경로를 서버에 전달하여 DB에 저장
await fetch('/api/submit', {
  method: 'POST',
  body: JSON.stringify({
    videoKey: storageKey,
    originalFilename: file.name
  })
});
```

**다중 파일 업로드 - 병렬 처리 및 경로 수집**:
```typescript
// 여러 이미지를 동시에 업로드하고 경로 배열 수집
const imageKeys = await Promise.all(
  imageFiles.map((file, i) =>
    uploadImageWithProgress(file, extraPath, (progress) => {
      console.log(`이미지 ${i}: ${progress}%`);
    })
  )
);

console.log('✅ 이미지 업로드 완료:');
imageKeys.forEach((key, i) => {
  console.log(`  [${i}] ${imageFiles[i].name} → ${key}`);
});
// 출력:
//   [0] photo1.jpg → profile/images/2025/10/uuid1.jpg
//   [1] photo2.jpg → profile/images/2025/10/uuid2.jpg

// 여러 동영상도 동시에 업로드
const videoKeys = await Promise.all(
  videoFiles.map(async (file, i) => {
    const duration = await getVideoDurationSeconds(file);
    return uploadVideoMultipart(file, duration, extraPath, (progress) => {
      console.log(`동영상 ${i}: ${progress}%`);
    });
  })
);

console.log('✅ 동영상 업로드 완료:');
videoKeys.forEach((key, i) => {
  console.log(`  [${i}] ${videoFiles[i].name} → ${key}`);
});

// 최종 제출 데이터 구성
const submitData = {
  images: imageKeys.map((key, i) => ({
    key,
    originalFilename: imageFiles[i].name,
    order: i
  })),
  videos: videoKeys.map((key, i) => ({
    key,
    originalFilename: videoFiles[i].name,
    order: i
  }))
};

console.log('📤 최종 제출 데이터:', JSON.stringify(submitData, null, 2));
// 이 데이터를 서버로 전송하여 DB에 저장
```

### 2. 서버에서 경로 생성

```typescript
// app/api/upload/image/route.ts
import { generateS3Path } from "@/lib/s3-path";

const key = generateS3Path({
  type: 'images',
  filename: 'my-photo.jpg', // 확장자 추출용
  extraPath: 'profile', // 선택사항
});
// extraPath 있음: profile/images/2025/10/a3b2c1d4-e5f6-7890-abcd-ef1234567890.jpg
// extraPath 없음: uploads/images/2025/10/a3b2c1d4-e5f6-7890-abcd-ef1234567890.jpg
```

### 3. URL 생성

```typescript
import { generateS3Url } from "@/lib/s3-path";

// S3 Direct URL
const s3Url = generateS3Url(key, {
  bucket: 'my-bucket',
  region: 'ap-northeast-2',
});
// https://my-bucket.s3.ap-northeast-2.amazonaws.com/profile/images/2025/10/a3b2c1d4-e5f6-7890-abcd-ef1234567890.jpg

// CloudFront CDN URL (권장)
const cdnUrl = generateS3Url(key, {
  cdnDomain: 'd1234567890.cloudfront.net',
});
// https://d1234567890.cloudfront.net/profile/images/2025/10/a3b2c1d4-e5f6-7890-abcd-ef1234567890.jpg
```

## 유틸리티 함수

### generateS3Path()

S3 저장 경로를 생성합니다.

```typescript
interface S3PathOptions {
  type: 'images' | 'videos' | 'documents';
  extraPath?: string;
  filename: string;
  date?: Date;
  useUUID?: boolean;
}

generateS3Path(options: S3PathOptions): string
```

**예시:**

```typescript
// 기본 사용 (extraPath 없음)
generateS3Path({
  type: 'images',
  filename: 'photo.jpg',
});
// → uploads/images/2025/10/a3b2c1d4-e5f6-7890-abcd-ef1234567890.jpg

// extraPath 지정
generateS3Path({
  type: 'videos',
  filename: 'intro.mp4',
  extraPath: 'profile',
});
// → profile/videos/2025/10/b4c3d2e1-f6g7-8901-bcde-fg2345678901.mp4

// 다층 경로
generateS3Path({
  type: 'images',
  filename: 'avatar.jpg',
  extraPath: 'users/john',
});
// → users/john/images/2025/10/c5d4e3f2-g7h8-9012-cdef-gh3456789012.jpg

// 특정 날짜 지정
generateS3Path({
  type: 'images',
  filename: 'old-photo.jpg',
  date: new Date('2024-05-15'),
});
// → uploads/images/2024/05/d6e5f4g3-h8i9-0123-defg-hi4567890123.jpg

// UUID 없이 (원본 파일명 사용, 안전화 처리됨)
generateS3Path({
  type: 'documents',
  filename: 'Monthly Report (2025).pdf',
  useUUID: false,
});
// → uploads/documents/2025/10/Monthly_Report_2025.pdf
```

### generateS3Url()

S3 Key로 전체 URL을 생성합니다.

```typescript
generateS3Url(key: string, options?: {
  bucket?: string;
  region?: string;
  cdnDomain?: string;
}): string
```

**예시:**

```typescript
const key = 'profile/images/2025/10/a3b2c1d4-e5f6-7890-abcd-ef1234567890.jpg';

// S3 Direct URL
generateS3Url(key, {
  bucket: 'my-bucket',
  region: 'ap-northeast-2',
});

// CDN URL
generateS3Url(key, {
  cdnDomain: 'd1234567890.cloudfront.net',
});
```

### getTypeFromMimeType()

MIME 타입으로 S3 경로 타입을 결정합니다.

```typescript
getTypeFromMimeType('image/jpeg');  // → 'images'
getTypeFromMimeType('video/mp4');   // → 'videos'
getTypeFromMimeType('application/pdf'); // → 'documents'
```

## 실제 사용 사례

### 사례 1: 프로필 이미지 업로드

```typescript
// 사용자 'profile' 폴더에 저장
const key = generateS3Path({
  type: 'images',
  filename: 'avatar.jpg',
  extraPath: 'profile',
});
// → profile/images/2025/10/a3b2c1d4-e5f6-7890-abcd-ef1234567890.jpg
```

### 사례 2: 회사별 동영상 관리

```typescript
// 회사 A의 동영상
const keyA = generateS3Path({
  type: 'videos',
  filename: 'promo.mp4',
  extraPath: 'company-a',
});
// → company-a/videos/2025/10/b4c3d2e1-f6g7-8901-bcde-fg2345678901.mp4

// 회사 B의 동영상 (같은 파일명이어도 UUID가 다름)
const keyB = generateS3Path({
  type: 'videos',
  filename: 'promo.mp4',
  extraPath: 'company-b',
});
// → company-b/videos/2025/10/c5d4e3f2-g7h8-9012-cdef-gh3456789012.mp4
```

### 사례 3: 사용자별 파일 관리

```typescript
// 사용자별로 파일 분리
const key = generateS3Path({
  type: 'images',
  filename: 'document.jpg',
  extraPath: `users/${userId}`,
});
// → users/john/images/2025/10/d6e5f4g3-h8i9-0123-defg-hi4567890123.jpg
```

### 사례 4: 멀티테넌트 SaaS

```typescript
// 테넌트별로 파일 분리
const key = generateS3Path({
  type: 'documents',
  filename: 'invoice.pdf',
  extraPath: `tenant-${tenantId}`,
});
// → tenant-123/documents/2025/10/e7f6g5h4-i9j0-1234-efgh-ij5678901234.pdf
```

### 사례 5: 일반 업로드 (extraPath 없음)

```typescript
// 기본 uploads 폴더 사용
const key = generateS3Path({
  type: 'images',
  filename: 'public-banner.jpg',
});
// → uploads/images/2025/10/f8g7h6i5-j0k1-2345-fghi-jk6789012345.jpg
```

## DB 저장 예시

### Next.js API에서 S3 경로 받아서 백엔드로 전송

```typescript
// app/api/submit/route.ts
export async function POST(req: NextRequest) {
  const body = await req.json();

  // 프론트엔드에서 받은 데이터:
  // {
  //   name: "홍길동",
  //   images: [
  //     { key: "profile/images/2025/10/uuid1.jpg", originalFilename: "photo1.jpg", order: 0 },
  //     { key: "profile/images/2025/10/uuid2.jpg", originalFilename: "photo2.jpg", order: 1 }
  //   ],
  //   videos: [
  //     { key: "profile/videos/2025/10/uuid3.mp4", originalFilename: "intro.mp4", order: 0 }
  //   ]
  // }

  // NestJS 백엔드 API로 전송
  const response = await fetch('https://api.example.com/submissions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
    body: JSON.stringify({
      name: body.name,
      images: body.images.map(img => ({
        s3Key: img.key,  // ⭐ 업로드 함수가 반환한 S3 경로
        originalFilename: img.originalFilename,
        order: img.order,
      })),
      videos: body.videos.map(vid => ({
        s3Key: vid.key,  // ⭐ 업로드 함수가 반환한 S3 경로
        originalFilename: vid.originalFilename,
        order: vid.order,
      })),
    }),
  });

  const result = await response.json();
  return NextResponse.json(result);
}
```

### NestJS 백엔드에서 DB 저장 (TypeORM + MySQL)

```typescript
// submission.controller.ts
@Post()
async create(@Body() createSubmissionDto: CreateSubmissionDto) {
  return this.submissionService.create(createSubmissionDto);
}

// submission.service.ts
async create(createSubmissionDto: CreateSubmissionDto) {
  // 1. Submission 생성
  const submission = this.submissionRepository.create({
    name: createSubmissionDto.name,
  });
  await this.submissionRepository.save(submission);

  // 2. 이미지 저장
  const images = createSubmissionDto.images.map(img =>
    this.imageRepository.create({
      submission,
      s3Key: img.s3Key,  // ⭐ S3 경로 저장
      url: this.generateCdnUrl(img.s3Key), // CDN URL 생성
      originalFilename: img.originalFilename,
      order: img.order,
    })
  );
  await this.imageRepository.save(images);

  // 3. 동영상 저장
  const videos = createSubmissionDto.videos.map(vid =>
    this.videoRepository.create({
      submission,
      s3Key: vid.s3Key,  // ⭐ S3 경로 저장
      url: this.generateCdnUrl(vid.s3Key), // CDN URL 생성
      originalFilename: vid.originalFilename,
      order: vid.order,
    })
  );
  await this.videoRepository.save(videos);

  return { id: submission.id, success: true };
}

private generateCdnUrl(s3Key: string): string {
  return `https://cdn.example.com/${s3Key}`;
}
```

### TypeORM Entity 예시

```typescript
// submission.entity.ts
@Entity('submissions')
export class Submission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @OneToMany(() => Image, image => image.submission)
  images: Image[];

  @OneToMany(() => Video, video => video.submission)
  videos: Video[];

  @CreateDateColumn()
  createdAt: Date;
}

// image.entity.ts
@Entity('images')
export class Image {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Submission, submission => submission.images)
  submission: Submission;

  @Column({ type: 'varchar', length: 500 })
  s3Key: string;  // ⭐ S3 경로 저장 (예: profile/images/2025/10/uuid.jpg)

  @Column({ type: 'varchar', length: 1000 })
  url: string;  // CDN URL

  @Column({ type: 'varchar', length: 255 })
  originalFilename: string;

  @Column({ type: 'int' })
  order: number;

  @CreateDateColumn()
  uploadedAt: Date;
}

// video.entity.ts
@Entity('videos')
export class Video {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Submission, submission => submission.videos)
  submission: Submission;

  @Column({ type: 'varchar', length: 500 })
  s3Key: string;  // ⭐ S3 경로 저장 (예: profile/videos/2025/10/uuid.mp4)

  @Column({ type: 'varchar', length: 1000 })
  url: string;  // CDN URL

  @Column({ type: 'varchar', length: 255 })
  originalFilename: string;

  @Column({ type: 'int' })
  order: number;

  @CreateDateColumn()
  uploadedAt: Date;
}
```

### 저장된 데이터 조회 및 사용

```typescript
// submission.service.ts
async findOne(id: number) {
  const submission = await this.submissionRepository.findOne({
    where: { id },
    relations: ['images', 'videos'],
  });

  return submission;
}

// API 응답 예시
{
  "id": 123,
  "name": "홍길동",
  "images": [
    {
      "id": 1,
      "s3Key": "profile/images/2025/10/uuid1.jpg",
      "url": "https://cdn.example.com/profile/images/2025/10/uuid1.jpg",
      "originalFilename": "photo1.jpg",
      "order": 0
    }
  ],
  "videos": [
    {
      "id": 1,
      "s3Key": "profile/videos/2025/10/uuid3.mp4",
      "url": "https://cdn.example.com/profile/videos/2025/10/uuid3.mp4",
      "originalFilename": "intro.mp4",
      "order": 0
    }
  ]
}

// 프론트엔드에서 렌더링
<img src={img.url} alt={img.originalFilename} />
<video src={video.url} controls />
```

## 파일명 생성 방식

### UUID 사용 (기본값, useUUID: true)
원본 파일명은 확장자 추출에만 사용되고, UUID로 파일명 생성:

```typescript
generateS3Path({
  type: 'images',
  filename: 'My Long Photo Name (2025).jpg',
});
// → uploads/images/2025/10/a3b2c1d4-e5f6-7890-abcd-ef1234567890.jpg
// 장점: DB 저장 시 경로 길이 제한 없음, 완벽한 중복 방지
```

### 원본 파일명 사용 (useUUID: false)
원본 파일명을 안전화하여 사용:

```typescript
generateS3Path({
  type: 'documents',
  filename: 'My Report (2025).pdf',
  useUUID: false,
});
// → uploads/documents/2025/10/My_Report_2025.pdf
// 특수문자 제거, 공백을 언더스코어로 변환
```

**파일명 안전화 규칙**:
- 특수문자 제거: `@#$%^&*()` → 제거
- 공백 → 언더스코어: `My File.jpg` → `My_File.jpg`
- 한글/다국어: 유지됨
- 확장자: 소문자로 변환

## S3 버킷 정책

### 날짜별 수명 주기 정책

```json
{
  "Rules": [
    {
      "Id": "ArchiveOldUploads",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "uploads/"
      },
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 365,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
```

### extraPath별 정책 적용

```json
{
  "Rules": [
    {
      "Id": "ArchiveCompanyFiles",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "company-a/"
      },
      "Transitions": [
        {
          "Days": 180,
          "StorageClass": "GLACIER"
        }
      ]
    },
    {
      "Id": "DeleteTempUploads",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "uploads/temp/"
      },
      "Expiration": {
        "Days": 7
      }
    }
  ]
}
```

## 장점

1. **날짜별 관리**: 연도/월별로 파일 정리 용이
2. **확장성**: extraPath로 무한한 파일 분류 가능
3. **간결함**: extraPath 사용 시 중복 경로(uploads) 제거
4. **충돌 방지**: UUID로 파일명 중복 방지
5. **원본 보존**: 원본 파일명도 Key에 포함
6. **유연성**: 타입, 날짜, UUID 사용 여부 모두 커스터마이징 가능
7. **수명 주기**: 날짜/경로별 자동 아카이빙 정책 적용 가능
8. **다층 경로**: `users/john/profile` 같은 복잡한 경로도 지원

## 경로 구조 비교

| 시나리오 | extraPath | 결과 경로 |
|----------|-----------|-----------|
| 프로필 이미지 | `profile` | `profile/images/2025/10/uuid_avatar.jpg` |
| 회사 파일 | `company-a` | `company-a/videos/2025/10/uuid_promo.mp4` |
| 사용자 파일 | `users/john` | `users/john/documents/2025/10/uuid_report.pdf` |
| 일반 업로드 | *(없음)* | `uploads/images/2025/10/uuid_banner.jpg` |

## 마이그레이션

기존 경로 구조에서 새 구조로 마이그레이션:

```typescript
// 기존: uploads/images/uuid_filename.jpg
// 신규: [extraPath]/images/2025/10/uuid_filename.jpg 또는
//       uploads/images/2025/10/uuid_filename.jpg

// 마이그레이션 스크립트 예시
async function migrateOldFiles() {
  const oldFiles = await listS3Objects('uploads/images/');

  for (const file of oldFiles) {
    const newKey = generateS3Path({
      type: 'images',
      filename: extractOriginalName(file.Key),
      date: file.LastModified, // 원본 날짜 유지
      extraPath: 'legacy', // 레거시 파일 표시
    });
    // 결과: legacy/images/2024/05/uuid_filename.jpg

    await copyS3Object(file.Key, newKey);
  }
}
```

## 베스트 프랙티스

1. **extraPath 네이밍**:
   - 소문자 사용: `company-a`, `users/john`
   - 특수문자 지양: `-`, `_`, `/`만 사용
   - 명확한 의미: `profile`, `avatars`, `company-{id}`

2. **타입 분류**:
   - 이미지: `images`
   - 동영상: `videos`
   - 문서: `documents`
   - 필요시 추가: `audios`, `archives` 등

3. **UUID 사용**:
   - 기본적으로 활성화 (중복 방지)
   - 특수한 경우만 비활성화 (`useUUID: false`)

4. **날짜 관리**:
   - 기본값 사용 (업로드 시점)
   - 백데이트 필요 시만 `date` 지정

5. **URL 생성**:
   - CDN 사용 권장 (성능, 비용 절감)
   - S3 Direct URL은 개발/테스트용
