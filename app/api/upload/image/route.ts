import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "@/lib/s3";
import { generateS3Path } from "@/lib/s3-path";

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType, fileSize, extraPath } = await req.json();

    // 제한: 이미지 5MB 이하
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    if (fileSize > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "이미지 용량(5MB) 초과" }, { status: 400 });
    }
    if (!/^image\//.test(contentType)) {
      return NextResponse.json({ error: "이미지 MIME만 허용" }, { status: 400 });
    }

    // 동적 경로 생성
    // extraPath 있을 때: [extraPath]/images/YYYY/MM/uuid.ext
    // extraPath 없을 때: uploads/images/YYYY/MM/uuid.ext
    const key = generateS3Path({
      type: 'images',
      filename, // 확장자 추출용
      extraPath, // 선택적: 'profile', 'company-a', 'users/john' 등
    });

    const cmd = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      ContentType: contentType,
      ACL: "private",
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 5 }); // 5분
    return NextResponse.json({ uploadUrl: url, storageKey: key });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "server error" }, { status: 500 });
  }
}
