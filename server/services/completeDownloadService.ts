import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';

export class CompleteDownloadService {
  
  static async downloadCompleteVideo(url: string, targetSizeMB: number = 400): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    console.log('🎯 COMPLETE VIDEO DOWNLOAD - NO PARTIAL FILES');
    console.log('📁 URL:', url);
    console.log('🎯 Target: Download complete', targetSizeMB + 'MB video');
    console.log('⚠️ Will NOT proceed until complete file is downloaded');
    
    const fileId = this.extractFileId(url);
    if (!fileId) {
      return { success: false, error: 'Invalid Google Drive URL' };
    }

    const outputFile = `/tmp/complete_full_video_${fileId}_${Date.now()}.mp4`;
    console.log('📥 Output file:', outputFile);

    // Method 1: yt-dlp (best for complete downloads)
    console.log('🔄 Method 1: yt-dlp complete download');
    const ytdlpResult = await this.ytdlpCompleteDownload(url, outputFile, targetSizeMB);
    if (ytdlpResult.success && ytdlpResult.sizeMB && ytdlpResult.sizeMB >= targetSizeMB * 0.95) {
      return ytdlpResult;
    }

    // Method 2: gdown with complete file verification
    console.log('🔄 Method 2: gdown complete download');
    const gdownResult = await this.gdownCompleteDownload(fileId, outputFile, targetSizeMB);
    if (gdownResult.success && gdownResult.sizeMB && gdownResult.sizeMB >= targetSizeMB * 0.95) {
      return gdownResult;
    }

    // Method 3: Aggressive curl with complete download verification
    console.log('🔄 Method 3: Aggressive curl complete download');
    const curlResult = await this.curlCompleteDownload(fileId, outputFile, targetSizeMB);
    if (curlResult.success && curlResult.sizeMB && curlResult.sizeMB >= targetSizeMB * 0.95) {
      return curlResult;
    }

    return { success: false, error: 'All methods failed to download complete file' };
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

  static async ytdlpCompleteDownload(url: string, outputFile: string, targetSizeMB: number): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      console.log('📥 yt-dlp: Downloading complete video file...');
      
      const ytdlp = spawn('yt-dlp', [
        '--no-check-certificate',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--output', outputFile,
        '--format', 'best',
        '--no-playlist',
        '--extract-flat', 'false',
        '--retries', '10',
        '--fragment-retries', '10',
        '--keep-fragments',
        url
      ]);

      let lastSize = 0;
      let stagnantCount = 0;

      ytdlp.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('yt-dlp:', output.trim());
      });

      ytdlp.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('%') || output.includes('downloaded') || output.includes('MB')) {
          console.log('yt-dlp progress:', output.trim());
        }
      });

      // Monitor file size growth
      const sizeMonitor = setInterval(() => {
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const currentSizeMB = stats.size / (1024 * 1024);
          
          if (currentSizeMB > lastSize + 5) { // Growing by at least 5MB
            console.log(`yt-dlp progress: ${currentSizeMB.toFixed(1)}MB / ${targetSizeMB}MB target`);
            lastSize = currentSizeMB;
            stagnantCount = 0;
          } else {
            stagnantCount++;
            if (stagnantCount > 20) { // 10 minutes stagnant
              console.log('yt-dlp: Download appears stagnant');
              ytdlp.kill();
            }
          }
        }
      }, 30000); // Check every 30 seconds

      ytdlp.on('close', (code) => {
        clearInterval(sizeMonitor);
        
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`yt-dlp result: ${sizeMB.toFixed(1)}MB`);
          
          if (sizeMB >= targetSizeMB * 0.95) { // At least 95% of target size
            console.log('✅ yt-dlp: Complete download achieved');
            resolve({
              success: true,
              filePath: outputFile,
              sizeMB: sizeMB
            });
          } else {
            console.log(`❌ yt-dlp: Incomplete download (${sizeMB.toFixed(1)}MB < ${targetSizeMB}MB)`);
            resolve({ success: false, error: 'Incomplete download' });
          }
        } else {
          resolve({ success: false, error: `yt-dlp failed with code ${code}` });
        }
      });

      ytdlp.on('error', (error) => {
        clearInterval(sizeMonitor);
        resolve({ success: false, error: error.message });
      });

      // Timeout after 45 minutes
      setTimeout(() => {
        clearInterval(sizeMonitor);
        ytdlp.kill();
        resolve({ success: false, error: 'yt-dlp timeout' });
      }, 2700000);
    });
  }

  static async gdownCompleteDownload(fileId: string, outputFile: string, targetSizeMB: number): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      console.log('📥 gdown: Downloading complete video file...');
      
      const gdown = spawn('python3', ['-c', `
import gdown
import sys
import os
import time

def monitor_download():
    try:
        print("Starting complete download...")
        gdown.download('https://drive.google.com/uc?id=${fileId}', '${outputFile}', quiet=False)
        
        if os.path.exists('${outputFile}'):
            size_mb = os.path.getsize('${outputFile}') / (1024 * 1024)
            print(f"Downloaded: {size_mb:.1f}MB")
            
            if size_mb >= ${targetSizeMB} * 0.95:
                print("SUCCESS: Complete download achieved")
                sys.exit(0)
            else:
                print(f"ERROR: Incomplete download ({size_mb:.1f}MB < ${targetSizeMB}MB)")
                sys.exit(1)
        else:
            print("ERROR: File not created")
            sys.exit(1)
            
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

monitor_download()
`]);

      let lastSize = 0;

      gdown.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('gdown:', output.trim());
      });

      // Monitor file size
      const sizeMonitor = setInterval(() => {
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const currentSizeMB = stats.size / (1024 * 1024);
          
          if (currentSizeMB > lastSize + 10) {
            console.log(`gdown progress: ${currentSizeMB.toFixed(1)}MB / ${targetSizeMB}MB target`);
            lastSize = currentSizeMB;
          }
        }
      }, 30000);

      gdown.on('close', (code) => {
        clearInterval(sizeMonitor);
        
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`gdown result: ${sizeMB.toFixed(1)}MB`);
          resolve({
            success: true,
            filePath: outputFile,
            sizeMB: sizeMB
          });
        } else {
          resolve({ success: false, error: `gdown failed with code ${code}` });
        }
      });

      gdown.on('error', (error) => {
        clearInterval(sizeMonitor);
        resolve({ success: false, error: error.message });
      });

      // Timeout after 45 minutes
      setTimeout(() => {
        clearInterval(sizeMonitor);
        gdown.kill();
        resolve({ success: false, error: 'gdown timeout' });
      }, 2700000);
    });
  }

  static async curlCompleteDownload(fileId: string, outputFile: string, targetSizeMB: number): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      console.log('📥 curl: Downloading complete video file...');
      
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
      
      const curl = spawn('curl', [
        '-L',
        '--max-time', '0', // No timeout
        '--connect-timeout', '300',
        '--retry', '10',
        '--retry-delay', '10',
        '--retry-max-time', '2700', // 45 minutes
        '--continue-at', '-', // Resume capability
        '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '-H', 'Accept: */*',
        '-H', 'Accept-Language: en-US,en;q=0.5',
        '-H', 'Connection: keep-alive',
        '--progress-bar',
        '-o', outputFile,
        downloadUrl
      ]);

      let lastSize = 0;
      let stagnantCount = 0;

      curl.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('#') || output.includes('%')) {
          process.stdout.write('.');
        }
      });

      // Monitor file size growth
      const sizeMonitor = setInterval(() => {
        if (fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const currentSizeMB = stats.size / (1024 * 1024);
          
          if (currentSizeMB > lastSize + 5) {
            console.log(`\ncurl progress: ${currentSizeMB.toFixed(1)}MB / ${targetSizeMB}MB target`);
            lastSize = currentSizeMB;
            stagnantCount = 0;
          } else {
            stagnantCount++;
            if (stagnantCount > 30) { // 15 minutes stagnant
              console.log('\ncurl: Download appears stagnant');
              curl.kill();
            }
          }
        }
      }, 30000);

      curl.on('close', (code) => {
        clearInterval(sizeMonitor);
        
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`\ncurl result: ${sizeMB.toFixed(1)}MB`);
          
          if (sizeMB >= targetSizeMB * 0.95) {
            console.log('✅ curl: Complete download achieved');
            resolve({
              success: true,
              filePath: outputFile,
              sizeMB: sizeMB
            });
          } else {
            console.log(`❌ curl: Incomplete download (${sizeMB.toFixed(1)}MB < ${targetSizeMB}MB)`);
            resolve({ success: false, error: 'Incomplete download' });
          }
        } else {
          resolve({ success: false, error: `curl failed with code ${code}` });
        }
      });

      curl.on('error', (error) => {
        clearInterval(sizeMonitor);
        resolve({ success: false, error: error.message });
      });

      // Timeout after 45 minutes
      setTimeout(() => {
        clearInterval(sizeMonitor);
        curl.kill();
        resolve({ success: false, error: 'curl timeout' });
      }, 2700000);
    });
  }
}