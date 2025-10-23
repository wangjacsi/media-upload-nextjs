# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 14 application built with TypeScript and shadcn/ui components, serving as a reference implementation for a Udemy course on building beautiful dashboards with shadcn UI. The project includes a video upload testing implementation that demonstrates client-side file uploads to AWS S3 without server burden.

## Development Commands

```bash
# Development server (default: http://localhost:3000)
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Lint code
npm run lint
```

## Project Structure

```
support-me-course/
├── app/
│   ├── (logged-out)/          # Authentication pages (login, sign-up)
│   ├── dashboard/              # Main dashboard pages
│   │   ├── components/         # Dashboard-specific components
│   │   ├── employees/          # Employee management
│   │   ├── teams/              # Team management
│   │   ├── account/            # Account settings
│   │   └── settings/           # Application settings
│   ├── upload/                 # Video/image upload testing page
│   └── api/                    # Next.js API routes
│       ├── upload/
│       │   ├── image/          # Single-file image upload (presigned URL)
│       │   └── video/          # Multipart video upload (start/part/complete)
│       └── submit/             # Final form submission endpoint
├── components/ui/              # shadcn/ui components
├── lib/
│   ├── utils.ts                # Utility functions (cn, etc.)
│   └── s3.ts                   # AWS S3 client configuration
└── hooks/                      # Custom React hooks
```

## Video Upload Architecture

The application implements a sophisticated file upload system designed to minimize server load by uploading directly to AWS S3 from the client:

### Image Upload (Single-file, presigned URL)
1. **Client**: Request presigned URL from `/api/upload/image` with file metadata
2. **Server**: Generate presigned URL using `PutObjectCommand` (5-minute expiry)
3. **Client**: Upload directly to S3 via XMLHttpRequest with progress tracking
4. **Constraints**: Configurable max images (default 10), 5MB each
5. **Parallel Upload**: Multiple images uploaded concurrently using Promise.all

### Video Upload (Multipart)
1. **Start**: `/api/upload/video/start` initiates multipart upload via `CreateMultipartUploadCommand`
   - Validates: 1GB max size, 10-minute max duration, allowed MIME types (mp4/quicktime/webm/ogg)
   - Returns: S3 key and uploadId
2. **Upload Parts**: Client splits file into 8MB chunks, uploads 4 concurrently
   - Each part requests presigned URL from `/api/upload/video/part` (10-minute expiry)
   - Progress tracked by completed parts
3. **Complete**: `/api/upload/video/complete` finalizes upload via `CompleteMultipartUploadCommand`
   - Returns: storageKey for database persistence
4. **Constraints**: Configurable max videos (default 3), 1GB each
5. **Parallel Upload**: Multiple videos uploaded concurrently using Promise.all

### File Validation
- **Images**: MIME type check, 5MB limit (client + server)
- **Videos**: MIME type check, duration validation (browser `<video>` metadata), 1GB limit

### Final Submission
- After all files uploaded to S3, client POSTs to `/api/submit` with S3 keys
- Server receives structured data with order tracking:
  - `images[]`: Array of `{key, originalFilename, order}`
  - `videos[]`: Array of `{key, originalFilename, order}`
- Order field preserves upload sequence for database persistence

## Key Technical Details

### AWS S3 Configuration
- S3 client initialized in `lib/s3.ts`
- Requires environment variables:
  - `AWS_REGION`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `AWS_S3_BUCKET`
  - Upload limits (customizable):
    - `NEXT_PUBLIC_UPLOAD_MAX_IMAGES` (default: 10)
    - `NEXT_PUBLIC_UPLOAD_MAX_VIDEOS` (default: 3)
    - `NEXT_PUBLIC_UPLOAD_MAX_IMAGE_MB` (default: 5)
    - `NEXT_PUBLIC_UPLOAD_MAX_VIDEO_MB` (default: 1024)
    - `NEXT_PUBLIC_UPLOAD_MAX_VIDEO_SECONDS` (default: 600)

### Next.js App Router
- Uses App Router (not Pages Router)
- Route groups: `(logged-out)` for authentication pages
- API routes use Next.js 14 route handlers (`route.ts`)

### Path Aliases
- `@/*` maps to project root (configured in `tsconfig.json`)
- Components alias: `@/components`
- Utils alias: `@/lib/utils`

### shadcn/ui Integration
- Configuration in `components.json`
- Uses Tailwind CSS with CSS variables
- Base color: zinc
- All UI components in `components/ui/`

### Dashboard Features
- Employee table with TanStack Table
- Team distribution charts (Recharts)
- Work location trends visualization
- Support ticket tracking

## Development Notes

### Direct S3 Upload Pattern
The upload implementation demonstrates best practices for handling large files:
- Client-side validation before upload (size, duration, MIME type)
- Progress tracking using XMLHttpRequest for images, part-completion for videos
- Concurrent multipart uploads (4 workers) for optimal throughput
- Presigned URLs with appropriate expiry times
- Server only handles metadata and URL generation, not file data

### Form Validation
- Uses `react-hook-form` with `zod` resolvers
- Radix UI primitives for accessible form components

### State Management
- Local component state (no global state management library)
- Form state managed by react-hook-form

### Styling
- Tailwind CSS with custom design system
- Dark mode support via `light-dark-toggle` component
- Utility function `cn()` for conditional class merging
