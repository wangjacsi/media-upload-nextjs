import { NextRequest, NextResponse } from "next/server";
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";
import { generateS3Path } from "@/lib/s3-path";

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType, fileSize, durationSeconds, extraPath } = await req.json();

    // 제한: 1GB 이하, 10분 이하
    const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
    const MAX_VIDEO_SECONDS = 10 * 60;
    if (fileSize > MAX_VIDEO_BYTES) {
      return NextResponse.json({ error: "동영상 용량(1GB) 초과" }, { status: 400 });
    }
    if (durationSeconds > MAX_VIDEO_SECONDS) {
      return NextResponse.json({ error: "동영상 길이(10분) 초과" }, { status: 400 });
    }
    if (!/^video\/(mp4|quicktime|webm|ogg)$/.test(contentType)) {
      return NextResponse.json({ error: "허용되지 않은 동영상 타입" }, { status: 400 });
    }

    // 동적 경로 생성
    // extraPath 있을 때: [extraPath]/videos/YYYY/MM/uuid.ext
    // extraPath 없을 때: uploads/videos/YYYY/MM/uuid.ext
    const Key = generateS3Path({
      type: 'videos',
      filename, // 확장자 추출용
      extraPath, // 선택적: 'profile', 'company-a', 'users/john' 등
    });

    const create = new CreateMultipartUploadCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key,
      ContentType: contentType,
      ACL: "private",
    });
    const res = await s3.send(create);
    return NextResponse.json({ key: Key, uploadId: res.UploadId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "server error" }, { status: 500 });
  }
}
