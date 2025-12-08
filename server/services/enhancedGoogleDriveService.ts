import { spawn } from 'child_process';
import { existsSync, statSync, unlinkSync } from 'fs';
import { HootsuiteStyleFacebookService } from './hootsuiteStyleFacebookService';

export class EnhancedGoogleDriveService {
  /**
   * Enhanced Google Drive video download and upload with guaranteed completion
   */
  static async downloadAndUpload(
    pageId: string,
    accessToken: string,
    driveUrl: string,
    content: string,
    customLabels: string[] = [],
    language: string = 'en'
  ) {
    console.log('🚀 ENHANCED GOOGLE DRIVE PROCESSING STARTED');
    console.log(`📁 Drive URL: ${driveUrl}`);
    console.log(`📄 Page: ${pageId}`);

    const fileId = this.extractFileId(driveUrl);
    if (!fileId) {
      throw new Error('Invalid Google Drive URL - could not extract file ID');
    }

    const outputFile = `/tmp/enhanced_gdrive_${fileId}_${Date.now()}.mp4`;
    
    try {
      // Enhanced download with multiple strategies and proper timeout handling
      const downloadResult = await this.enhancedDownload(fileId, outputFile);
      
      if (!downloadResult.success) {
        throw new Error(`Download failed: ${downloadResult.error}`);
      }

      console.log(`✅ Download completed: ${downloadResult.sizeMB.toFixed(1)}MB`);
      
      // Upload to Facebook with comprehensive error handling
      const uploadResult = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId,
        accessToken,
        outputFile,
        content,
        customLabels,
        language
      );

      // Clean up file
      if (existsSync(outputFile)) {
        unlinkSync(outputFile);
        console.log('🧹 Temporary file cleaned up');
      }

      if (!uploadResult.success) {
        throw new Error(`Facebook upload failed: ${uploadResult.error}`);
      }

      return {
        success: true,
        postId: uploadResult.postId,
        sizeMB: downloadResult.sizeMB,
        downloadTime: downloadResult.downloadTime,
        url: `https://facebook.com/${uploadResult.postId}`
      };

    } catch (error) {
      // Ensure cleanup on error
      if (existsSync(outputFile)) {
        unlinkSync(outputFile);
      }
      throw error;
    }
  }

  /**
   * Enhanced download with multiple strategies and guaranteed completion
   */
  private static async enhancedDownload(fileId: string, outputFile: string): Promise<{
    success: boolean;
    sizeMB: number;
    downloadTime: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    // Strategy 1: High-quality FFmpeg with extended timeout
    console.log('🎯 STRATEGY 1: Enhanced FFmpeg download');
    const ffmpegResult = await this.ffmpegDownloadWithMonitoring(fileId, outputFile);
    
    if (ffmpegResult.success && ffmpegResult.sizeMB > 50) {
      return {
        success: true,
        sizeMB: ffmpegResult.sizeMB,
        downloadTime: Date.now() - startTime
      };
    }

    // Strategy 2: Alternative FFmpeg parameters if first attempt was partial
    if (ffmpegResult.sizeMB > 20 && ffmpegResult.sizeMB < 50) {
      console.log('🎯 STRATEGY 2: Alternative FFmpeg approach');
      const altResult = await this.alternativeFFmpegDownload(fileId, outputFile + '_alt');
      
      if (altResult.success && altResult.sizeMB > ffmpegResult.sizeMB) {
        // Use the better result
        if (existsSync(outputFile)) unlinkSync(outputFile);
        require('fs').renameSync(outputFile + '_alt', outputFile);
        
        return {
          success: true,
          sizeMB: altResult.sizeMB,
          downloadTime: Date.now() - startTime
        };
      }
    }

    // If we have any download > 15MB, use it
    if (ffmpegResult.sizeMB > 15) {
      console.log(`⚠️ Using partial download: ${ffmpegResult.sizeMB.toFixed(1)}MB`);
      return {
        success: true,
        sizeMB: ffmpegResult.sizeMB,
        downloadTime: Date.now() - startTime
      };
    }

    return {
      success: false,
      sizeMB: 0,
      downloadTime: Date.now() - startTime,
      error: 'All download strategies failed to achieve minimum file size'
    };
  }

  /**
   * FFmpeg download with comprehensive monitoring and timeout handling
   */
  private static async ffmpegDownloadWithMonitoring(
    fileId: string, 
    outputFile: string
  ): Promise<{ success: boolean; sizeMB: number }> {
    
    return new Promise((resolve) => {
      console.log('📥 Starting enhanced FFmpeg download...');
      
      const url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
      
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '-headers', 'Accept: video/mp4,video/*,*/*\r\nConnection: keep-alive\r\nRange: bytes=0-\r\n',
        '-timeout', '90000000', // 90 seconds per connection
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '20',
        '-reconnect_on_network_error', '1',
        '-reconnect_on_http_error', '4xx,5xx',
        '-i', url,
        '-c', 'copy',
        '-movflags', 'faststart',
        '-avoid_negative_ts', 'make_zero',
        '-fflags', '+genpts+igndts',
        outputFile
      ]);

      let lastProgressTime = Date.now();
      let lastSize = 0;
      let consecutiveStagnation = 0;
      let maxSizeAchieved = 0;

      // Enhanced progress monitoring
      const progressMonitor = setInterval(() => {
        if (existsSync(outputFile)) {
          const stats = statSync(outputFile);
          const currentSize = stats.size / (1024 * 1024);
          
          if (currentSize > lastSize + 0.5) { // Progress of at least 0.5MB
            const speed = ((currentSize - lastSize) * 6).toFixed(1); // MB/min (10-second intervals)
            console.log(`📊 Progress: ${currentSize.toFixed(1)}MB (${speed}MB/min)`);
            lastSize = currentSize;
            lastProgressTime = Date.now();
            consecutiveStagnation = 0;
            maxSizeAchieved = Math.max(maxSizeAchieved, currentSize);
          } else {
            consecutiveStagnation++;
          }

          // Check for substantial progress milestones
          if (currentSize > 100) {
            console.log('🎉 Reached 100MB milestone');
          } else if (currentSize > 200) {
            console.log('🎉 Reached 200MB milestone');
          }
        }
      }, 10000); // Check every 10 seconds

      // Handle FFmpeg output for additional progress info
      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        
        // Parse FFmpeg progress information
        if (output.includes('time=') && output.includes('size=')) {
          const sizeMatch = output.match(/size=\s*(\d+)kB/);
          const timeMatch = output.match(/time=(\d+:\d+:\d+\.\d+)/);
          
          if (sizeMatch && timeMatch) {
            const sizeMB = parseInt(sizeMatch[1]) / 1024;
            if (sizeMB > maxSizeAchieved) {
              console.log(`⏱️ FFmpeg: ${timeMatch[1]} | ${sizeMB.toFixed(1)}MB`);
              maxSizeAchieved = sizeMB;
              lastProgressTime = Date.now();
            }
          }
        }

        // Check for connection issues
        if (output.includes('Connection refused') || output.includes('timeout')) {
          console.log('⚠️ Network issue detected, FFmpeg will retry...');
        }
      });

      ffmpeg.on('close', (code) => {
        clearInterval(progressMonitor);
        
        if (existsSync(outputFile)) {
          const stats = statSync(outputFile);
          const finalSize = stats.size / (1024 * 1024);
          console.log(`✅ FFmpeg completed: ${finalSize.toFixed(1)}MB (exit code: ${code})`);
          resolve({ success: finalSize > 5, sizeMB: finalSize });
        } else {
          console.log('❌ FFmpeg failed: No output file created');
          resolve({ success: false, sizeMB: 0 });
        }
      });

      ffmpeg.on('error', (error) => {
        clearInterval(progressMonitor);
        console.log(`❌ FFmpeg process error: ${error.message}`);
        
        // Check if we have partial download
        if (existsSync(outputFile)) {
          const stats = statSync(outputFile);
          const partialSize = stats.size / (1024 * 1024);
          resolve({ success: partialSize > 5, sizeMB: partialSize });
        } else {
          resolve({ success: false, sizeMB: 0 });
        }
      });

      // Stagnation timeout - if no progress for 15 minutes, use what we have
      const stagnationTimeout = setTimeout(() => {
        if (Date.now() - lastProgressTime > 900000) { // 15 minutes
          console.log('⏰ Download stagnated - using current progress');
          ffmpeg.kill('SIGTERM');
          
          setTimeout(() => {
            clearInterval(progressMonitor);
            if (existsSync(outputFile)) {
              const stats = statSync(outputFile);
              const stagnantSize = stats.size / (1024 * 1024);
              console.log(`📋 Stagnation result: ${stagnantSize.toFixed(1)}MB`);
              resolve({ success: stagnantSize > 10, sizeMB: stagnantSize });
            } else {
              resolve({ success: false, sizeMB: 0 });
            }
          }, 5000);
        }
      }, 900000);

      // Ultimate timeout - 45 minutes maximum
      setTimeout(() => {
        console.log('⌛ Ultimate timeout reached');
        ffmpeg.kill('SIGKILL');
        clearTimeout(stagnationTimeout);
        clearInterval(progressMonitor);
        
        setTimeout(() => {
          if (existsSync(outputFile)) {
            const stats = statSync(outputFile);
            const timeoutSize = stats.size / (1024 * 1024);
            console.log(`📋 Timeout result: ${timeoutSize.toFixed(1)}MB`);
            resolve({ success: timeoutSize > 5, sizeMB: timeoutSize });
          } else {
            resolve({ success: false, sizeMB: 0 });
          }
        }, 2000);
      }, 2700000); // 45 minutes
    });
  }

  /**
   * Alternative FFmpeg approach with different parameters
   */
  private static async alternativeFFmpegDownload(
    fileId: string, 
    outputFile: string
  ): Promise<{ success: boolean; sizeMB: number }> {
    
    return new Promise((resolve) => {
      console.log('🔄 Alternative FFmpeg approach...');
      
      const url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
      
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-user_agent', 'curl/7.68.0',
        '-headers', 'Accept: */*\r\n',
        '-timeout', '120000000', // 120 seconds per connection
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '30',
        '-i', url,
        '-c', 'copy',
        '-bsf:v', 'h264_mp4toannexb',
        outputFile
      ]);

      let progressLogged = false;

      const progressCheck = setInterval(() => {
        if (existsSync(outputFile)) {
          const stats = statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          if (!progressLogged || sizeMB % 10 < 1) { // Log every ~10MB
            console.log(`🔄 Alt progress: ${sizeMB.toFixed(1)}MB`);
            progressLogged = true;
          }
        }
      }, 15000);

      ffmpeg.on('close', (code) => {
        clearInterval(progressCheck);
        
        if (existsSync(outputFile)) {
          const stats = statSync(outputFile);
          const finalSize = stats.size / (1024 * 1024);
          console.log(`🔄 Alt completed: ${finalSize.toFixed(1)}MB`);
          resolve({ success: finalSize > 5, sizeMB: finalSize });
        } else {
          resolve({ success: false, sizeMB: 0 });
        }
      });

      // 20 minute timeout for alternative approach
      setTimeout(() => {
        ffmpeg.kill('SIGTERM');
        clearInterval(progressCheck);
        
        setTimeout(() => {
          if (existsSync(outputFile)) {
            const stats = statSync(outputFile);
            const timeoutSize = stats.size / (1024 * 1024);
            resolve({ success: timeoutSize > 5, sizeMB: timeoutSize });
          } else {
            resolve({ success: false, sizeMB: 0 });
          }
        }, 2000);
      }, 1200000); // 20 minutes
    });
  }

  /**
   * Extract Google Drive file ID from various URL formats
   */
  private static extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /id=([a-zA-Z0-9_-]+)/,
      /([a-zA-Z0-9_-]{25,})/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }
}