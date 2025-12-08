import { spawn } from 'child_process';
import * as fs from 'fs';
import fetch from 'node-fetch';

export class CompleteGoogleDriveService {
  
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

  static async downloadCompleteVideo(url: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    console.log('🎬 COMPLETE GOOGLE DRIVE DOWNLOAD');
    console.log('📁 URL:', url);
    console.log('🎯 Target: Download full 400MB video');
    
    const fileId = this.extractFileId(url);
    if (!fileId) {
      return { success: false, error: 'Invalid Google Drive URL' };
    }

    const outputFile = `/tmp/complete_video_${fileId}_${Date.now()}.mp4`;
    console.log('📥 Output file:', outputFile);

    // Method 1: yt-dlp with Google Drive support
    console.log('🔄 Method 1: yt-dlp download');
    const ytdlpResult = await this.ytdlpDownload(url, outputFile);
    if (ytdlpResult.success && ytdlpResult.sizeMB && ytdlpResult.sizeMB > 300) {
      console.log('✅ yt-dlp successful:', ytdlpResult.sizeMB?.toFixed(1) + 'MB');
      return ytdlpResult;
    }

    // Method 2: wget with aggressive parameters
    console.log('🔄 Method 2: wget with aggressive download');
    const wgetResult = await this.aggressiveWgetDownload(fileId, outputFile);
    if (wgetResult.success && wgetResult.sizeMB && wgetResult.sizeMB > 300) {
      console.log('✅ wget successful:', wgetResult.sizeMB?.toFixed(1) + 'MB');
      return wgetResult;
    }

    // Method 3: gdown with authentication
    console.log('🔄 Method 3: gdown download');
    const gdownResult = await this.gdownDownload(fileId, outputFile);
    if (gdownResult.success && gdownResult.sizeMB && gdownResult.sizeMB > 300) {
      console.log('✅ gdown successful:', gdownResult.sizeMB?.toFixed(1) + 'MB');
      return gdownResult;
    }

    // Method 4: Extended timeout direct download
    console.log('🔄 Method 4: Extended timeout download');
    const extendedResult = await this.extendedDirectDownload(fileId, outputFile);
    if (extendedResult.success && extendedResult.sizeMB && extendedResult.sizeMB > 300) {
      console.log('✅ Extended download successful:', extendedResult.sizeMB?.toFixed(1) + 'MB');
      return extendedResult;
    }

    return { success: false, error: 'All download methods failed to get complete file' };
  }

  static async ytdlpDownload(url: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      const ytdlp = spawn('yt-dlp', [
        '--no-check-certificate',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--output', outputFile,
        '--format', 'best',
        '--no-playlist',
        '--extract-flat', 'false',
        url
      ]);

      let hasOutput = false;

      ytdlp.stdout.on('data', (data) => {
        hasOutput = true;
        const output = data.toString();
        if (output.includes('%') || output.includes('MB')) {
          console.log('yt-dlp progress:', output.trim());
        }
      });

      ytdlp.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('%') || output.includes('downloaded')) {
          console.log('yt-dlp:', output.trim());
        }
      });

      ytdlp.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`yt-dlp download: ${sizeMB.toFixed(1)}MB`);
          resolve({
            success: true,
            filePath: outputFile,
            sizeMB: sizeMB
          });
        } else {
          resolve({ success: false, error: `yt-dlp failed with code ${code}` });
        }
      });

      ytdlp.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      // Timeout after 15 minutes
      setTimeout(() => {
        ytdlp.kill();
        resolve({ success: false, error: 'yt-dlp timeout' });
      }, 900000);
    });
  }

  static async aggressiveWgetDownload(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
      
      const wget = spawn('wget', [
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--no-check-certificate',
        '--content-disposition',
        '--timeout=300',
        '--tries=5',
        '--retry-connrefused',
        '--waitretry=5',
        '--continue',
        '-O', outputFile,
        downloadUrl
      ]);

      wget.stdout.on('data', (data) => {
        console.log('wget:', data.toString().trim());
      });

      wget.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('%') || output.includes('saved') || output.includes('MB')) {
          console.log('wget progress:', output.trim());
        }
      });

      wget.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`wget download: ${sizeMB.toFixed(1)}MB`);
          resolve({
            success: true,
            filePath: outputFile,
            sizeMB: sizeMB
          });
        } else {
          resolve({ success: false, error: `wget failed with code ${code}` });
        }
      });

      wget.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      // Timeout after 15 minutes
      setTimeout(() => {
        wget.kill();
        resolve({ success: false, error: 'wget timeout' });
      }, 900000);
    });
  }

  static async gdownDownload(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    return new Promise((resolve) => {
      const downloadUrl = `https://drive.google.com/uc?id=${fileId}`;
      
      const gdown = spawn('python3', ['-c', `
import gdown
import sys
try:
    gdown.download('${downloadUrl}', '${outputFile}', quiet=False)
    print('SUCCESS: Download completed')
except Exception as e:
    print(f'ERROR: {e}')
    sys.exit(1)
`]);

      gdown.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('gdown:', output.trim());
      });

      gdown.stderr.on('data', (data) => {
        const output = data.toString();
        if (!output.includes('WARNING')) { // Filter out gdown warnings
          console.log('gdown error:', output.trim());
        }
      });

      gdown.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          const stats = fs.statSync(outputFile);
          const sizeMB = stats.size / (1024 * 1024);
          
          console.log(`gdown download: ${sizeMB.toFixed(1)}MB`);
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
        resolve({ success: false, error: error.message });
      });

      // Timeout after 15 minutes
      setTimeout(() => {
        gdown.kill();
        resolve({ success: false, error: 'gdown timeout' });
      }, 900000);
    });
  }

  static async extendedDirectDownload(fileId: string, outputFile: string): Promise<{ success: boolean; filePath?: string; sizeMB?: number; error?: string }> {
    try {
      const downloadUrls = [
        `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`,
        `https://drive.google.com/uc?export=download&id=${fileId}`,
        `https://docs.google.com/uc?export=download&id=${fileId}`
      ];

      for (const downloadUrl of downloadUrls) {
        console.log('Trying URL:', downloadUrl);
        
        const response = await fetch(downloadUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          redirect: 'follow'
        });

        if (response.ok && response.body) {
          const writer = fs.createWriteStream(outputFile);
          
          return new Promise((resolve) => {
            let downloadedBytes = 0;
            let lastLogTime = Date.now();
            
            response.body!.on('data', (chunk) => {
              downloadedBytes += chunk.length;
              const now = Date.now();
              
              // Log progress every 5 seconds
              if (now - lastLogTime > 5000) {
                const sizeMB = downloadedBytes / (1024 * 1024);
                console.log(`Extended download progress: ${sizeMB.toFixed(1)}MB`);
                lastLogTime = now;
              }
            });
            
            response.body!.pipe(writer);
            
            writer.on('finish', () => {
              if (fs.existsSync(outputFile)) {
                const stats = fs.statSync(outputFile);
                const sizeMB = stats.size / (1024 * 1024);
                
                console.log(`Extended download: ${sizeMB.toFixed(1)}MB`);
                resolve({
                  success: true,
                  filePath: outputFile,
                  sizeMB: sizeMB
                });
              } else {
                resolve({ success: false, error: 'File not created' });
              }
            });
            
            writer.on('error', (error) => {
              resolve({ success: false, error: error.message });
            });
          });
        }
      }
      
      return { success: false, error: 'All URLs failed' };
      
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}