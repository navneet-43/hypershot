import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DiskSpaceMonitor } from '../utils/diskSpaceMonitor';

export class FFmpegGoogleDriveService {
  
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

  static async downloadLargeVideo(url: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    console.log('🎬 FFMPEG GOOGLE DRIVE DOWNLOAD');
    console.log('📁 URL:', url);
    
    // PRODUCTION FIX: Check disk space BEFORE download
    console.log('💾 Pre-download disk space check...');
    try {
      await DiskSpaceMonitor.ensureMinimumSpace(200); // Videos can be large
    } catch (spaceError: any) {
      console.error('❌ Disk space error:', spaceError.message);
      // Try ultra-aggressive cleanup
      console.log('🚨 Attempting ultra-aggressive cleanup...');
      await DiskSpaceMonitor.ultraAggressiveCleanup();
      // Re-check
      const finalCheck = await DiskSpaceMonitor.hasEnoughSpace(150);
      if (!finalCheck.hasSpace) {
        const diskSpace = await DiskSpaceMonitor.getDiskSpace();
        return {
          success: false,
          error: `❌ INSUFFICIENT DISK SPACE: Only ${finalCheck.available.toFixed(0)}MB available in /tmp (need 150MB). Your environment has ${diskSpace.totalMB.toFixed(0)}MB total disk space. Please use smaller videos or contact Replit support to upgrade your deployment tier.`
        };
      }
    }
    
    const fileId = this.extractFileId(url);
    if (!fileId) {
      return { success: false, error: 'Invalid Google Drive URL' };
    }

    const outputFile = `/tmp/gdrive_video_${fileId}_${Date.now()}.mp4`;
    console.log('📥 Output file:', outputFile);

    // Try multiple Google Drive URLs with FFmpeg
    const downloadUrls = [
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
      `https://docs.google.com/uc?export=download&id=${fileId}`,
      `https://drive.google.com/file/d/${fileId}/view?usp=sharing`
    ];

    for (let i = 0; i < downloadUrls.length; i++) {
      const downloadUrl = downloadUrls[i];
      console.log(`🔄 Attempt ${i + 1}/4: Testing ${downloadUrl.substring(0, 50)}...`);
      
      const result = await this.downloadWithFFmpeg(downloadUrl, outputFile);
      
      if (result.success && result.sizeMB && result.sizeMB > 5) {
        console.log(`✅ Success with attempt ${i + 1}: ${result.sizeMB.toFixed(1)}MB`);
        return result;
      } else if (result.success) {
        console.log(`❌ File too small with attempt ${i + 1}: ${result.sizeMB?.toFixed(1)}MB`);
        // Clean up small file and try next URL
        if (fs.existsSync(outputFile)) {
          fs.unlinkSync(outputFile);
        }
      } else {
        console.log(`❌ Failed attempt ${i + 1}: ${result.error}`);
      }
    }

    return { success: false, error: 'All download attempts failed' };
  }

  static async downloadWithFFmpeg(url: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      console.log('🎯 Starting FFmpeg download...');
      
      const ffmpeg = spawn('ffmpeg', [
        '-i', url,
        '-c', 'copy',
        '-f', 'mp4',
        '-movflags', '+faststart',
        '-y', // Overwrite output file
        outputFile
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let hasOutput = false;
      let lastProgress = '';

      ffmpeg.stdout.on('data', (data) => {
        hasOutput = true;
        console.log('FFmpeg output:', data.toString().trim());
      });

      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        
        // Look for progress indicators
        if (output.includes('time=') || output.includes('size=')) {
          const progressLine = output.split('\n').find(line => 
            line.includes('time=') && line.includes('size=')
          );
          
          if (progressLine && progressLine !== lastProgress) {
            console.log('Progress:', progressLine.trim());
            lastProgress = progressLine;
          }
        }
        
        hasOutput = true;
      });

      ffmpeg.on('close', (code) => {
        console.log(`FFmpeg process closed with code ${code}`);
        
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`✅ Download completed: ${sizeMB.toFixed(1)}MB`);
          
          if (sizeMB > 0.1) { // At least 100KB
            resolve({
              success: true,
              filePath: outputFile,
              sizeMB: sizeMB
            });
          } else {
            console.log('❌ File too small, likely failed download');
            if (fs.existsSync(outputFile)) {
              fs.unlinkSync(outputFile);
            }
            resolve({ success: false, error: `File too small: ${sizeMB.toFixed(1)}MB` });
          }
        } else {
          resolve({ success: false, error: `FFmpeg failed with code ${code}` });
        }
      });

      ffmpeg.on('error', (error) => {
        console.log('❌ FFmpeg error:', error.message);
        resolve({ success: false, error: error.message });
      });

      // Timeout after 10 minutes
      setTimeout(() => {
        console.log('⏰ FFmpeg timeout - killing process');
        ffmpeg.kill('SIGKILL');
        
        // Check if we got a partial download
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (sizeMB > 5) {
            console.log(`⚡ Using partial download: ${sizeMB.toFixed(1)}MB`);
            resolve({
              success: true,
              filePath: outputFile,
              sizeMB: sizeMB
            });
          } else {
            fs.unlinkSync(outputFile);
            resolve({ success: false, error: 'Download timeout with insufficient data' });
          }
        } else {
          resolve({ success: false, error: 'Download timeout' });
        }
      }, 600000); // 10 minutes
    });
  }
}