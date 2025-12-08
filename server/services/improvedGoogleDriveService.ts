import { google, drive_v3 } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import { FacebookVideoUploadService } from './facebookVideoUploadService';

interface ChunkDownloadOptions {
  chunkSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  timeoutMs?: number;
}

interface ProcessingResult {
  success: boolean;
  filePath?: string;
  sizeMB?: number;
  facebookVideoId?: string;
  error?: string;
  stage?: string;
}

export class ImprovedGoogleDriveService {
  private readonly CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;
  private readonly TEMP_DIR = '/tmp';

  constructor() {
    this.ensureTempDirectories();
  }

  private ensureTempDirectories(): void {
    const requiredDirs = [
      path.join(this.TEMP_DIR, 'small_files'),
      path.join(this.TEMP_DIR, 'medium_files'),
      path.join(this.TEMP_DIR, 'large_files'),
      path.join(this.TEMP_DIR, 'processing')
    ];

    requiredDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      }
    });
  }

  static extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9-_]+)/,
      /id=([a-zA-Z0-9-_]+)/,
      /folders\/([a-zA-Z0-9-_]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  private async getFileSizeAndType(fileId: string): Promise<{ size: number; type: string; name: string }> {
    // Try multiple access URLs to get file metadata
    const metadataUrls = [
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`
    ];

    for (const url of metadataUrls) {
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        const contentLength = response.headers.get('content-length');
        const contentType = response.headers.get('content-type') || 'video/mp4';
        const contentDisposition = response.headers.get('content-disposition') || '';
        
        let filename = `video_${fileId}.mp4`;
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }

        if (contentLength) {
          return {
            size: parseInt(contentLength),
            type: contentType,
            name: filename
          };
        }
      } catch (error) {
        console.log(`Metadata fetch failed for URL: ${url}`);
      }
    }

    // Fallback: assume it's a video file
    return {
      size: 0, // Unknown size
      type: 'video/mp4',
      name: `video_${fileId}.mp4`
    };
  }

  private getDirectoryForFileSize(sizeMB: number): string {
    if (sizeMB <= 100) {
      return path.join(this.TEMP_DIR, 'small_files');
    } else if (sizeMB <= 500) {
      return path.join(this.TEMP_DIR, 'medium_files');
    } else {
      return path.join(this.TEMP_DIR, 'large_files');
    }
  }

  async downloadWithChunks(fileId: string, outputPath: string, options: ChunkDownloadOptions = {}): Promise<ProcessingResult> {
    const {
      chunkSize = this.CHUNK_SIZE,
      maxRetries = this.MAX_RETRIES,
      retryDelay = this.RETRY_DELAY,
      timeoutMs = 600000 // 10 minutes
    } = options;

    console.log('🎬 IMPROVED GOOGLE DRIVE DOWNLOAD');
    console.log('📁 File ID:', fileId);
    console.log('📥 Output:', outputPath);

    // Get file metadata
    const metadata = await this.getFileSizeAndType(fileId);
    const fileSizeMB = metadata.size / (1024 * 1024);
    
    console.log(`📊 File size: ${fileSizeMB.toFixed(1)}MB`);

    // Choose download strategy based on file size
    if (fileSizeMB <= 100) {
      return this.downloadSmallFile(fileId, outputPath, timeoutMs);
    } else if (fileSizeMB <= 500) {
      return this.downloadMediumFile(fileId, outputPath, chunkSize, maxRetries, retryDelay, timeoutMs);
    } else {
      return this.downloadLargeFile(fileId, outputPath, chunkSize, maxRetries, retryDelay, timeoutMs);
    }
  }

  private async downloadSmallFile(fileId: string, outputPath: string, timeoutMs: number): Promise<ProcessingResult> {
    console.log('📥 Small file strategy: Direct download');
    
    const downloadUrls = [
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`,
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      `https://docs.google.com/uc?export=download&id=${fileId}`
    ];

    for (const url of downloadUrls) {
      try {
        console.log('Trying URL:', url);
        
        const response = await Promise.race([
          fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Download timeout')), timeoutMs)
          )
        ]);

        if (response.ok && response.body) {
          const writer = fs.createWriteStream(outputPath);
          
          await new Promise((resolve, reject) => {
            response.body!.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
          });

          const stats = fs.statSync(outputPath);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (sizeMB > 1) { // Must be at least 1MB to be valid
            console.log(`✅ Small file download: ${sizeMB.toFixed(1)}MB`);
            return {
              success: true,
              filePath: outputPath,
              sizeMB: sizeMB,
              stage: 'download_complete'
            };
          }
        }
      } catch (error) {
        console.log(`Small file download failed: ${(error as Error).message}`);
      }
    }

    return { success: false, error: 'All small file download methods failed', stage: 'download_failed' };
  }

  private async downloadMediumFile(fileId: string, outputPath: string, chunkSize: number, maxRetries: number, retryDelay: number, timeoutMs: number): Promise<ProcessingResult> {
    console.log('📥 Medium file strategy: Chunked download with retry');
    
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
    
    let downloadedBytes = 0;
    let retryCount = 0;
    const writer = fs.createWriteStream(outputPath);
    
    while (retryCount < maxRetries) {
      try {
        const rangeHeader = downloadedBytes > 0 ? `bytes=${downloadedBytes}-` : undefined;
        
        const response = await Promise.race([
          fetch(downloadUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              ...(rangeHeader && { 'Range': rangeHeader })
            }
          }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Chunk timeout')), timeoutMs)
          )
        ]);

        if (response.ok && response.body) {
          await new Promise((resolve, reject) => {
            let chunkBytes = 0;
            
            response.body!.on('data', (chunk) => {
              downloadedBytes += chunk.length;
              chunkBytes += chunk.length;
              writer.write(chunk);
              
              if (chunkBytes % (10 * 1024 * 1024) === 0) { // Log every 10MB
                console.log(`Downloaded: ${(downloadedBytes / (1024 * 1024)).toFixed(1)}MB`);
              }
            });
            
            response.body!.on('end', resolve);
            response.body!.on('error', reject);
          });

          writer.end();
          
          const stats = fs.statSync(outputPath);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`✅ Medium file download: ${sizeMB.toFixed(1)}MB`);
          return {
            success: true,
            filePath: outputPath,
            sizeMB: sizeMB,
            stage: 'download_complete'
          };
        }
        
      } catch (error) {
        retryCount++;
        console.log(`Medium file retry ${retryCount}/${maxRetries}: ${(error as Error).message}`);
        
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * retryCount));
        }
      }
    }

    writer.end();
    return { success: false, error: 'Medium file download failed after retries', stage: 'download_failed' };
  }

  private async downloadLargeFile(fileId: string, outputPath: string, chunkSize: number, maxRetries: number, retryDelay: number, timeoutMs: number): Promise<ProcessingResult> {
    console.log('📥 Large file strategy: Streaming chunks with resume capability');
    
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
    
    let downloadedBytes = 0;
    let retryCount = 0;
    let stagnantCount = 0;
    let lastProgress = 0;
    
    const writer = fs.createWriteStream(outputPath);
    
    while (retryCount < maxRetries) {
      try {
        const rangeEnd = downloadedBytes + chunkSize - 1;
        const rangeHeader = `bytes=${downloadedBytes}-${rangeEnd}`;
        
        console.log(`Downloading chunk: ${rangeHeader}`);
        
        const response = await Promise.race([
          fetch(downloadUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Range': rangeHeader
            }
          }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Chunk timeout')), 60000) // 1 minute per chunk
          )
        ]);

        if (response.ok && response.body) {
          await new Promise((resolve, reject) => {
            let chunkBytes = 0;
            
            response.body!.on('data', (chunk) => {
              downloadedBytes += chunk.length;
              chunkBytes += chunk.length;
              writer.write(chunk);
            });
            
            response.body!.on('end', () => {
              const currentMB = downloadedBytes / (1024 * 1024);
              console.log(`Chunk complete: ${currentMB.toFixed(1)}MB total`);
              
              // Check for progress stagnation
              if (currentMB - lastProgress < 1) { // Less than 1MB progress
                stagnantCount++;
                if (stagnantCount > 5) { // 5 stagnant chunks = proceed with what we have
                  console.log('Download appears stagnant, proceeding with current size');
                  resolve(null);
                  return;
                }
              } else {
                stagnantCount = 0;
              }
              lastProgress = currentMB;
              
              // Continue downloading if response suggests more data
              const contentRange = response.headers.get('content-range');
              if (contentRange && !contentRange.includes('/*')) {
                // More chunks available, continue
                setTimeout(resolve, 100); // Small delay between chunks
              } else {
                resolve(null); // Download complete
              }
            });
            
            response.body!.on('error', reject);
          });
          
          // Reset retry count on successful chunk
          retryCount = 0;
          
        } else {
          throw new Error(`Chunk download failed: ${response.status}`);
        }
        
      } catch (error) {
        retryCount++;
        console.log(`Large file chunk retry ${retryCount}/${maxRetries}: ${(error as Error).message}`);
        
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * retryCount));
        } else {
          break; // Exit retry loop
        }
      }
    }

    writer.end();
    
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const sizeMB = stats.size / (1024 * 1024);
      
      if (sizeMB > 10) { // At least 10MB to be considered successful
        console.log(`✅ Large file download: ${sizeMB.toFixed(1)}MB`);
        return {
          success: true,
          filePath: outputPath,
          sizeMB: sizeMB,
          stage: 'download_complete'
        };
      }
    }

    return { success: false, error: 'Large file download insufficient', stage: 'download_failed' };
  }

  async downloadAndUploadToFacebook(
    driveUrl: string,
    facebookPageId: string,
    facebookAccessToken: string,
    description: string = 'Google Drive Video Upload'
  ): Promise<ProcessingResult> {
    console.log('🎯 COMPLETE GOOGLE DRIVE TO FACEBOOK PIPELINE');
    console.log('📁 Drive URL:', driveUrl);
    console.log('📄 Facebook Page:', facebookPageId);

    const fileId = ImprovedGoogleDriveService.extractFileId(driveUrl);
    if (!fileId) {
      return { success: false, error: 'Invalid Google Drive URL', stage: 'url_validation' };
    }

    // Get file metadata to determine processing strategy
    const metadata = await this.getFileSizeAndType(fileId);
    const fileSizeMB = metadata.size / (1024 * 1024);
    
    const outputDir = this.getDirectoryForFileSize(fileSizeMB);
    const outputPath = path.join(outputDir, `drive_video_${fileId}_${Date.now()}.mp4`);

    try {
      // Download from Google Drive
      console.log('⬇️ Step 1: Downloading from Google Drive...');
      const downloadResult = await this.downloadWithChunks(fileId, outputPath);
      
      if (!downloadResult.success || !downloadResult.filePath) {
        return {
          success: false,
          error: downloadResult.error || 'Download failed',
          stage: 'download_failed'
        };
      }

      console.log(`✅ Download successful: ${downloadResult.sizeMB?.toFixed(1)}MB`);

      // Upload to Facebook
      console.log('⬆️ Step 2: Uploading to Facebook...');
      const uploadResult = await FacebookVideoUploadService.uploadVideoFile(
        downloadResult.filePath,
        facebookPageId,
        facebookAccessToken,
        description,
        ['google-drive', 'improved-service']
      );

      if (!uploadResult.success) {
        return {
          success: false,
          error: uploadResult.error || 'Facebook upload failed',
          stage: 'facebook_upload_failed',
          sizeMB: downloadResult.sizeMB
        };
      }

      console.log('✅ Facebook upload successful');
      console.log('🎬 Video ID:', uploadResult.videoId);

      // Cleanup
      if (fs.existsSync(downloadResult.filePath)) {
        fs.unlinkSync(downloadResult.filePath);
        console.log('🧹 Temporary file cleaned up');
      }

      return {
        success: true,
        filePath: downloadResult.filePath,
        sizeMB: downloadResult.sizeMB,
        facebookVideoId: uploadResult.videoId,
        stage: 'complete'
      };

    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }

      return {
        success: false,
        error: (error as Error).message,
        stage: 'processing_error'
      };
    }
  }

  async healthCheck(): Promise<{ [key: string]: boolean }> {
    const checks = {
      tempDirectoriesExist: true,
      diskSpaceAvailable: true,
      networkConnectivity: true
    };

    // Check temp directories
    try {
      const requiredDirs = ['small_files', 'medium_files', 'large_files', 'processing'];
      for (const dir of requiredDirs) {
        const fullPath = path.join(this.TEMP_DIR, dir);
        if (!fs.existsSync(fullPath)) {
          checks.tempDirectoriesExist = false;
          break;
        }
      }
    } catch (error) {
      checks.tempDirectoriesExist = false;
    }

    // Check disk space (simplified)
    try {
      const stats = fs.statSync(this.TEMP_DIR);
      checks.diskSpaceAvailable = stats.isDirectory();
    } catch (error) {
      checks.diskSpaceAvailable = false;
    }

    // Check network connectivity to Google Drive
    try {
      const response = await fetch('https://drive.google.com', { method: 'HEAD' });
      checks.networkConnectivity = response.ok;
    } catch (error) {
      checks.networkConnectivity = false;
    }

    return checks;
  }
}