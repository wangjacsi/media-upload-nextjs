import { NextRequest, NextResponse } from "next/server";
import { CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";

export async function POST(req: NextRequest) {
  try {
    const { key, uploadId, parts } = await req.json();
    // parts: [{ETag:string, PartNumber:number}]
    parts.sort((a: any, b: any) => a.PartNumber - b.PartNumber);
    const cmd = new CompleteMultipartUploadCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    });
    await s3.send(cmd);
    return NextResponse.json({ ok: true, storageKey: key });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "server error" }, { status: 500 });
  }
}
