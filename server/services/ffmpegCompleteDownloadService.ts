import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class FFmpegCompleteDownloadService {
  
  static async downloadCompleteVideoWithFFmpeg(url: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    console.log('FFMPEG COMPLETE DOWNLOAD APPROACH');
    console.log('Target: Download complete 400MB video using FFmpeg');
    console.log('URL:', url);
    
    const fileId = this.extractFileId(url);
    if (!fileId) {
      return { success: false, error: 'Invalid Google Drive URL' };
    }

    const outputFile = `/tmp/ffmpeg_complete_${fileId}_${Date.now()}.mp4`;
    console.log('Output:', outputFile);

    // Multiple Google Drive access URLs for FFmpeg
    const downloadUrls = [
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`,
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      `https://docs.google.com/uc?export=download&id=${fileId}`,
      `https://drive.google.com/file/d/${fileId}/view?usp=sharing`
    ];

    for (let urlIndex = 0; urlIndex < downloadUrls.length; urlIndex++) {
      console.log(`Attempting FFmpeg download with URL ${urlIndex + 1}/${downloadUrls.length}`);
      
      const result = await this.ffmpegDownloadAttempt(downloadUrls[urlIndex], outputFile, urlIndex + 1);
      
      if (result.success && result.sizeMB && result.sizeMB >= 350) {
        console.log(`SUCCESS: FFmpeg downloaded ${result.sizeMB.toFixed(1)}MB`);
        return result;
      } else if (result.sizeMB && result.sizeMB >= 200) {
        console.log(`Partial success: ${result.sizeMB.toFixed(1)}MB - trying next URL`);
        // Continue to next URL
      } else {
        console.log(`URL ${urlIndex + 1} failed: ${result.error}`);
      }
    }

    return { success: false, error: 'All FFmpeg download attempts failed' };
  }

  private static async ffmpegDownloadAttempt(url: string, outputFile: string, attemptNumber: number): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      console.log(`FFmpeg attempt ${attemptNumber}: Starting download`);
      
      const ffmpeg = spawn('ffmpeg', [
        '-i', url,
        '-c', 'copy', // Copy without re-encoding
        '-bsf:a', 'aac_adtstoasc', // Fix audio if needed
        '-movflags', '+faststart', // Optimize for streaming
        '-timeout', '60000000', // 60 seconds timeout per operation
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '4',
        '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '-headers', 'Accept: */*\r\nAccept-Language: en-US,en;q=0.5\r\n',
        '-y', // Overwrite output file
        outputFile
      ]);

      let lastSize = 0;
      let progressCount = 0;
      let stagnantCount = 0;

      // Monitor file size growth
      const progressMonitor = setInterval(() => {
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (sizeMB > lastSize + 5) { // Growing by 5MB
            console.log(`FFmpeg progress: ${sizeMB.toFixed(1)}MB`);
            lastSize = sizeMB;
            stagnantCount = 0;
          } else {
            stagnantCount++;
            
            // If stagnant for too long, kill process
            if (stagnantCount > 30) { // 5 minutes stagnant
              console.log('FFmpeg download stagnant - terminating');
              ffmpeg.kill('SIGKILL');
              clearInterval(progressMonitor);
            }
          }
          
          progressCount++;
        }
      }, 10000); // Check every 10 seconds

      ffmpeg.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('time=') || output.includes('size=')) {
          process.stdout.write('.');
        }
      });

      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('time=') || output.includes('size=')) {
          // Extract progress info
          const timeMatch = output.match(/time=(\d+:\d+:\d+)/);
          const sizeMatch = output.match(/size=\s*(\d+)kB/);
          
          if (timeMatch && sizeMatch) {
            const sizeKB = parseInt(sizeMatch[1]);
            const sizeMB = sizeKB / 1024;
            if (sizeMB > lastSize + 10) {
              console.log(`FFmpeg: ${sizeMB.toFixed(1)}MB processed`);
              lastSize = sizeMB;
            }
          }
        }
      });

      ffmpeg.on('close', (code) => {
        clearInterval(progressMonitor);
        
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`FFmpeg completed: ${sizeMB.toFixed(1)}MB`);
          
          if (code === 0 && sizeMB >= 399) {
            resolve({
              success: true,
              filePath: outputFile,
              sizeMB: sizeMB
            });
          } else {
            resolve({
              success: false,
              sizeMB: sizeMB,
              error: `FFmpeg exit code ${code}, size ${sizeMB.toFixed(1)}MB`
            });
          }
        } else {
          resolve({
            success: false,
            error: `FFmpeg failed, no output file`
          });
        }
      });

      ffmpeg.on('error', (error) => {
        clearInterval(progressMonitor);
        console.log('FFmpeg error:', error.message);
        resolve({
          success: false,
          error: error.message
        });
      });

      // Timeout after 45 minutes
      setTimeout(() => {
        clearInterval(progressMonitor);
        ffmpeg.kill('SIGKILL');
        
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          if (sizeMB >= 200) {
            console.log(`FFmpeg timeout but good size: ${sizeMB.toFixed(1)}MB`);
            resolve({
              success: true,
              filePath: outputFile,
              sizeMB: sizeMB
            });
          } else {
            resolve({
              success: false,
              sizeMB: sizeMB,
              error: 'FFmpeg timeout insufficient size'
            });
          }
        } else {
          resolve({
            success: false,
            error: 'FFmpeg timeout no file'
          });
        }
      }, 2700000); // 45 minutes
    });
  }

  static extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9-_]+)/,
      /id=([a-zA-Z0-9-_]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  static async optimizeVideoForFacebook(inputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    console.log('Optimizing video for Facebook upload');
    
    const outputFile = inputFile.replace('.mp4', '_optimized.mp4');
    
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputFile,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        '-y',
        outputFile
      ]);

      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('time=')) {
          process.stdout.write('.');
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`Optimized: ${sizeMB.toFixed(1)}MB`);
          resolve({
            success: true,
            filePath: outputFile,
            sizeMB: sizeMB
          });
        } else {
          resolve({
            success: false,
            error: `Optimization failed with code ${code}`
          });
        }
      });

      ffmpeg.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });
    });
  }
}