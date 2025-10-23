import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // body 예시:
    // {
    //   name: "홍길동",
    //   images: [
    //     { key: "uploads/images/uuid_img1.webp", originalFilename: "photo1.jpg", order: 0 },
    //     { key: "uploads/images/uuid_img2.webp", originalFilename: "photo2.jpg", order: 1 }
    //   ],
    //   video: { key: "uploads/videos/uuid_video.mp4", originalFilename: "myvideo.mp4" } | null
    // }

    // TODO: DB 저장 예시
    // await db.submissions.create({
    //   name: body.name,
    //   images: body.images.map(img => ({
    //     s3Key: img.key,
    //     url: `https://YOUR-BUCKET.s3.ap-northeast-2.amazonaws.com/${img.key}`,
    //     // 또는 CDN: `https://YOUR-CDN.cloudfront.net/${img.key}`,
    //     originalFilename: img.originalFilename,
    //     order: img.order,
    //   })),
    //   video: body.video ? {
    //     s3Key: body.video.key,
    //     url: `https://YOUR-BUCKET.s3.ap-northeast-2.amazonaws.com/${body.video.key}`,
    //     originalFilename: body.video.originalFilename,
    //   } : null,
    // });

    console.log("FORM SUBMIT:", JSON.stringify(body, null, 2));
    return NextResponse.json({ ok: true, id: "mock-id-123" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "server error" }, { status: 500 });
  }
}
