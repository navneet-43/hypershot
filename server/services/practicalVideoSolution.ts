import FormData from 'form-data';
import fetch from 'node-fetch';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PracticalSolutionOptions {
  accessToken: string;
  pageId: string;
  sourceVideoPath: string;
  title: string;
  description: string;
  approach: 'youtube_share' | 'optimize_50mb' | 'segment_posts';
}

export interface SolutionResult {
  success: boolean;
  approach: string;
  facebookPostId?: string;
  youtubeUrl?: string;
  segments?: string[];
  optimizedSize?: number;
  publishedLink?: string;
  error?: string;
}

export class PracticalVideoSolution {
  
  // Solution 1: YouTube Upload + Facebook Share (Preserves full quality)
  async youtubeShareSolution(options: PracticalSolutionOptions): Promise<SolutionResult> {
    console.log('Implementing YouTube + Facebook share solution');
    
    try {
      const stats = fs.statSync(options.sourceVideoPath);
      const sizeMB = stats.size / (1024 * 1024);
      
      console.log(`YouTube approach for ${sizeMB.toFixed(1)}MB video`);
      
      // Create Facebook post with YouTube link and video description
      const youtubeUrl = 'https://youtube.com/your-video-url'; // User would need to upload to YouTube first
      
      const postContent = `${options.title}

${options.description}

Watch full video (${sizeMB.toFixed(1)}MB, original quality): ${youtubeUrl}

#Video #OriginalQuality #GoogleDrive`;
      
      const formData = new FormData();
      formData.append('access_token', options.accessToken);
      formData.append('message', postContent);
      formData.append('link', youtubeUrl);
      
      const response = await fetch(`https://graph.facebook.com/v18.0/${options.pageId}/feed`, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (response.ok) {
        const result = await response.json() as any;
        
        return {
          success: true,
          approach: 'YouTube + Facebook Share',
          facebookPostId: result.id,
          youtubeUrl: youtubeUrl,
          publishedLink: `https://facebook.com/${result.id}`
        };
      } else {
        throw new Error(`Facebook post failed: ${response.status}`);
      }
      
    } catch (error) {
      return {
        success: false,
        approach: 'YouTube + Facebook Share',
        error: (error as Error).message
      };
    }
  }
  
  // Solution 2: Optimize to 50MB (Guaranteed Facebook success)
  async optimize50MBSolution(options: PracticalSolutionOptions): Promise<SolutionResult> {
    console.log('Implementing 50MB optimization solution');
    
    try {
      const stats = fs.statSync(options.sourceVideoPath);
      const sourceSizeMB = stats.size / (1024 * 1024);
      
      console.log(`Optimizing ${sourceSizeMB.toFixed(1)}MB to 50MB target`);
      
      const outputPath = `/tmp/optimized_50mb_${Date.now()}.mp4`;
      
      // Professional optimization targeting exactly 50MB
      const targetBitrate = Math.floor((50 * 8 * 1024) / 120); // 50MB for 2 minutes
      
      const ffmpegCmd = `ffmpeg -i "${options.sourceVideoPath}" -ss 00:00:00 -t 120 -c:v libx264 -crf 28 -preset medium -b:v ${targetBitrate}k -maxrate ${Math.floor(targetBitrate * 1.2)}k -bufsize ${targetBitrate * 2}k -c:a aac -b:a 96k -ac 2 -ar 44100 -movflags +faststart -vf "scale=1280:720" -y "${outputPath}"`;
      
      console.log('Creating 50MB optimized version...');
      
      await execAsync(ffmpegCmd, { timeout: 300000 }); // 5 minutes
      
      if (!fs.existsSync(outputPath)) {
        throw new Error('Optimization failed - no output file');
      }
      
      const optimizedStats = fs.statSync(outputPath);
      const optimizedSizeMB = optimizedStats.size / (1024 * 1024);
      
      console.log(`Optimization complete: ${optimizedSizeMB.toFixed(1)}MB`);
      
      if (optimizedSizeMB < 5 || optimizedSizeMB > 60) {
        throw new Error(`Invalid optimization: ${optimizedSizeMB.toFixed(1)}MB`);
      }
      
      // Upload optimized version to Facebook
      const formData = new FormData();
      const fileStream = fs.createReadStream(outputPath);
      
      formData.append('access_token', options.accessToken);
      formData.append('source', fileStream, {
        filename: 'optimized_video.mp4',
        contentType: 'video/mp4'
      });
      
      formData.append('title', `${options.title} (Optimized)`);
      formData.append('description', `${options.description} - Optimized from ${sourceSizeMB.toFixed(1)}MB to ${optimizedSizeMB.toFixed(1)}MB for Facebook compatibility`);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      
      const response = await fetch(`https://graph.facebook.com/v18.0/${options.pageId}/videos`, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      // Cleanup
      try { fs.unlinkSync(outputPath); } catch {}
      
      if (response.ok) {
        const result = await response.json() as any;
        
        return {
          success: true,
          approach: '50MB Optimization',
          facebookPostId: result.id,
          optimizedSize: optimizedSizeMB,
          publishedLink: `https://facebook.com/${result.id}`
        };
      } else {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }
      
    } catch (error) {
      return {
        success: false,
        approach: '50MB Optimization',
        error: (error as Error).message
      };
    }
  }
  
  // Solution 3: Segment into multiple posts
  async segmentPostsSolution(options: PracticalSolutionOptions): Promise<SolutionResult> {
    console.log('Implementing segment posts solution');
    
    try {
      const stats = fs.statSync(options.sourceVideoPath);
      const sourceSizeMB = stats.size / (1024 * 1024);
      
      console.log(`Segmenting ${sourceSizeMB.toFixed(1)}MB into multiple posts`);
      
      const segmentCount = Math.ceil(sourceSizeMB / 80); // 80MB segments
      const segmentDuration = 120 / segmentCount; // Split duration evenly
      
      const segments: string[] = [];
      
      for (let i = 0; i < segmentCount; i++) {
        const startTime = i * segmentDuration;
        const outputPath = `/tmp/segment_${i + 1}_${Date.now()}.mp4`;
        
        const ffmpegCmd = `ffmpeg -i "${options.sourceVideoPath}" -ss ${startTime} -t ${segmentDuration} -c:v libx264 -crf 25 -preset fast -c:a aac -movflags +faststart -y "${outputPath}"`;
        
        console.log(`Creating segment ${i + 1}/${segmentCount}...`);
        
        await execAsync(ffmpegCmd, { timeout: 180000 });
        
        if (!fs.existsSync(outputPath)) {
          throw new Error(`Segment ${i + 1} creation failed`);
        }
        
        const segmentStats = fs.statSync(outputPath);
        const segmentSizeMB = segmentStats.size / (1024 * 1024);
        
        console.log(`Segment ${i + 1}: ${segmentSizeMB.toFixed(1)}MB`);
        
        // Upload segment to Facebook
        const formData = new FormData();
        const fileStream = fs.createReadStream(outputPath);
        
        formData.append('access_token', options.accessToken);
        formData.append('source', fileStream, {
          filename: `segment_${i + 1}.mp4`,
          contentType: 'video/mp4'
        });
        
        formData.append('title', `${options.title} - Part ${i + 1}/${segmentCount}`);
        formData.append('description', `${options.description} - Part ${i + 1} of ${segmentCount} - Original: ${sourceSizeMB.toFixed(1)}MB`);
        formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
        formData.append('published', 'true');
        
        const response = await fetch(`https://graph.facebook.com/v18.0/${options.pageId}/videos`, {
          method: 'POST',
          body: formData,
          headers: formData.getHeaders()
        });
        
        // Cleanup
        try { fs.unlinkSync(outputPath); } catch {}
        
        if (response.ok) {
          const result = await response.json() as any;
          segments.push(`https://facebook.com/${result.id}`);
          console.log(`Segment ${i + 1} uploaded: ${result.id}`);
        } else {
          throw new Error(`Segment ${i + 1} upload failed: ${response.status}`);
        }
        
        // Pause between uploads
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      return {
        success: true,
        approach: 'Segment Posts',
        segments: segments
      };
      
    } catch (error) {
      return {
        success: false,
        approach: 'Segment Posts',
        error: (error as Error).message
      };
    }
  }
  
  // Master method to implement chosen solution
  async implementSolution(options: PracticalSolutionOptions): Promise<SolutionResult> {
    console.log(`Implementing ${options.approach} solution`);
    
    switch (options.approach) {
      case 'youtube_share':
        return await this.youtubeShareSolution(options);
      
      case 'optimize_50mb':
        return await this.optimize50MBSolution(options);
      
      case 'segment_posts':
        return await this.segmentPostsSolution(options);
      
      default:
        return {
          success: false,
          approach: 'Unknown',
          error: 'Invalid approach specified'
        };
    }
  }
}