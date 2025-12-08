# SocialFlow - Social Media Publishing Platform

## Overview
SocialFlow is an advanced social media publishing platform for Facebook and Instagram business accounts. It offers intelligent content management, streamlined publishing workflows, bulk post scheduling, real-time analytics, and robust media handling. The platform aims to provide efficient and reliable content delivery, focusing on an enhanced user experience and comprehensive tools for social media account management. Its business vision is to empower users with seamless cross-platform publishing capabilities, detailed reporting, and AI-driven content preparation, positioning it as a leading solution for social media professionals.

## User Preferences
- CRITICAL: Videos must upload as actual media files to Facebook, never as text links
- QUALITY PRIORITY: Video quality preservation is main concern - no compression desired
- REQUIRED FLOW: Download Google Drive videos → Upload to Facebook with original quality preserved
- TECHNICAL: Support videos up to 1GB via Facebook chunked upload API with zero compression
- Use Alright Tamil page for testing video uploads and demonstrations
- Prefer robust HTTP download methods over FFmpeg when possible
- INSTAGRAM VIDEO HANDLING: Production-safe video processor that preserves original quality:
  - 9:16 Reels (1080x1920) pass through WITHOUT any processing - original quality preserved
  - Only processes videos that don't meet Instagram requirements (wrong codec, pixel format, etc.)
  - Fallback mode: If processing fails, uses original video and lets Instagram handle it
  - Aspect ratio range: 0.5 (9:16 vertical) to 1.91 (horizontal) - no more unnecessary padding
  - No compression unless truly needed - uses 8M bitrate and 256k audio when processing required
- CRITICAL: PRODUCTION DISK SPACE MANAGEMENT SYSTEM - Complete Reserved VM optimization preventing crashes from disk exhaustion:
  - Proactive Monitoring: DiskSpaceMonitor utility checks available space before every download with smart estimates (150MB for videos, 10MB for images)
  - Emergency Cleanup: Automatic cleanup triggers when disk space < 100MB (critical threshold) or < 300MB (warning threshold)
  - Ultra-Aggressive Cleanup: Temp files deleted after only 5 minutes (reduced from 15min), sweep runs every 30 seconds (reduced from 1min)
  - File Protection System: Files actively being processed by Instagram are protected from cleanup via tempFileManager.protectFile() - prevents "Video processing failed" errors caused by cleanup during Instagram's 5-20 minute processing window
  - Immediate Cleanup After Publish: Local files deleted immediately after successful Instagram publish since they're backed up to SFTP
  - Cleanup on Failure: Videos deleted immediately when uploads fail or scheduled posts fail to publish
  - Manual Cleanup Endpoint: POST /api/cleanup/force for emergency on-demand space recovery with detailed disk space reporting
  - Adaptive Thresholds: System adjusts space requirements based on total disk size (<5GB=50MB, <20GB=100MB, >=20GB=300MB)
  - Pre-Download Cleanup: Proactively cleans old files BEFORE downloads to prevent "insufficient disk space" errors
  - RESULT: Eliminates "no space left on device" (ENOSPC) crashes and Instagram "Video processing failed" errors in Reserved VM production deployments

## System Architecture
The platform utilizes a React frontend with TypeScript, shadcn/ui, and Wouter, a Node.js Express backend, and a PostgreSQL database managed by Drizzle ORM.

**UI/UX Decisions:**
- Clean, production-ready design using shadcn/ui components.
- Frontend displays all times in IST for user convenience.

**Technical Implementations & Feature Specifications:**
- **Authentication:** Simplified login/register with Facebook account management. Multi-user isolation ensures Facebook/Instagram accounts are linked to specific platform users via `platformUserId` for proper data segregation.
- **Admin Features:** An designated admin user (`socialplus@ruskmedia.com`) has enhanced privileges, including viewing all scheduled posts and activities across all users, and full system oversight for monitoring.
- **Content Management:** Supports bulk scheduling via CSV import with advanced date/time parsing. An OpenAI-powered CSV converter intelligently transforms various CSV formats into the expected structure. Full Reels API integration is supported.
- **Media Handling:**
    - Comprehensive system for images, videos, reels, stories, and carousels for Facebook and Instagram.
    - Supports large video files via Facebook's resumable upload API (up to 1.75GB) with quality preservation, including automatic upscaling for Reels if needed.
    - Intelligent media type detection and automatic downloading from Google Drive, Facebook, and other URLs.
    - Instagram posting supports universal media URLs by downloading, temporarily hosting, and passing to Instagram's API.
    - **PRODUCTION DISK SPACE MANAGEMENT**: Proactive monitoring checks space before downloads, ultra-aggressive 5-minute TTL cleanup, 30-second sweep intervals, immediate cleanup after successful publish, emergency cleanup at critical thresholds, and adaptive space requirements prevent Reserved VM crashes.
    - **External Storage Integration**: 88TB SFTP external storage with download-on-demand for persistent storage and automatic recovery. WebDAV acts as a fallback.
- **Scheduling & Reliability:** Robust scheduling service with database-driven intervals (15 seconds) and a proactive anti-sleep system with self-pings and health checks to prevent server hibernation. Recovery mechanisms ensure overdue posts are published promptly after restarts.
- **Timezone Architecture:** Backend automatically converts all user-provided IST times to UTC for storage and processing, maintaining data consistency.
- **Customization:** Custom labeling system for Meta Insights compatibility, including validation and transformation of labels.
- **Error Handling:** Comprehensive error detection, retry logic with exponential backoff, and graceful handling of API and network issues. Enhanced error handling for Facebook API authorization errors.
- **Platform-Exclusive Posting:** Redesigned mechanism allows users to select a single platform (Facebook or Instagram) per post, eliminating cross-posting ambiguity.
- **Reporting:** Complete Reports feature with publishing bucket analytics and calendar-based date filtering.
- **Upcoming Posts/All Posts View:** Enhanced views with Facebook page names, delete functionality for scheduled posts, and comprehensive filtering.

## External Dependencies
- **Meta Graph API**: For Facebook and Instagram publishing, account management, and analytics.
- **PostgreSQL**: Relational database.
- **Drizzle ORM**: For database interactions.
- **React**: Frontend library.
- **shadcn/ui**: UI component library.
- **Wouter**: React router.
- **Node.js Express**: Backend framework.
- **Papa Parse**: CSV parsing.
- **XLSX**: Excel file parsing.
- **@distube/ytdl-core**: YouTube video downloading.
- **FFmpeg**: Video processing.
- **Google Drive**: Integrated for video download and processing.
- **OpenAI API**: For AI-powered CSV format conversion (GPT-5).
- **SFTP**: For external media storage and backup.
- **WebDAV**: Fallback external media storage.