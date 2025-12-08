import { spawn } from 'child_process';
import { existsSync, statSync, unlinkSync } from 'fs';
import { HootsuiteStyleFacebookService } from './hootsuiteStyleFacebookService';

export class UltimateGoogleDriveService {
  
  static async forceDownloadAndUpload(
    pageId: string,
    accessToken: string,
    googleDriveUrl: string,
    description: string,
    customLabels: string[] = [],
    language: string = 'en'
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    
    const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (!fileIdMatch) {
      return { success: false, error: 'Invalid Google Drive URL format' };
    }
    
    const fileId = fileIdMatch[1];
    const outputFile = `/tmp/ultimate_gdrive_${fileId}_${Date.now()}.mp4`;
    
    try {
      console.log('Starting ultimate Google Drive download approach...');
      
      // Try multiple aggressive download strategies
      const downloadSuccess = await this.aggressiveMultiStrategyDownload(fileId, outputFile);
      
      if (!downloadSuccess) {
        this.cleanupFile(outputFile);
        return { 
          success: false, 
          error: 'All download strategies failed. Google Drive file access is restricted.' 
        };
      }
      
      // Verify downloaded file
      const stats = statSync(outputFile);
      const sizeMB = stats.size / (1024 * 1024);
      
      console.log(`Downloaded file: ${sizeMB.toFixed(1)}MB`);
      
      if (sizeMB < 10) {
        this.cleanupFile(outputFile);
        return { 
          success: false, 
          error: `Downloaded file too small (${sizeMB.toFixed(1)}MB). Access may be restricted.` 
        };
      }
      
      // Upload to Facebook
      console.log(`Uploading ${sizeMB.toFixed(1)}MB video to Facebook...`);
      const uploadResult = await HootsuiteStyleFacebookService.uploadVideoFile(
        pageId,
        accessToken,
        outputFile,
        description,
        customLabels,
        language
      );
      
      this.cleanupFile(outputFile);
      
      if (uploadResult.success) {
        console.log(`Facebook upload successful: ${uploadResult.postId}`);
        return { success: true, postId: uploadResult.postId };
      } else {
        return { success: false, error: `Facebook upload failed: ${uploadResult.error}` };
      }
      
    } catch (error) {
      this.cleanupFile(outputFile);
      return { success: false, error: `Process error: ${error.message}` };
    }
  }
  
  private static async aggressiveMultiStrategyDownload(fileId: string, outputPath: string): Promise<boolean> {
    const strategies = [
      () => this.strategyFFmpegWithCurl(fileId, outputPath),
      () => this.strategyCurlDirect(fileId, outputPath),
      () => this.strategyWgetDirect(fileId, outputPath),
      () => this.strategyFFmpegAlternate(fileId, outputPath)
    ];
    
    for (let i = 0; i < strategies.length; i++) {
      console.log(`Trying download strategy ${i + 1}/${strategies.length}...`);
      
      try {
        const success = await strategies[i]();
        if (success) {
          console.log(`Strategy ${i + 1} succeeded`);
          return true;
        }
      } catch (error) {
        console.log(`Strategy ${i + 1} failed: ${error.message}`);
      }
      
      // Clean up partial files between attempts
      this.cleanupFile(outputPath);
    }
    
    return false;
  }
  
  private static async strategyFFmpegWithCurl(fileId: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
      
      const ffmpegArgs = [
        '-y',
        '-protocol_whitelist', 'file,http,https,tcp,tls',
        '-user_agent', 'Mozilla/5.0 (compatible; GoogleBot/2.1)',
        '-headers', 'Accept: video/mp4,video/*,*/*\r\nAccept-Encoding: identity\r\n',
        '-timeout', '600000000', // 10 minutes
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_delay_max', '10',
        '-i', url,
        '-c', 'copy',
        '-f', 'mp4',
        outputPath
      ];
      
      console.log('FFmpeg+cURL strategy starting...');
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      let lastProgressTime = Date.now();
      
      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        const sizeMatch = output.match(/size=\s*(\d+)kB/);
        if (sizeMatch) {
          const sizeMB = parseInt(sizeMatch[1]) / 1024;
          if (sizeMB > 0) {
            console.log(`FFmpeg progress: ${sizeMB.toFixed(1)}MB`);
            lastProgressTime = Date.now();
          }
        }
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0 && existsSync(outputPath)) {
          const stats = statSync(outputPath);
          const sizeMB = stats.size / (1024 * 1024);
          resolve(sizeMB > 10);
        } else {
          resolve(false);
        }
      });
      
      ffmpeg.on('error', () => resolve(false));
      
      // Timeout with stagnation detection
      setTimeout(() => {
        if (!ffmpeg.killed) {
          ffmpeg.kill('SIGTERM');
          resolve(false);
        }
      }, 600000); // 10 minutes
    });
  }
  
  private static async strategyCurlDirect(fileId: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
      
      const curlArgs = [
        '-L', // Follow redirects
        '-o', outputPath,
        '-C', '-', // Resume downloads
        '--user-agent', 'Mozilla/5.0 (compatible; GoogleBot/2.1)',
        '--header', 'Accept: video/mp4,video/*,*/*',
        '--connect-timeout', '60',
        '--max-time', '600', // 10 minutes
        '--retry', '3',
        '--retry-delay', '5',
        url
      ];
      
      console.log('cURL direct strategy starting...');
      const curl = spawn('curl', curlArgs);
      
      curl.on('close', (code) => {
        if (code === 0 && existsSync(outputPath)) {
          const stats = statSync(outputPath);
          const sizeMB = stats.size / (1024 * 1024);
          console.log(`cURL downloaded: ${sizeMB.toFixed(1)}MB`);
          resolve(sizeMB > 10);
        } else {
          resolve(false);
        }
      });
      
      curl.on('error', () => resolve(false));
    });
  }
  
  private static async strategyWgetDirect(fileId: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
      
      const wgetArgs = [
        '--user-agent=Mozilla/5.0 (compatible; GoogleBot/2.1)',
        '--header=Accept: video/mp4,video/*,*/*',
        '--timeout=600',
        '--tries=3',
        '--continue',
        '-O', outputPath,
        url
      ];
      
      console.log('wget direct strategy starting...');
      const wget = spawn('wget', wgetArgs);
      
      wget.on('close', (code) => {
        if (code === 0 && existsSync(outputPath)) {
          const stats = statSync(outputPath);
          const sizeMB = stats.size / (1024 * 1024);
          console.log(`wget downloaded: ${sizeMB.toFixed(1)}MB`);
          resolve(sizeMB > 10);
        } else {
          resolve(false);
        }
      });
      
      wget.on('error', () => resolve(false));
    });
  }
  
  private static async strategyFFmpegAlternate(fileId: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      
      const ffmpegArgs = [
        '-y',
        '-user_agent', 'GoogleBot/2.1',
        '-headers', 'Accept: */*\r\n',
        '-timeout', '600000000',
        '-i', url,
        '-c', 'copy',
        '-f', 'mp4',
        outputPath
      ];
      
      console.log('FFmpeg alternate API strategy starting...');
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      ffmpeg.on('close', (code) => {
        if (code === 0 && existsSync(outputPath)) {
          const stats = statSync(outputPath);
          const sizeMB = stats.size / (1024 * 1024);
          console.log(`FFmpeg alternate downloaded: ${sizeMB.toFixed(1)}MB`);
          resolve(sizeMB > 10);
        } else {
          resolve(false);
        }
      });
      
      ffmpeg.on('error', () => resolve(false));
      
      setTimeout(() => {
        if (!ffmpeg.killed) {
          ffmpeg.kill('SIGTERM');
          resolve(false);
        }
      }, 600000);
    });
  }
  
  private static cleanupFile(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch (error) {
      // Silent cleanup
    }
  }
}