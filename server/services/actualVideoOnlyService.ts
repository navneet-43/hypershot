import { HootsuiteStyleFacebookService } from './hootsuiteStyleFacebookService';

export class ActualVideoOnlyService {
  
  static async uploadVideo(
    pageId: string,
    accessToken: string,
    videoUrl: string,
    description: string,
    customLabels: string[] = [],
    language: string = 'en'
  ): Promise<{ success: boolean; postId?: string; error?: string; type: string }> {
    
    console.log('Processing video for actual file upload only...');
    
    // YouTube videos - use existing robust system
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      return await this.processYouTubeVideo(pageId, accessToken, videoUrl, description, customLabels, language);
    }
    
    // Direct video URLs - process directly
    if (this.isDirectVideoUrl(videoUrl)) {
      return await this.processDirectVideo(pageId, accessToken, videoUrl, description, customLabels, language);
    }
    
    // Google Drive - use FFmpeg for large file downloads
    if (videoUrl.includes('drive.google.com')) {
      return await this.processGoogleDriveVideo(pageId, accessToken, videoUrl, description, customLabels, language);
    }
    
    // Other cloud storage - try direct processing
    return await this.processDirectVideo(pageId, accessToken, videoUrl, description, customLabels, language);
  }
  
  private static async processYouTubeVideo(
    pageId: string,
    accessToken: string,
    videoUrl: string,
    description: string,
    customLabels: string[],
    language: string
  ): Promise<{ success: boolean; postId?: string; error?: string; type: string }> {
    
    try {
      console.log('Processing YouTube video for actual file upload...');
      
      const result = await HootsuiteStyleFacebookService.publishVideoPost(
        pageId,
        accessToken,
        videoUrl,
        description,
        customLabels,
        language
      );
      
      if (result.success) {
        return { 
          success: true, 
          postId: result.postId, 
          type: 'youtube_video' 
        };
      } else {
        return { 
          success: false, 
          error: result.error, 
          type: 'youtube_failed' 
        };
      }
      
    } catch (error) {
      return { 
        success: false, 
        error: error.message, 
        type: 'youtube_error' 
      };
    }
  }
  
  private static async processDirectVideo(
    pageId: string,
    accessToken: string,
    videoUrl: string,
    description: string,
    customLabels: string[],
    language: string
  ): Promise<{ success: boolean; postId?: string; error?: string; type: string }> {
    
    try {
      console.log('Processing direct video URL for actual file upload...');
      
      const result = await HootsuiteStyleFacebookService.publishVideoPost(
        pageId,
        accessToken,
        videoUrl,
        description,
        customLabels,
        language
      );
      
      if (result.success) {
        return { 
          success: true, 
          postId: result.postId, 
          type: 'direct_video' 
        };
      } else {
        return { 
          success: false, 
          error: result.error, 
          type: 'direct_failed' 
        };
      }
      
    } catch (error) {
      return { 
        success: false, 
        error: error.message, 
        type: 'direct_error' 
      };
    }
  }
  
  private static async processGoogleDriveVideo(
    pageId: string,
    accessToken: string,
    videoUrl: string,
    description: string,
    customLabels: string[],
    language: string
  ): Promise<{ success: boolean; postId?: string; error?: string; type: string }> {
    
    try {
      console.log('Processing Google Drive video with FFmpeg...');
      
      const { FFmpegGoogleDriveService } = await import('./ffmpegGoogleDriveService');
      const result = await FFmpegGoogleDriveService.downloadAndUploadVideo(
        pageId,
        accessToken,
        videoUrl,
        description,
        customLabels,
        language
      );
      
      if (result.success) {
        return { 
          success: true, 
          postId: result.postId, 
          type: 'google_drive_video' 
        };
      } else {
        return { 
          success: false, 
          error: result.error, 
          type: 'google_drive_failed' 
        };
      }
      
    } catch (error) {
      return { 
        success: false, 
        error: error.message, 
        type: 'google_drive_error' 
      };
    }
  }
  
  private static isDirectVideoUrl(url: string): boolean {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];
    const lowerUrl = url.toLowerCase();
    
    return videoExtensions.some(ext => lowerUrl.includes(ext)) ||
           lowerUrl.includes('video') ||
           url.includes('dropbox') ||
           url.includes('onedrive') ||
           url.includes('mediafire');
  }
  
  static async createTestVideoPost(
    pageId: string,
    accessToken: string
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    
    // Create a working test video using YouTube (reliable actual video upload)
    const testVideoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Short test video
    
    return await this.uploadVideo(
      pageId,
      accessToken,
      testVideoUrl,
      'Test video upload - Actual video file demonstration',
      ['test-video', 'actual-upload'],
      'en'
    );
  }
}