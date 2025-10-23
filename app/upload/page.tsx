"use client";

import { useRef, useState } from "react";

const MAX_IMAGES = Number(process.env.NEXT_PUBLIC_UPLOAD_MAX_IMAGES ?? 10);
const MAX_VIDEOS = Number(process.env.NEXT_PUBLIC_UPLOAD_MAX_VIDEOS ?? 3);
const MAX_IMAGE_BYTES = (Number(process.env.NEXT_PUBLIC_UPLOAD_MAX_IMAGE_MB ?? 5)) * 1024 * 1024;
const MAX_VIDEO_BYTES = (Number(process.env.NEXT_PUBLIC_UPLOAD_MAX_VIDEO_MB ?? 1024)) * 1024 * 1024;
const MAX_VIDEO_SECONDS = Number(process.env.NEXT_PUBLIC_UPLOAD_MAX_VIDEO_SECONDS ?? 600);

// 비디오 메타(길이) 읽기
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
    video.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error("동영상 메타 정보를 읽을 수 없습니다."));
    };
    video.src = url;
  });
}

// 이미지 단일 PUT 업로드 (progress 지원: XMLHttpRequest)
async function uploadImageWithProgress(
  file: File,
  extraPath?: string,
  onProgress?: (p: number) => void
): Promise<string> {
  // 서버에서 URL/Key 받기
  const pres = await fetch("/api/upload/image", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      fileSize: file.size,
      extraPath, // 선택적: 'profile', 'company-a', 'users/john' 등
    }),
  });
  if (!pres.ok) throw new Error("이미지 Presigned URL 생성 실패");
  const { uploadUrl, storageKey } = await pres.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("이미지 업로드 실패"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("이미지 업로드 실패"));
    };
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });

  return storageKey; // S3 key 반환
}

// 동영상 멀티파트 업로드 (간단 진행률: 파트 완료 기준)
async function uploadVideoMultipart(
  file: File,
  durationSeconds: number,
  extraPath?: string,
  onProgress?: (p: number) => void
): Promise<string> {
  // 1) 세션 시작
  const startRes = await fetch("/api/upload/video/start", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      fileSize: file.size,
      durationSeconds,
      extraPath, // 선택적: 'profile', 'company-a', 'users/john' 등
    }),
  });
  if (!startRes.ok) throw new Error("동영상 업로드 시작 실패");
  const { key, uploadId } = await startRes.json();

  // 2) 파트 업로드 (8MB씩, 동시 4개)
  const PART_SIZE = 8 * 1024 * 1024;
  const totalParts = Math.ceil(file.size / PART_SIZE);
  const uploadedParts: Array<{ ETag: string; PartNumber: number }> = [];
  let nextPart = 1;

  const worker = async () => {
    while (nextPart <= totalParts) {
      const myPart = nextPart++;
      const start = (myPart - 1) * PART_SIZE;
      const end = Math.min(start + PART_SIZE, file.size);
      const blob = file.slice(start, end);

      // Part URL 요청
      const pres = await fetch("/api/upload/video/part", {
        method: "POST",
        body: JSON.stringify({ key, uploadId, partNumber: myPart }),
      });
      if (!pres.ok) throw new Error(`파트 URL 생성 실패: ${myPart}`);
      const { url } = await pres.json();

      // 진행률(간단히: 파트 완료 수 기준)
      const resp = await fetch(url, { method: "PUT", body: blob });
      if (!resp.ok) throw new Error(`파트 업로드 실패: ${myPart}`);
      const eTag = resp.headers.get("ETag")?.replaceAll('"', "") || "";
      uploadedParts.push({ ETag: eTag, PartNumber: myPart });
      if (onProgress) onProgress(Math.round((uploadedParts.length / totalParts) * 100));
    }
  };

  const concurrency = 4;
  await Promise.all(Array.from({ length: concurrency }).map(worker));

  // 3) 완료
  const completeRes = await fetch("/api/upload/video/complete", {
    method: "POST",
    body: JSON.stringify({ key, uploadId, parts: uploadedParts }),
  });
  if (!completeRes.ok) throw new Error("동영상 업로드 완료 실패");

  const { storageKey } = await completeRes.json();
  return storageKey;
}

export default function UploadPage() {
  const [name, setName] = useState("");
  const [extraPath, setExtraPath] = useState(""); // 추가 경로 (예: 'profile', 'company-a', 'users/john')
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);

  const [imgProgress, setImgProgress] = useState<number[]>([]);
  const [videoProgress, setVideoProgress] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const onChangeImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > MAX_IMAGES) {
      alert(`이미지는 최대 ${MAX_IMAGES}장까지 허용됩니다.`);
      e.target.value = "";
      return;
    }
    // 용량 체크
    for (const f of files) {
      if (!/^image\//.test(f.type)) {
        alert(`이미지 타입만 허용됩니다: ${f.name}`);
        e.target.value = "";
        return;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        alert(`이미지 용량(5MB) 초과: ${f.name}`);
        e.target.value = "";
        return;
      }
    }
    setImageFiles(files);
    setImgProgress(Array(files.length).fill(0));
  };

  const onChangeVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > MAX_VIDEOS) {
      alert(`동영상은 최대 ${MAX_VIDEOS}개까지 허용됩니다.`);
      e.target.value = "";
      return;
    }
    // 용량 체크
    for (const f of files) {
      if (!/^video\//.test(f.type)) {
        alert(`동영상 파일만 허용됩니다: ${f.name}`);
        e.target.value = "";
        return;
      }
      if (f.size > MAX_VIDEO_BYTES) {
        alert(`동영상 용량(1GB) 초과: ${f.name}`);
        e.target.value = "";
        return;
      }
    }
    setVideoFiles(files);
    setVideoProgress(Array(files.length).fill(0));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("이름을 입력해 주세요.");
      return;
    }
    setSubmitting(true);

    try {
      // 1) 이미지 업로드(병렬) - Promise.all로 순서 보장하면서 동시 업로드
      const imageKeys: string[] = await Promise.all(
        imageFiles.map((file, i) =>
          uploadImageWithProgress(
            file,
            extraPath || undefined, // extraPath 값이 비어있으면 undefined
            (p: number) => {
              setImgProgress((prev) => {
                const next = [...prev];
                next[i] = p;
                return next;
              });
            }
          )
        )
      );

      // 이미지 업로드 완료 로그
      if (imageKeys.length > 0) {
        console.log("✅ 이미지 업로드 완료:");
        imageKeys.forEach((key, i) => {
          console.log(`  [${i}] ${imageFiles[i].name} → ${key}`);
        });
      }

      // 2) 동영상 업로드(병렬) - Promise.all로 순서 보장하면서 동시 업로드
      const videoKeys: string[] = await Promise.all(
        videoFiles.map(async (file, i) => {
          const duration = await getVideoDurationSeconds(file);
          if (duration > MAX_VIDEO_SECONDS) {
            throw new Error(`동영상 길이(10분) 초과: ${file.name}`);
          }
          return uploadVideoMultipart(
            file,
            duration,
            extraPath || undefined,
            (p: number) => {
              setVideoProgress((prev) => {
                const next = [...prev];
                next[i] = p;
                return next;
              });
            }
          );
        })
      );

      // 동영상 업로드 완료 로그
      if (videoKeys.length > 0) {
        console.log("✅ 동영상 업로드 완료:");
        videoKeys.forEach((key, i) => {
          console.log(`  [${i}] ${videoFiles[i].name} → ${key}`);
        });
      }

      // 3) 최종 폼 제출 (이름 + 업로드된 S3 key 목록 + 원본 파일명)
      const submitData = {
        name,
        images: imageKeys.map((key, i) => ({
          key,
          originalFilename: imageFiles[i].name,
          order: i,
        })),
        videos: videoKeys.map((key, i) => ({
          key,
          originalFilename: videoFiles[i].name,
          order: i,
        })),
      };

      console.log("📤 최종 제출 데이터:");
      console.log(JSON.stringify(submitData, null, 2));

      const res = await fetch("/api/submit", {
        method: "POST",
        body: JSON.stringify(submitData),
      });
      if (!res.ok) throw new Error("폼 제출 실패");
      const data = await res.json();

      console.log("✅ 제출 완료! 서버 응답:", data);
      alert(`제출 완료! id=${data.id}`);
      // 초기화
      setName("");
      setImageFiles([]);
      setVideoFiles([]);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
      setImgProgress([]);
      setVideoProgress([]);
    } catch (err: any) {
      alert(err.message ?? "업로드/제출 중 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">프로필 업로드 폼</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 예: 다른 폼 데이터(이름) */}
        <div>
          <label className="block mb-1">이름</label>
          <input
            className="border rounded px-3 py-2 w-full"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            required
          />
        </div>

        {/* 추가 경로 (선택사항) */}
        <div>
          <label className="block mb-1">
            추가 경로 (선택사항)
            <span className="text-sm text-gray-500 ml-2">
              예: profile, company-a, users/john
            </span>
          </label>
          <input
            className="border rounded px-3 py-2 w-full"
            type="text"
            value={extraPath}
            onChange={(e) => setExtraPath(e.target.value)}
            placeholder="profile"
          />
          <p className="text-xs text-gray-500 mt-1">
            입력 시: {extraPath || "[extraPath]"}/images/2025/10/uuid.jpg<br />
            미입력 시: uploads/images/2025/10/uuid.jpg
          </p>
        </div>

        {/* 이미지 (최대 10장, 각 5MB 이하) */}
        <div>
          <label className="block mb-1">이미지 (최대 {MAX_IMAGES}장, 각 5MB 이하)</label>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onChangeImages}
          />
          {imageFiles.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {imageFiles.map((f, idx) => (
                <li key={idx}>
                  {f.name} — {Math.round(f.size / 1024)} KB — 진행률 {imgProgress[idx]}%
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 동영상 (최대 3개, 각 10분 이하·1GB 이하) */}
        <div>
          <label className="block mb-1">동영상 (최대 {MAX_VIDEOS}개, 각 10분 이하·1GB 이하)</label>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            multiple
            onChange={onChangeVideo}
          />
          {videoFiles.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {videoFiles.map((f, idx) => (
                <li key={idx}>
                  {f.name} — {Math.round(f.size / (1024 * 1024))} MB — 진행률 {videoProgress[idx]}%
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {submitting ? "업로드/제출 중..." : "업로드 후 제출"}
        </button>
      </form>
    </main>
  );
}
