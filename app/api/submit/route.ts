import { NextRequest, NextResponse } from "next/server";
import { AssetInfoDto } from "@/lib/asset-types";

interface SubmitRequestBody {
  name: string;
  assets: AssetInfoDto[];
}

export async function POST(req: NextRequest) {
  try {
    const body: SubmitRequestBody = await req.json();

    // body 예시:
    // {
    //   name: "홍길동",
    //   assets: [
    //     {
    //       storageKey: "uploads/images/uuid_img1.webp",
    //       mimeType: "image/webp",
    //       bytes: 50000,
    //       kind: "image",
    //       meta: { width: 1920, height: 1080 }
    //     },
    //     {
    //       storageKey: "uploads/videos/uuid_video.mp4",
    //       mimeType: "video/mp4",
    //       bytes: 10485760,
    //       kind: "video",
    //       meta: { width: 1920, height: 1080, duration: 120.5 }
    //     }
    //   ]
    // }

    // AssetInfoDto 배열 검증
    if (!body.assets || !Array.isArray(body.assets)) {
      return NextResponse.json(
        { error: "assets 필드가 필요합니다." },
        { status: 400 }
      );
    }

    // TODO: DB 저장 예시
    // await db.submissions.create({
    //   name: body.name,
    //   assets: body.assets.map(asset => ({
    //     s3Key: asset.storageKey,
    //     url: `https://YOUR-BUCKET.s3.ap-northeast-2.amazonaws.com/${asset.storageKey}`,
    //     // 또는 CDN: `https://YOUR-CDN.cloudfront.net/${asset.storageKey}`,
    //     mimeType: asset.mimeType,
    //     bytes: asset.bytes,
    //     kind: asset.kind,
    //     meta: asset.meta,
    //   })),
    // });

    console.log("FORM SUBMIT:", JSON.stringify(body, null, 2));

    // AssetInfoDto 배열을 그대로 반환 (백엔드에서 받은 형식 그대로 클라이언트에 전달)
    return NextResponse.json({
      ok: true,
      id: "mock-id-123",
      assets: body.assets, // AssetInfoDto[] 반환
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "server error" }, { status: 500 });
  }
}
