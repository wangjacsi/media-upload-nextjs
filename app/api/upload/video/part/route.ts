import { NextRequest, NextResponse } from "next/server";
import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "@/lib/s3";

export async function POST(req: NextRequest) {
  try {
    const { key, uploadId, partNumber } = await req.json();
    const cmd = new UploadPartCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 10 }); // 10분
    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "server error" }, { status: 500 });
  }
}
