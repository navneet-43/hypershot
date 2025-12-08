import ytdl from '@distube/ytdl-core';
import { createWriteStream, createReadStream, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

/**
 * YouTube video helper for Facebook integration
 * Downloads YouTube videos and uploads them as actual video files
 */
export class YouTubeHelper {
  
  /**
   * Download and merge high-quality video with audio using FFmpeg
   */
  private static async downloadAndMergeVideoAudio(
    url: string, 
    videoFormat: any, 
    audioFormat: any, 
    videoId: string
  ): Promise<string | null> {
    const videoPath = join(tmpdir(), `youtube_video_${videoId}_${Date.now()}.${videoFormat.container}`);
    const audioPath = join(tmpdir(), `youtube_audio_${videoId}_${Date.now()}.${audioFormat.container}`);
    const outputPath = join(tmpdir(), `youtube_merged_${videoId}_${Date.now()}.mp4`);
    
    try {
      console.log('📥 DOWNLOADING HIGH-QUALITY VIDEO STREAM...');
      
      // Download video stream
      await new Promise<void>((resolve, reject) => {
        const videoStream = ytdl(url, { format: videoFormat });
        const videoWriteStream = createWriteStream(videoPath);
        
        videoStream.on('progress', (chunkLength, downloaded, total) => {
          const percent = ((downloaded / total) * 100).toFixed(1);
          const sizeMB = (downloaded / 1024 / 1024).toFixed(1);
          console.log(`📹 VIDEO PROGRESS: ${percent}% - ${sizeMB}MB`);
        });
        
        videoStream.pipe(videoWriteStream);
        videoWriteStream.on('finish', resolve);
        videoWriteStream.on('error', reject);
        videoStream.on('error', reject);
      });
      
      console.log('🎵 DOWNLOADING AUDIO STREAM...');
      
      // Download audio stream
      await new Promise<void>((resolve, reject) => {
        const audioStream = ytdl(url, { format: audioFormat });
        const audioWriteStream = createWriteStream(audioPath);
        
        audioStream.on('progress', (chunkLength, downloaded, total) => {
          const percent = ((downloaded / total) * 100).toFixed(1);
          const sizeMB = (downloaded / 1024 / 1024).toFixed(1);
          console.log(`🎵 AUDIO PROGRESS: ${percent}% - ${sizeMB}MB`);
        });
        
        audioStream.pipe(audioWriteStream);
        audioWriteStream.on('finish', resolve);
        audioWriteStream.on('error', reject);
        audioStream.on('error', reject);
      });
      
      console.log('🔀 MERGING VIDEO AND AUDIO WITH FFMPEG...');
      
      // Merge video and audio using FFmpeg
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', videoPath,
          '-i', audioPath,
          '-c:v', 'copy',  // Copy video without re-encoding for speed
          '-c:a', 'aac',   // Convert audio to AAC for Facebook compatibility
          '-y',            // Overwrite output file
          outputPath
        ]);
        
        ffmpeg.stderr.on('data', (data) => {
          // FFmpeg sends progress info to stderr
          const output = data.toString();
          if (output.includes('time=')) {
            console.log('🔀 MERGE PROGRESS:', output.trim().split('\n').pop());
          }
        });
        
        ffmpeg.on('close', (code) => {
          if (code === 0) {
            console.log('✅ VIDEO+AUDIO MERGE COMPLETED');
            resolve();
          } else {
            reject(new Error(`FFmpeg failed with exit code ${code}`));
          }
        });
        
        ffmpeg.on('error', reject);
      });
      
      // Clean up temporary files
      try {
        unlinkSync(videoPath);
        unlinkSync(audioPath);
        console.log('🗑️ TEMP FILES CLEANED');
      } catch (cleanupError) {
        console.log('⚠️  Failed to clean temporary files:', cleanupError);
      }
      
      const finalSize = statSync(outputPath).size;
      console.log(`✅ HIGH-QUALITY MERGE SUCCESS: ${(finalSize / 1024 / 1024).toFixed(1)}MB`);
      
      return outputPath;
      
    } catch (error) {
      // Clean up any partial files
      try {
        [videoPath, audioPath, outputPath].forEach(path => {
          try { unlinkSync(path); } catch {}
        });
      } catch {}
      
      throw error;
    }
  }
  
  /**
   * Check if URL is a YouTube link
   */
  static isYouTubeUrl(url: string): boolean {
    return url.includes('youtube.com') || url.includes('youtu.be');
  }

  /**
   * Extract YouTube video ID from various URL formats
   */
  static extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Download YouTube video and get file path for Facebook upload
   */
  static async downloadVideo(originalUrl: string): Promise<{
    filePath: string;
    size: number;
    contentType: string;
    verified: boolean;
    videoId?: string;
    method: 'youtube_download';
    isValid: boolean;
    cleanup: () => void;
    error?: string;
  }> {
    console.log('🎥 DOWNLOADING YOUTUBE VIDEO for Facebook upload');
    
    const videoId = this.extractVideoId(originalUrl);
    
    if (!videoId) {
      console.log('❌ Could not extract YouTube video ID');
      return {
        filePath: '',
        size: 0,
        contentType: 'video/mp4',
        verified: false,
        method: 'youtube_download',
        isValid: false,
        cleanup: () => {}
      };
    }

    try {
      // Get video info first with improved error handling
      console.log('🔍 Fetching YouTube video info...');
      const info = await ytdl.getInfo(originalUrl);
      console.log('🔍 YOUTUBE VIDEO INFO:', info.videoDetails.title);
      console.log('🔍 VIDEO ORIGINAL RESOLUTION:', info.videoDetails.viewCount ? 'View count available' : 'Limited info');
      
      // Find best available format with fallback options
      let format;
      
      // Enhanced quality selection - try multiple strategies to get best quality
      console.log('🔍 ANALYZING ALL AVAILABLE FORMATS...');
      
      // Log all formats first for transparency
      console.log(`📊 TOTAL FORMATS FOUND: ${info.formats.length}`);
      info.formats.forEach((f, index) => {
        const size = f.contentLength ? (parseInt(f.contentLength) / 1024 / 1024).toFixed(1) + 'MB' : 'unknown';
        const type = f.hasVideo && f.hasAudio ? 'V+A' : f.hasVideo ? 'V' : f.hasAudio ? 'A' : '?';
        const quality = f.qualityLabel || (f.height ? f.height + 'p' : 'unknown');
        const fps = f.fps ? ` (${f.fps}fps)` : '';
        const bitrate = f.bitrate ? ` - ${Math.round(f.bitrate/1000)}kbps` : '';
        console.log(`  ${index + 1}. ${quality}${fps} | ${f.container || 'unknown'} | ${type} | ${size}${bitrate}`);
      });
      
      // Show video-only formats (these are often higher quality)
      const videoOnlyFormats = info.formats.filter(f => f.hasVideo && !f.hasAudio);
      console.log(`📊 VIDEO-ONLY FORMATS: ${videoOnlyFormats.length}`);
      videoOnlyFormats.forEach((f, index) => {
        const quality = f.qualityLabel || (f.height ? f.height + 'p' : 'unknown');
        const size = f.contentLength ? (parseInt(f.contentLength) / 1024 / 1024).toFixed(1) + 'MB' : 'unknown';
        const fps = f.fps ? ` (${f.fps}fps)` : '';
        console.log(`  V${index + 1}. ${quality}${fps} | ${f.container || 'unknown'} | VIDEO-ONLY | ${size}`);
      });
      
      // Strategy 1: Look for adaptive formats with separate video and audio (often highest quality)
      const adaptiveVideoFormats = info.formats.filter(f => 
        f.hasVideo && !f.hasAudio && (f.container === 'mp4' || f.container === 'webm')
      ).sort((a, b) => (parseInt(b.height || '0') - parseInt(a.height || '0')));
      
      const adaptiveAudioFormats = info.formats.filter(f => 
        !f.hasVideo && f.hasAudio && (f.container === 'm4a' || f.container === 'webm')
      ).sort((a, b) => (parseInt(b.audioBitrate || '0') - parseInt(a.audioBitrate || '0')));
      
      console.log(`📊 ADAPTIVE FORMATS: ${adaptiveVideoFormats.length} video, ${adaptiveAudioFormats.length} audio`);
      
      // Strategy 2: Combined video+audio formats (easier but usually lower quality)
      const combinedFormats = info.formats.filter(format => 
        format.hasVideo && format.hasAudio
      ).sort((a, b) => {
        // Sort by quality (height) and then by file size
        const heightDiff = parseInt(b.height || '0') - parseInt(a.height || '0');
        if (heightDiff !== 0) return heightDiff;
        return parseInt(b.contentLength || '0') - parseInt(a.contentLength || '0');
      });
      
      console.log(`📊 COMBINED FORMATS: ${combinedFormats.length} available`);
      
      // Enhanced quality selection with better prioritization
      let selectedFormat = null;
      let selectionMethod = '';
      
      // Priority 1: Look for high-quality combined formats (720p+ preferred)
      const highQualityCombined = combinedFormats.filter(f => {
        const height = parseInt(f.height || '0');
        return height >= 720; // 720p or higher
      });
      
      console.log(`🎯 HIGH-QUALITY COMBINED (720p+): ${highQualityCombined.length} found`);
      highQualityCombined.forEach((f, i) => {
        const quality = f.qualityLabel || f.height + 'p';
        const size = f.contentLength ? (parseInt(f.contentLength) / 1024 / 1024).toFixed(1) + 'MB' : 'unknown';
        console.log(`    HQ${i+1}. ${quality} | ${size}`);
      });
      
      // Check if video-only high quality formats exist
      const highQualityVideoOnly = videoOnlyFormats.filter(f => {
        const height = parseInt(f.height || '0');
        return height >= 720;
      });
      
      console.log(`🎯 HIGH-QUALITY VIDEO-ONLY (720p+): ${highQualityVideoOnly.length} found`);
      highQualityVideoOnly.forEach((f, i) => {
        const quality = f.qualityLabel || f.height + 'p';
        const size = f.contentLength ? (parseInt(f.contentLength) / 1024 / 1024).toFixed(1) + 'MB' : 'unknown';
        console.log(`    HQV${i+1}. ${quality} | ${size} (requires audio merge)`);
      });
      
      // NEW: Priority 1 - Try high-quality video+audio merging first
      if (highQualityVideoOnly.length > 0 && adaptiveAudioFormats.length > 0) {
        const bestVideo = highQualityVideoOnly[0];
        const bestAudio = adaptiveAudioFormats[0];
        
        console.log(`🎯 ATTEMPTING HIGH-QUALITY MERGE: ${bestVideo.qualityLabel || bestVideo.height + 'p'} video + audio`);
        
        // Try to download and merge high quality video+audio
        try {
          const mergedPath = await this.downloadAndMergeVideoAudio(originalUrl, bestVideo, bestAudio, videoId);
          if (mergedPath) {
            const fileSize = statSync(mergedPath).size;
            console.log(`✅ HIGH-QUALITY MERGE COMPLETE: ${(fileSize / 1024 / 1024).toFixed(1)}MB`);
            return {
              filePath: mergedPath,
              size: fileSize,
              contentType: 'video/mp4',
              verified: true,
              videoId: videoId,
              method: 'youtube_download',
              isValid: true,
              cleanup: () => {
                try {
                  unlinkSync(mergedPath);
                  console.log('🗑️ HIGH-QUALITY MERGED FILE CLEANED');
                } catch (error) {
                  console.log('⚠️ Failed to clean merged file:', error);
                }
              }
            };
          }
        } catch (mergeError) {
          console.log(`⚠️  HIGH-QUALITY MERGE FAILED: ${mergeError instanceof Error ? mergeError.message : 'Unknown error'}`);
          console.log(`📱 FALLING BACK TO COMBINED FORMAT...`);
        }
      }
      
      // Priority 2: High-quality combined formats (720p+ preferred)
      if (highQualityCombined.length > 0) {
        selectedFormat = highQualityCombined[0];
        selectionMethod = `HIGH-QUALITY COMBINED (${selectedFormat.qualityLabel || selectedFormat.height + 'p'})`;
      }
      // Priority 3: Any combined format available
      else if (combinedFormats.length > 0) {
        selectedFormat = combinedFormats[0];
        selectionMethod = `BEST COMBINED (${selectedFormat.qualityLabel || selectedFormat.height + 'p'})`;
        
        // Show what the limitation is
        const maxHeight = Math.max(...combinedFormats.map(f => parseInt(f.height || '0')));
        console.log(`⚠️  QUALITY LIMITATION: YouTube only provides ${maxHeight}p combined video+audio for this video`);
        if (highQualityVideoOnly.length > 0) {
          const maxVideoHeight = Math.max(...highQualityVideoOnly.map(f => parseInt(f.height || '0')));
          console.log(`ℹ️   Higher quality (${maxVideoHeight}p) was available as video-only but merging failed`);
        }
      }
      // Priority 3: Try to use progressive download formats (often better quality)
      else {
        const progressiveFormats = info.formats.filter(f => 
          f.hasVideo && f.hasAudio && f.url && !f.url.includes('googlevideo.com/videoplayback')
        ).sort((a, b) => parseInt(b.height || '0') - parseInt(a.height || '0'));
        
        if (progressiveFormats.length > 0) {
          selectedFormat = progressiveFormats[0];
          selectionMethod = `PROGRESSIVE (${selectedFormat.qualityLabel || selectedFormat.height + 'p'})`;
        }
      }
      
      // Fallback: Use any video+audio format
      if (!selectedFormat) {
        const anyVideoAudio = info.formats.filter(f => f.hasVideo && f.hasAudio);
        if (anyVideoAudio.length > 0) {
          selectedFormat = anyVideoAudio[0];
          selectionMethod = `FALLBACK (${selectedFormat.qualityLabel || 'unknown'})`;
        }
      }
      
      if (!selectedFormat) {
        throw new Error('No suitable video formats found');
      }
      
      format = selectedFormat;
      console.log(`✅ SELECTED: ${selectionMethod}`);
      
      console.log('📹 SELECTED FORMAT:', {
        quality: format.qualityLabel || 'unknown',
        container: format.container || 'unknown',
        hasVideo: format.hasVideo,
        hasAudio: format.hasAudio,
        estimatedSize: format.contentLength ? (parseInt(format.contentLength) / 1024 / 1024).toFixed(1) + 'MB' : 'unknown'
      });
      
      // Create temporary file path
      const tempFilePath = join(tmpdir(), `youtube_${videoId}_${Date.now()}.mp4`);
      
      // Download video with robust error handling
      await new Promise<void>((resolve, reject) => {
        const downloadOptions: any = { 
          format: format,
          begin: 0,
          requestOptions: {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'video/mp4,video/webm,video/*;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'identity',
              'Range': 'bytes=0-'
            },
            maxRedirects: 10,
            timeout: 60000
          },
          // Try to get better quality streams
          quality: 'highest',
          filter: format => format.container === 'mp4'
        };
        
        let stream;
        let writeStream;
        let downloadStarted = false;
        let totalSize = 0;
        
        try {
          stream = ytdl(originalUrl, downloadOptions);
          writeStream = createWriteStream(tempFilePath);
          
          stream.pipe(writeStream);
          
          stream.on('info', (videoInfo, videoFormat) => {
            console.log('📡 Download stream initialized');
            totalSize = parseInt(videoFormat.contentLength || '0');
            if (totalSize > 0) {
              console.log(`📊 Video size: ${(totalSize / 1024 / 1024).toFixed(1)}MB`);
            }
          });
          
          stream.on('progress', (chunkLength, downloaded, total) => {
            downloadStarted = true;
            const percent = total > 0 ? (downloaded / total * 100).toFixed(1) : '0';
            console.log(`📥 DOWNLOAD PROGRESS: ${percent}% - ${(downloaded / 1024 / 1024).toFixed(1)}MB`);
          });
          
          stream.on('response', () => {
            console.log('📡 Download response received');
          });
          
          writeStream.on('finish', () => {
            console.log('✅ YOUTUBE VIDEO DOWNLOADED:', tempFilePath);
            resolve();
          });
          
          stream.on('error', (error) => {
            console.error('❌ Download stream error:', error.message);
            
            // Clean up streams
            if (writeStream && !writeStream.destroyed) {
              writeStream.destroy();
            }
            
            // Provide specific error handling for "Could not extract functions"
            if (error.message.includes('Could not extract functions')) {
              reject(new Error('YouTube video extraction failed - this video may have restricted access or requires different download methods. Please try a different video or use a direct video hosting service like Dropbox or Vimeo.'));
            } else {
              reject(new Error(`YouTube download failed: ${error.message}`));
            }
          });
          
          writeStream.on('error', (error) => {
            console.error('❌ Write stream error:', error.message);
            if (stream && !stream.destroyed) {
              stream.destroy();
            }
            reject(new Error(`File write failed: ${error.message}`));
          });
          
          // Extended timeout for larger videos
          setTimeout(() => {
            if (!downloadStarted) {
              console.log('⏱️ Download timeout - cleaning up streams');
              if (stream && !stream.destroyed) {
                stream.destroy();
              }
              if (writeStream && !writeStream.destroyed) {
                writeStream.destroy();
              }
              reject(new Error('Download timeout - video may be restricted, too large, or server is busy. Try a shorter video or different hosting service.'));
            }
          }, 60000); // Increased to 60 seconds
          
        } catch (initError) {
          console.error('❌ Stream initialization error:', initError);
          reject(new Error(`Failed to initialize download: ${initError.message}`));
        }
      });
      
      // Get file size
      const stats = statSync(tempFilePath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      console.log(`📊 DOWNLOADED FILE SIZE: ${fileSizeMB.toFixed(2)}MB`);
      
      return {
        filePath: tempFilePath,
        size: stats.size,
        contentType: 'video/mp4',
        verified: true,
        videoId,
        method: 'youtube_download',
        isValid: true,
        cleanup: () => {
          try {
            unlinkSync(tempFilePath);
            console.log('🗑️ TEMP FILE CLEANED:', tempFilePath);
          } catch (err) {
            console.log('⚠️ CLEANUP WARNING:', err);
          }
        }
      };
      
    } catch (error) {
      console.error('❌ YOUTUBE DOWNLOAD ERROR:', error);
      
      // Provide specific error messages for common issues
      let errorMessage = 'YouTube download failed';
      
      if (error instanceof Error) {
        if (error.message.includes('Could not extract functions')) {
          errorMessage = 'YouTube video extraction failed - this video may be restricted or require different access methods. Try using a different YouTube video or contact support for assistance.';
        } else if (error.message.includes('Video unavailable')) {
          errorMessage = 'YouTube video is unavailable - it may be private, deleted, or region-restricted';
        } else if (error.message.includes('Sign in to confirm')) {
          errorMessage = 'YouTube video requires age verification or sign-in - try a different video';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'YouTube download timed out - the video may be too large or server is busy';
        } else {
          errorMessage = `YouTube download failed: ${error.message}`;
        }
      }
      
      return {
        filePath: '',
        size: 0,
        contentType: 'video/mp4',
        verified: false,
        method: 'youtube_download',
        isValid: false,
        error: errorMessage,
        cleanup: () => {}
      };
    }
  }

  /**
   * Validate YouTube URL for download and Facebook upload
   */
  static async validateForFacebook(url: string): Promise<{
    isValid: boolean;
    videoId?: string;
    recommendations: string[];
    error?: string;
  }> {
    const recommendations: string[] = [];
    
    try {
      const videoId = this.extractVideoId(url);
      
      if (!videoId) {
        return {
          isValid: false,
          recommendations: [
            'Ensure the YouTube URL contains a valid video ID',
            'Try using standard YouTube URL format: youtube.com/watch?v=VIDEO_ID',
            'Check that the URL is not corrupted or truncated'
          ],
          error: 'Invalid YouTube URL format'
        };
      }

      // Check if video is accessible for download
      try {
        const info = await ytdl.getInfo(url);
        const formats = info.formats.filter(f => f.hasVideo && f.hasAudio);
        
        if (formats.length === 0) {
          return {
            isValid: false,
            recommendations: [
              'Video does not have downloadable formats',
              'Try a different YouTube video',
              'Ensure video is not age-restricted or private'
            ],
            error: 'No downloadable video formats available'
          };
        }

        recommendations.push('Video will be downloaded and uploaded as actual file to Facebook');
        recommendations.push('Supports large videos using Facebook resumable upload');
        recommendations.push('Works with both public and unlisted videos');
        recommendations.push('Note: Download time depends on video size and quality');

        return {
          isValid: true,
          videoId,
          recommendations
        };
      } catch (ytError) {
        return {
          isValid: false,
          recommendations: [
            'Video cannot be accessed for download',
            'Check if video is private, deleted, or region-restricted',
            'Try a different YouTube video URL'
          ],
          error: 'YouTube video access error: ' + (ytError instanceof Error ? ytError.message : 'Unknown error')
        };
      }

    } catch (error) {
      return {
        isValid: false,
        recommendations: [
          'Check your internet connection',
          'Verify the YouTube URL is accessible',
          'Ensure the video is not private'
        ],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate YouTube setup instructions
   */
  static getYouTubeInstructions(): string {
    return `YOUTUBE VIDEO DOWNLOAD FOR FACEBOOK UPLOAD:

1. **Upload to YouTube**:
   • Use any YouTube account (free works)
   • Upload your video file
   • Set privacy to "Public" or "Unlisted" (recommended)

2. **Get Video URL**:
   • Copy the YouTube video URL from address bar
   • Format: youtube.com/watch?v=VIDEO_ID
   • Or use short format: youtu.be/VIDEO_ID

3. **Privacy Settings**:
   • Public: Anyone can find and watch
   • Unlisted: Only people with link can access (recommended)
   • Both work for download and Facebook upload

4. **Supported Formats**:
   • youtube.com/watch?v=VIDEO_ID (standard)
   • youtu.be/VIDEO_ID (short link)
   • youtube.com/embed/VIDEO_ID (embed)

✅ ADVANTAGES:
• Video downloaded and uploaded as actual file to Facebook
• Uses Facebook resumable upload for large videos (up to 1.75GB)
• Maintains original video quality
• Works with any video format uploaded to YouTube
• Automatic cleanup of temporary files

⚡ PROCESSING NOTES:
• Download time varies based on video size and quality
• Large videos use Facebook's resumable upload method
• Videos appear as native Facebook uploads, not links`;
  }

  /**
   * Convert various YouTube URL formats to standard format
   */
  static normalizeUrl(url: string): string {
    const videoId = this.extractVideoId(url);
    if (videoId) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    return url;
  }
}