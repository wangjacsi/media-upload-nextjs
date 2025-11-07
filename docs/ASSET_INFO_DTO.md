# AssetInfoDto Integration Guide

## Overview

This application has been updated to use the `AssetInfoDto` format for handling media uploads (images and videos). This standardized format ensures consistent data structure across the frontend and backend.

## Data Structure

### AssetInfoDto

```typescript
interface AssetInfoDto {
  storageKey: string;      // S3 storage path
  mimeType: string;        // File MIME type
  bytes: number;           // File size in bytes
  kind: AssetKind;         // 'image' or 'video'
  meta?: Record<string, any>; // Optional metadata
}

enum AssetKind {
  IMAGE = 'image',
  VIDEO = 'video',
}
```

### Image Metadata

```typescript
interface ImageMetadata {
  width: number;   // Image width in pixels
  height: number;  // Image height in pixels
}
```

### Video Metadata

```typescript
interface VideoMetadata {
  width: number;    // Video width in pixels
  height: number;   // Video height in pixels
  duration: number; // Video duration in seconds
}
```

## Upload Flow

### 1. Image Upload

1. Client extracts image metadata (width, height) using `getImageMetadata(file)`
2. Client requests presigned URL from `/api/upload/image`
3. Client uploads file directly to S3
4. Returns `AssetInfoDto` with:
   - `storageKey`: S3 path
   - `mimeType`: Image MIME type (e.g., 'image/jpeg')
   - `bytes`: File size
   - `kind`: 'image'
   - `meta`: `{ width, height }`

### 2. Video Upload

1. Client extracts video metadata (width, height, duration) using `getVideoMetadata(file)`
2. Client validates duration (max 10 minutes by default)
3. Client initiates multipart upload via `/api/upload/video/start`
4. Client uploads video in 8MB chunks (4 concurrent workers)
5. Client completes upload via `/api/upload/video/complete`
6. Returns `AssetInfoDto` with:
   - `storageKey`: S3 path
   - `mimeType`: Video MIME type (e.g., 'video/mp4')
   - `bytes`: File size
   - `kind`: 'video'
   - `meta`: `{ width, height, duration }`

### 3. Final Submission

After all uploads complete, the client sends to `/api/submit`:

```json
{
  "name": "User Name",
  "assets": [
    {
      "storageKey": "uploads/images/2025/01/uuid-123.jpg",
      "mimeType": "image/jpeg",
      "bytes": 50000,
      "kind": "image",
      "meta": {
        "width": 1920,
        "height": 1080
      }
    },
    {
      "storageKey": "uploads/videos/2025/01/uuid-456.mp4",
      "mimeType": "video/mp4",
      "bytes": 10485760,
      "kind": "video",
      "meta": {
        "width": 1920,
        "height": 1080,
        "duration": 120.5
      }
    }
  ]
}
```

## API Response

The `/api/submit` endpoint returns:

```json
{
  "ok": true,
  "id": "submission-id",
  "assets": [
    /* Array of AssetInfoDto objects */
  ]
}
```

## File Locations

- **Types**: `lib/asset-types.ts`
  - `AssetInfoDto` interface
  - `AssetKind` enum
  - `ImageMetadata` interface
  - `VideoMetadata` interface

- **Utilities**: `lib/media-utils.ts`
  - `getImageMetadata(file)`: Extract image dimensions
  - `getVideoMetadata(file)`: Extract video dimensions and duration

- **Frontend**: `app/upload/page.tsx`
  - `uploadImageWithProgress()`: Returns `AssetInfoDto`
  - `uploadVideoMultipart()`: Returns `AssetInfoDto`
  - Combines all assets into single array for submission

- **Backend**: `app/api/submit/route.ts`
  - Accepts `{ name: string, assets: AssetInfoDto[] }`
  - Validates and processes asset array
  - Returns asset array in response

## Benefits

1. **Type Safety**: Full TypeScript type checking across client and server
2. **Metadata Rich**: Automatic extraction of image/video dimensions and duration
3. **Standardized Format**: Consistent data structure for all media types
4. **Extensible**: Easy to add new metadata fields via `meta` object
5. **Backend Compatible**: Matches NestJS DTO structure with decorators

## Migration Notes

### Previous Format

```typescript
// Old format
{
  name: string,
  images: Array<{ key: string, originalFilename: string, order: number }>,
  videos: Array<{ key: string, originalFilename: string, order: number }>
}
```

### New Format

```typescript
// New format
{
  name: string,
  assets: AssetInfoDto[]
}
```

### Key Changes

1. **Unified Array**: Images and videos are now in a single `assets` array
2. **Rich Metadata**: Each asset includes MIME type, size, kind, and metadata
3. **No Order Field**: Asset order is preserved by array index
4. **No Original Filename**: Filename can be derived from storageKey if needed

## Usage Example

```typescript
import { AssetInfoDto, AssetKind } from '@/lib/asset-types';
import { getImageMetadata, getVideoMetadata } from '@/lib/media-utils';

// Upload image
const imageAsset: AssetInfoDto = await uploadImageWithProgress(file);
console.log(imageAsset.meta?.width); // Image width

// Upload video
const videoAsset: AssetInfoDto = await uploadVideoMultipart(file);
console.log(videoAsset.meta?.duration); // Video duration in seconds

// Submit all assets
const response = await fetch('/api/submit', {
  method: 'POST',
  body: JSON.stringify({
    name: 'John Doe',
    assets: [imageAsset, videoAsset]
  })
});
```

## Database Integration

When saving to database, you can use the AssetInfoDto structure directly:

```typescript
// Example with Prisma/TypeORM
await db.submission.create({
  data: {
    name: body.name,
    assets: {
      create: body.assets.map(asset => ({
        storageKey: asset.storageKey,
        url: `https://cdn.example.com/${asset.storageKey}`,
        mimeType: asset.mimeType,
        bytes: asset.bytes,
        kind: asset.kind,
        width: asset.meta?.width,
        height: asset.meta?.height,
        duration: asset.meta?.duration,
      }))
    }
  }
});
```
