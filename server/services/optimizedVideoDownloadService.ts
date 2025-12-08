import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class OptimizedVideoDownloadService {
  static async downloadWithOptimizedSettings(url: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    const fileId = this.extractFileId(url);
    if (!fileId) {
      return { success: false, error: 'Invalid Google Drive URL' };
    }

    const outputFile = `/tmp/optimized_${fileId}_${Date.now()}.mp4`;
    
    console.log('OPTIMIZED DOWNLOAD APPROACH');
    console.log('Using multiple parallel connections and optimized parameters');
    console.log('Target: Fast download of complete 400MB video');

    // Try multiple optimized download methods in parallel
    const downloadMethods = [
      this.downloadWithAria2c(fileId, outputFile),
      this.downloadWithOptimizedFFmpeg(fileId, outputFile + '_ffmpeg'),
      this.downloadWithCurlOptimized(fileId, outputFile + '_curl')
    ];

    try {
      const result = await Promise.race(downloadMethods);
      
      if (result.success && result.filePath) {
        const stats = fs.statSync(result.filePath);
        const sizeMB = stats.size / (1024 * 1024);
        
        console.log(`Optimized download completed: ${sizeMB.toFixed(1)}MB`);
        
        // Rename to standard filename for upload processing
        const finalPath = `/tmp/ffmpeg_complete_${fileId}_${Date.now()}.mp4`;
        fs.renameSync(result.filePath, finalPath);
        
        return {
          success: true,
          filePath: finalPath,
          sizeMB: sizeMB
        };
      }
    } catch (error) {
      console.log('Optimized download error:', (error as Error).message);
    }

    return { success: false, error: 'All optimized download methods failed' };
  }

  private static async downloadWithAria2c(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
    return new Promise((resolve) => {
      console.log('Starting aria2c optimized download (16 connections)');
      
      const urls = this.generateGoogleDriveUrls(fileId);
      
      const aria2c = spawn('aria2c', [
        '--max-connection-per-server=16',
        '--split=16',
        '--min-split-size=1M',
        '--max-download-limit=0',
        '--continue=true',
        '--retry-wait=1',
        '--max-tries=10',
        '--timeout=30',
        '--connect-timeout=10',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--header=Accept: */*',
        '--header=Accept-Encoding: gzip, deflate',
        '--out=' + path.basename(outputFile),
        '--dir=' + path.dirname(outputFile),
        urls[0]
      ]);

      let lastSize = 0;
      let stagnantCount = 0;

      const progressMonitor = setInterval(() => {
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (sizeMB > lastSize + 5) { // Progress check
            console.log(`Aria2c: ${sizeMB.toFixed(1)}MB downloaded`);
            lastSize = sizeMB;
            stagnantCount = 0;
          } else {
            stagnantCount++;
            if (stagnantCount > 60) { // 10 minutes stagnant
              aria2c.kill('SIGKILL');
              clearInterval(progressMonitor);
            }
          }
        }
      }, 10000);

      aria2c.on('close', (code) => {
        clearInterval(progressMonitor);
        
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (code === 0 && sizeMB >= 350) {
            resolve({ success: true, filePath: outputFile });
          } else {
            resolve({ success: false, error: `Aria2c exit code ${code}, size ${sizeMB.toFixed(1)}MB` });
          }
        } else {
          resolve({ success: false, error: 'Aria2c failed - no output file' });
        }
      });

      // Timeout after 45 minutes
      setTimeout(() => {
        aria2c.kill('SIGKILL');
        clearInterval(progressMonitor);
        resolve({ success: false, error: 'Aria2c timeout' });
      }, 45 * 60 * 1000);
    });
  }

  private static async downloadWithOptimizedFFmpeg(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
    return new Promise((resolve) => {
      console.log('Starting optimized FFmpeg download (multiple URL attempts)');
      
      const urls = this.generateGoogleDriveUrls(fileId);
      
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-multiple_requests', '1',
        '-seekable', '0',
        '-http_persistent', '1',
        '-timeout', '30000000',
        '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '-headers', 'Accept: */*\r\nAccept-Encoding: gzip, deflate\r\n',
        '-i', urls[0],
        '-c', 'copy',
        '-bsf:v', 'h264_mp4toannexb',
        '-f', 'mp4',
        '-movflags', '+faststart',
        outputFile
      ]);

      let lastSize = 0;
      let stagnantCount = 0;

      const progressMonitor = setInterval(() => {
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (sizeMB > lastSize + 5) {
            console.log(`Optimized FFmpeg: ${sizeMB.toFixed(1)}MB downloaded`);
            lastSize = sizeMB;
            stagnantCount = 0;
          } else {
            stagnantCount++;
            if (stagnantCount > 60) { // 10 minutes stagnant
              ffmpeg.kill('SIGKILL');
              clearInterval(progressMonitor);
            }
          }
        }
      }, 10000);

      ffmpeg.on('close', (code) => {
        clearInterval(progressMonitor);
        
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (code === 0 && sizeMB >= 350) {
            resolve({ success: true, filePath: outputFile });
          } else {
            resolve({ success: false, error: `Optimized FFmpeg exit code ${code}, size ${sizeMB.toFixed(1)}MB` });
          }
        } else {
          resolve({ success: false, error: 'Optimized FFmpeg failed - no output file' });
        }
      });

      // Timeout after 45 minutes
      setTimeout(() => {
        ffmpeg.kill('SIGKILL');
        clearInterval(progressMonitor);
        resolve({ success: false, error: 'Optimized FFmpeg timeout' });
      }, 45 * 60 * 1000);
    });
  }

  private static async downloadWithCurlOptimized(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
    return new Promise((resolve) => {
      console.log('Starting optimized curl download (parallel connections)');
      
      const urls = this.generateGoogleDriveUrls(fileId);
      
      const curl = spawn('curl', [
        '--fail',
        '--location',
        '--continue-at', '-',
        '--retry', '20',
        '--retry-delay', '2',
        '--retry-max-time', '1800',
        '--connect-timeout', '30',
        '--max-time', '0',
        '--keepalive-time', '30',
        '--parallel',
        '--parallel-max', '8',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--header', 'Accept: */*',
        '--header', 'Accept-Encoding: gzip, deflate',
        '--header', 'Connection: keep-alive',
        '--output', outputFile,
        urls[0]
      ]);

      let lastSize = 0;
      let stagnantCount = 0;

      const progressMonitor = setInterval(() => {
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (sizeMB > lastSize + 5) {
            console.log(`Optimized curl: ${sizeMB.toFixed(1)}MB downloaded`);
            lastSize = sizeMB;
            stagnantCount = 0;
          } else {
            stagnantCount++;
            if (stagnantCount > 60) { // 10 minutes stagnant
              curl.kill('SIGKILL');
              clearInterval(progressMonitor);
            }
          }
        }
      }, 10000);

      curl.on('close', (code) => {
        clearInterval(progressMonitor);
        
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (code === 0 && sizeMB >= 350) {
            resolve({ success: true, filePath: outputFile });
          } else {
            resolve({ success: false, error: `Optimized curl exit code ${code}, size ${sizeMB.toFixed(1)}MB` });
          }
        } else {
          resolve({ success: false, error: 'Optimized curl failed - no output file' });
        }
      });

      // Timeout after 45 minutes
      setTimeout(() => {
        curl.kill('SIGKILL');
        clearInterval(progressMonitor);
        resolve({ success: false, error: 'Optimized curl timeout' });
      }, 45 * 60 * 1000);
    });
  }

  private static generateGoogleDriveUrls(fileId: string): string[] {
    return [
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`,
      `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
      `https://docs.google.com/uc?export=download&id=${fileId}&confirm=t`,
      `https://drive.usercontent.google.com/u/0/uc?id=${fileId}&export=download`,
      `https://drive.google.com/file/d/${fileId}/view?usp=drive_link`
    ];
  }

  static extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /id=([a-zA-Z0-9_-]+)/,
      /folders\/([a-zA-Z0-9_-]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  }
}