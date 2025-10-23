# 비디오 멀티파트 업로드 프로세스

## 개요

비디오 파일은 용량이 크기 때문에 **멀티파트 업로드(Multipart Upload)** 방식을 사용합니다. 이는 큰 파일을 여러 조각(part)으로 나눠서 병렬로 업로드하는 방식으로, 속도와 안정성을 향상시킵니다.

## 환경변수 설정

업로드 제한은 `.env.local` 파일에서 커스터마이징할 수 있습니다:

```bash
# 업로드 개수 제한
NEXT_PUBLIC_UPLOAD_MAX_IMAGES=10    # 이미지 최대 개수
NEXT_PUBLIC_UPLOAD_MAX_VIDEOS=3     # 동영상 최대 개수

# 업로드 용량/시간 제한
NEXT_PUBLIC_UPLOAD_MAX_IMAGE_MB=5          # 이미지 용량 (MB)
NEXT_PUBLIC_UPLOAD_MAX_VIDEO_MB=1024       # 동영상 용량 (MB)
NEXT_PUBLIC_UPLOAD_MAX_VIDEO_SECONDS=600   # 동영상 길이 (초)
```

**사용 예시**:
- 동영상을 5개까지 업로드하려면: `NEXT_PUBLIC_UPLOAD_MAX_VIDEOS=5`
- 이미지를 20개까지 업로드하려면: `NEXT_PUBLIC_UPLOAD_MAX_IMAGES=20`

## 지원하는 동영상 포맷

### MIME Types
- `video/mp4` - MP4 (가장 일반적)
- `video/quicktime` - MOV (Apple QuickTime)
- `video/webm` - WebM (웹 표준)
- `video/ogg` - OGG (오픈 포맷)

### 파일 확장자
- `.mp4`
- `.mov`
- `.webm`
- `.ogg`
- `.ogv`

### 업로드 제한
- **최대 개수**: 환경변수로 설정 가능 (기본값: 3개)
- **최대 용량**: 1GB (1024MB) - 각 파일당
- **최대 길이**: 10분 (600초) - 각 파일당
- **검증 시점**: 클라이언트 & 서버 양쪽에서 검증
- **병렬 업로드**: Promise.all을 사용하여 여러 동영상 동시 업로드

## 전체 업로드 흐름

```
┌─────────────────────────────────────────────────────────┐
│ 1. START: 업로드 세션 시작                                │
│    POST /api/upload/video/start                         │
│    → uploadId 발급                                       │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 2. PART: 조각별 업로드 (병렬 처리)                         │
│    POST /api/upload/video/part (여러 번)                │
│    → 8MB씩 조각내어 4개씩 동시 업로드                      │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 3. COMPLETE: 업로드 완료                                  │
│    POST /api/upload/video/complete                      │
│    → S3가 조각들을 하나의 파일로 병합                       │
└─────────────────────────────────────────────────────────┘
```

## 1단계: START - 업로드 세션 시작

### 클라이언트 요청

```typescript
// app/upload/page.tsx
const startRes = await fetch("/api/upload/video/start", {
  method: "POST",
  body: JSON.stringify({
    filename: "intro.mp4",
    contentType: "video/mp4",
    fileSize: 500000000,  // 500MB
    durationSeconds: 120,  // 2분
    extraPath: "profile"   // 선택사항
  }),
});

const { key, uploadId } = await startRes.json();
```

**응답**:
```json
{
  "key": "profile/videos/2025/10/a3b2c1d4-e5f6-7890-abcd-ef1234567890.mp4",
  "uploadId": "ABC123XYZ789..."
}
```

### 서버 처리

```typescript
// app/api/upload/video/start/route.ts
// 1. 파일 검증
if (fileSize > 1024 * 1024 * 1024) {
  return NextResponse.json({ error: "동영상 용량(1GB) 초과" });
}
if (durationSeconds > 10 * 60) {
  return NextResponse.json({ error: "동영상 길이(10분) 초과" });
}
if (!/^video\/(mp4|quicktime|webm|ogg)$/.test(contentType)) {
  return NextResponse.json({ error: "허용되지 않은 동영상 타입" });
}

// 2. S3 경로 생성
const Key = generateS3Path({
  type: 'videos',
  filename,      // 확장자 추출용
  extraPath,     // 선택사항
});

// 3. S3 멀티파트 업로드 시작
const create = new CreateMultipartUploadCommand({
  Bucket: process.env.AWS_S3_BUCKET!,
  Key,
  ContentType: contentType,
  ACL: "private",
});
const res = await s3.send(create);

return NextResponse.json({
  key: Key,
  uploadId: res.UploadId  // 이후 모든 Part에서 사용
});
```

**역할**: S3에 "이 파일을 업로드할 예정"이라고 선언하고 고유 `uploadId` 받기

---

## 2단계: PART - 조각별 업로드 (병렬)

### 파일 분할 및 병렬 업로드

```typescript
// app/upload/page.tsx

// 1. 파일 분할 설정
const PART_SIZE = 8 * 1024 * 1024;  // 8MB
const totalParts = Math.ceil(file.size / PART_SIZE);
// 예: 500MB ÷ 8MB = 63 parts

const uploadedParts: Array<{ ETag: string; PartNumber: number }> = [];
let nextPart = 1;

// 2. 워커 함수 (Part 업로드)
const worker = async () => {
  while (nextPart <= totalParts) {
    const myPart = nextPart++;  // 원자적 증가
    const start = (myPart - 1) * PART_SIZE;
    const end = Math.min(start + PART_SIZE, file.size);
    const blob = file.slice(start, end);  // 8MB 조각

    // 2-1. Part용 Presigned URL 요청
    const pres = await fetch("/api/upload/video/part", {
      method: "POST",
      body: JSON.stringify({
        key,
        uploadId,
        partNumber: myPart
      }),
    });
    const { url } = await pres.json();

    // 2-2. S3에 직접 PUT
    const resp = await fetch(url, {
      method: "PUT",
      body: blob
    });

    // 2-3. ETag 저장 (완료 시 필요)
    const eTag = resp.headers.get("ETag")?.replaceAll('"', '') || "";
    uploadedParts.push({ ETag: eTag, PartNumber: myPart });

    // 2-4. 진행률 업데이트
    if (onProgress) {
      onProgress(Math.round((uploadedParts.length / totalParts) * 100));
    }
  }
};

// 3. 4개 워커 동시 실행
const concurrency = 4;
await Promise.all(
  Array.from({ length: concurrency }).map(worker)
);
```

### 서버: Part URL 생성

```typescript
// app/api/upload/video/part/route.ts
const cmd = new UploadPartCommand({
  Bucket: process.env.AWS_S3_BUCKET!,
  Key: key,
  UploadId: uploadId,
  PartNumber: partNumber,  // 1, 2, 3, ...
});

const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 10 }); // 10분
return NextResponse.json({ url });
```

### 병렬 업로드 시각화

```
시간축 →

워커1: [Part 1 ] [Part 5 ] [Part 9 ] [Part 13] ...
워커2: [Part 2 ] [Part 6 ] [Part 10] [Part 14] ...
워커3: [Part 3 ] [Part 7 ] [Part 11] [Part 15] ...
워커4: [Part 4 ] [Part 8 ] [Part 12] [Part 16] ...

진행률: 16/63 → 25%
```

**역할**:
- 파일을 8MB씩 조각내어 업로드
- 4개 워커가 동시에 작업 (속도 약 4배 향상)
- 각 Part의 ETag 수집 (완료 시 필요)

---

## 3단계: COMPLETE - 업로드 완료

### 클라이언트 요청

```typescript
// app/upload/page.tsx
const completeRes = await fetch("/api/upload/video/complete", {
  method: "POST",
  body: JSON.stringify({
    key,
    uploadId,
    parts: uploadedParts  // ETag와 PartNumber 배열
  }),
});
```

**요청 데이터**:
```json
{
  "key": "profile/videos/2025/10/uuid.mp4",
  "uploadId": "ABC123...",
  "parts": [
    { "ETag": "etag1", "PartNumber": 1 },
    { "ETag": "etag2", "PartNumber": 2 },
    ...
    { "ETag": "etag63", "PartNumber": 63 }
  ]
}
```

### 서버 처리

```typescript
// app/api/upload/video/complete/route.ts
// 1. Parts 정렬 (순서대로)
parts.sort((a, b) => a.PartNumber - b.PartNumber);

// 2. S3에 완료 요청
const cmd = new CompleteMultipartUploadCommand({
  Bucket: process.env.AWS_S3_BUCKET!,
  Key: key,
  UploadId: uploadId,
  MultipartUpload: { Parts: parts }
});

await s3.send(cmd);
return NextResponse.json({ ok: true, storageKey: key });
```

**역할**: S3에 "모든 조각 업로드 완료, 하나의 파일로 합쳐줘"라고 요청

---

## 타임라인 예시

### 500MB 비디오 업로드 시

```
시간   | 단계                | 상태
-------|---------------------|----------------------------------
0초    | START               | uploadId 발급
       |                     |
1-60초 | PART 업로드          | 63개 조각 업로드 중...
       |                     | ┌─ Worker 1: Part 1, 5, 9...
       |                     | ├─ Worker 2: Part 2, 6, 10...
       |                     | ├─ Worker 3: Part 3, 7, 11...
       |                     | └─ Worker 4: Part 4, 8, 12...
       |                     |
15초   |                     | 진행률: 25% (16/63 완료)
30초   |                     | 진행률: 50% (32/63 완료)
45초   |                     | 진행률: 75% (48/63 완료)
       |                     |
60초   | COMPLETE            | S3가 조각들을 병합 중...
       |                     |
62초   | ✅ 완료              | 업로드 완료!
```

---

## 장점

### 1. 대용량 파일 처리
- 1GB 영상을 125개 조각(8MB)으로 분할 업로드
- 메모리 효율적 (전체 파일을 메모리에 올리지 않음)

### 2. 속도 향상
- 순차 업로드: 500MB ÷ 10MB/s = 50초
- 병렬 업로드 (4개): 500MB ÷ (10MB/s × 4) = 12.5초
- **약 4배 빠름**

### 3. 안정성
- Part 10 실패 시 → Part 10만 재업로드
- 전체 파일을 다시 업로드할 필요 없음

### 4. 진행률 추적
```typescript
onProgress(Math.round((uploadedParts.length / totalParts) * 100));
// 30/63 완료 → 약 48% 진행
```

### 5. 서버 부담 없음
- 클라이언트 → S3 직접 업로드
- 서버는 Presigned URL 생성만 담당
- 서버 대역폭 절약

---

## 이미지 vs 비디오 비교

| 항목 | 이미지 (단일 업로드) | 비디오 (멀티파트) |
|------|---------------------|------------------|
| **최대 개수** | 설정 가능 (기본 10개) | 설정 가능 (기본 3개) |
| **최대 용량** | 5MB | 1GB (1024MB) |
| **API 엔드포인트** | 1개 | 3개 |
| **업로드 방식** | 단일 PUT | 멀티파트 (여러 Part) |
| **요청 횟수** | 2번 | 2 + N + 1번 |
| **병렬 처리** | ✅ (Promise.all) | ✅ (4개 워커 동시) |
| **진행률** | XMLHttpRequest 진행률 | Part 완료 수 기준 |
| **속도** | 중간 | 빠름 (병렬) |
| **재시도** | 전체 재업로드 | 실패한 Part만 재업로드 |

### 요청 횟수 상세

**이미지**:
1. Presigned URL 요청
2. S3 PUT

**비디오** (500MB, 63 parts):
1. START 요청 (uploadId 받기)
2. PART URL 요청 × 63번
3. S3 PUT × 63번
4. COMPLETE 요청

---

## 에러 처리

### 클라이언트

```typescript
try {
  // START
  const { key, uploadId } = await startMultipartUpload();

  // PART
  const parts = await uploadParts(file, key, uploadId);

  // COMPLETE
  await completeMultipartUpload(key, uploadId, parts);
} catch (error) {
  // 실패 시 중단 (선택적으로 AbortMultipartUpload 호출 가능)
  console.error("업로드 실패:", error);
}
```

### Part 재시도 로직 (선택사항)

```typescript
const worker = async () => {
  while (nextPart <= totalParts) {
    const myPart = nextPart++;
    let retries = 3;

    while (retries > 0) {
      try {
        // Part 업로드 시도
        const resp = await uploadPart(myPart);
        uploadedParts.push({ ETag: resp.ETag, PartNumber: myPart });
        break; // 성공
      } catch (error) {
        retries--;
        if (retries === 0) throw error; // 3번 실패 시 에러
        await sleep(1000); // 1초 대기 후 재시도
      }
    }
  }
};
```

---

## 최적화 팁

### 1. Part 크기 조정
```typescript
// 작은 파일 (< 100MB): 5MB
const PART_SIZE = 5 * 1024 * 1024;

// 큰 파일 (> 500MB): 10MB
const PART_SIZE = 10 * 1024 * 1024;

// 기본: 8MB (권장)
const PART_SIZE = 8 * 1024 * 1024;
```

### 2. 동시성 조정
```typescript
// 느린 네트워크: 2개
const concurrency = 2;

// 일반: 4개 (권장)
const concurrency = 4;

// 빠른 네트워크: 6-8개
const concurrency = 8;
```

### 3. 진행률 최적화
```typescript
// 매 Part마다 UI 업데이트 (부드러움)
if (onProgress) {
  onProgress(Math.round((uploadedParts.length / totalParts) * 100));
}

// 10% 단위로만 업데이트 (성능 향상)
const progress = Math.floor((uploadedParts.length / totalParts) * 10) * 10;
if (progress !== lastProgress) {
  onProgress(progress);
  lastProgress = progress;
}
```

---

## 보안 고려사항

### 1. Presigned URL 만료 시간
```typescript
// Part URL: 10분 (충분한 시간)
const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 10 });
```

### 2. 서버 검증
- 파일 크기 (1GB 이하)
- 동영상 길이 (10분 이하)
- MIME 타입 (허용된 포맷만)

### 3. 클라이언트 검증
```typescript
// 브라우저에서 동영상 메타데이터 읽기
async function getVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const sec = video.duration;
      URL.revokeObjectURL(url);
      resolve(sec);
    };
    video.src = url;
  });
}
```

---

## 참고 자료

- [AWS S3 Multipart Upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [AWS SDK v3 - S3 Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)
- [S3 Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)
