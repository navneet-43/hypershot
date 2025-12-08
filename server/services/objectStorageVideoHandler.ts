import { Storage } from '@google-cloud/storage';
import axios from 'axios';
import { randomUUID } from 'crypto';
import path from 'path';

/**
 * Production-safe video handler that uses Replit Object Storage
 * Solves ENOSPC issues in production by using persistent cloud storage
 */
export class ObjectStorageVideoHandler {
  private storage: Storage;
  private bucketName: string;
  private bucket: any;

  constructor() {
    // Initialize Google Cloud Storage for Replit Object Storage
    this.storage = new Storage();
    this.bucketName = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || 'repl-default-bucket';
    this.bucket = this.storage.bucket(this.bucketName);
    
    console.log(`📦 Object Storage initialized: ${this.bucketName}`);
  }

  /**
   * Download video to Object Storage (production-safe)
   */
  async downloadToObjectStorage(
    videoUrl: string, 
    sourceType: 'google_drive' | 'facebook' | 'youtube' | 'direct'
  ): Promise<{
    success: boolean;
    objectPath?: string;
    sizeMB?: number;
    error?: string;
  }> {
    const objectPath = `videos/${randomUUID()}_${sourceType}.mp4`;
    
    try {
      console.log(`📥 Downloading ${sourceType} video to Object Storage...`);
      console.log(`📍 Object path: ${objectPath}`);
      
      // Stream download directly to Object Storage (no local filesystem)
      const response = await axios({
        method: 'get',
        url: videoUrl,
        responseType: 'stream',
        timeout: 300000, // 5 minutes
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const file = this.bucket.file(objectPath);
      const writeStream = file.createWriteStream({
        metadata: {
          contentType: 'video/mp4',
          metadata: {
            source: sourceType,
            uploadedAt: new Date().toISOString()
          }
        },
        resumable: false // Faster for smaller files
      });

      let downloadedBytes = 0;

      response.data.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (downloadedBytes % (10 * 1024 * 1024) === 0) { // Log every 10MB
          console.log(`📊 Downloaded: ${(downloadedBytes / 1024 / 1024).toFixed(1)}MB`);
        }
      });

      // Pipe the download stream to Object Storage
      await new Promise((resolve, reject) => {
        response.data.pipe(writeStream)
          .on('finish', resolve)
          .on('error', reject);
      });

      const sizeMB = downloadedBytes / (1024 * 1024);
      console.log(`✅ Video downloaded to Object Storage: ${sizeMB.toFixed(1)}MB`);

      return {
        success: true,
        objectPath,
        sizeMB
      };

    } catch (error: any) {
      console.error('❌ Object Storage download failed:', error.message);
      
      // Clean up failed upload
      try {
        await this.bucket.file(objectPath).delete();
      } catch {}

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get read stream from Object Storage for Facebook upload
   */
  async getVideoStream(objectPath: string): Promise<{
    success: boolean;
    stream?: NodeJS.ReadableStream;
    sizeMB?: number;
    error?: string;
  }> {
    try {
      const file = this.bucket.file(objectPath);
      
      // Check if file exists and get metadata
      const [exists] = await file.exists();
      if (!exists) {
        return {
          success: false,
          error: 'Video file not found in Object Storage'
        };
      }

      const [metadata] = await file.getMetadata();
      const sizeMB = parseInt(metadata.size) / (1024 * 1024);

      console.log(`📤 Streaming video from Object Storage: ${sizeMB.toFixed(1)}MB`);

      const stream = file.createReadStream();

      return {
        success: true,
        stream,
        sizeMB
      };

    } catch (error: any) {
      console.error('❌ Failed to get video stream:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up video from Object Storage after successful upload
   */
  async cleanupVideo(objectPath: string): Promise<void> {
    try {
      await this.bucket.file(objectPath).delete();
      console.log(`🧹 Cleaned up Object Storage: ${objectPath}`);
    } catch (error: any) {
      console.warn(`⚠️ Failed to cleanup ${objectPath}:`, error.message);
    }
  }

  /**
   * Download video file to temp location for Facebook upload
   * Used when Facebook API requires actual file path
   */
  async downloadToTempFile(objectPath: string): Promise<{
    success: boolean;
    filePath?: string;
    sizeMB?: number;
    cleanup?: () => Promise<void>;
    error?: string;
  }> {
    const tempPath = `/tmp/objstore_${randomUUID()}.mp4`;
    
    try {
      const file = this.bucket.file(objectPath);
      
      await file.download({ destination: tempPath });
      
      const fs = await import('fs');
      const stats = fs.statSync(tempPath);
      const sizeMB = stats.size / (1024 * 1024);

      console.log(`💾 Downloaded from Object Storage to temp: ${sizeMB.toFixed(1)}MB`);

      return {
        success: true,
        filePath: tempPath,
        sizeMB,
        cleanup: async () => {
          try {
            fs.unlinkSync(tempPath);
            console.log(`🧹 Cleaned up temp file: ${tempPath}`);
          } catch {}
        }
      };

    } catch (error: any) {
      console.error('❌ Failed to download to temp file:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Complete workflow: Download to Object Storage → Upload to Facebook → Cleanup
   */
  async handleVideoUpload(
    videoUrl: string,
    sourceType: 'google_drive' | 'facebook' | 'youtube' | 'direct',
    facebookUploadFn: (filePath: string, sizeMB: number) => Promise<{ success: boolean; error?: string }>
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    let objectPath: string | undefined;
    let tempPath: string | undefined;

    try {
      // Step 1: Download to Object Storage (production-safe)
      const downloadResult = await this.downloadToObjectStorage(videoUrl, sourceType);
      if (!downloadResult.success || !downloadResult.objectPath) {
        return {
          success: false,
          error: downloadResult.error || 'Failed to download to Object Storage'
        };
      }

      objectPath = downloadResult.objectPath;
      console.log(`✅ Video in Object Storage: ${objectPath}`);

      // Step 2: Download to temp file for Facebook upload
      const tempResult = await this.downloadToTempFile(objectPath);
      if (!tempResult.success || !tempResult.filePath) {
        return {
          success: false,
          error: tempResult.error || 'Failed to create temp file'
        };
      }

      tempPath = tempResult.filePath;

      // Step 3: Upload to Facebook
      const uploadResult = await facebookUploadFn(tempPath, tempResult.sizeMB!);

      // Step 4: Cleanup
      if (tempResult.cleanup) {
        await tempResult.cleanup();
      }

      if (objectPath) {
        await this.cleanupVideo(objectPath);
      }

      return uploadResult;

    } catch (error: any) {
      console.error('❌ Video upload workflow failed:', error.message);

      // Emergency cleanup
      try {
        if (tempPath) {
          const fs = await import('fs');
          fs.unlinkSync(tempPath);
        }
        if (objectPath) {
          await this.cleanupVideo(objectPath);
        }
      } catch {}

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up old videos from Object Storage (maintenance)
   */
  async cleanupOldVideos(olderThanHours: number = 24): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
      
      const [files] = await this.bucket.getFiles({ prefix: 'videos/' });
      
      let deletedCount = 0;
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const createdTime = new Date(metadata.timeCreated);
        
        if (createdTime < cutoffTime) {
          await file.delete();
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old videos from Object Storage`);
      }

    } catch (error: any) {
      console.warn(`⚠️ Object Storage cleanup failed:`, error.message);
    }
  }
}

// Singleton instance
export const objectStorageVideoHandler = new ObjectStorageVideoHandler();
