import fetch from 'node-fetch';
import { createReadStream, existsSync } from 'fs';
import FormData from 'form-data';

interface InstagramBusinessAccount {
  id: string;
  username: string;
  profile_picture_url?: string;
  followers_count?: number;
}

interface MediaContainerResult {
  success: boolean;
  containerId?: string;
  error?: string;
}

interface PublishResult {
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * Instagram Service - Handles Instagram Business Account publishing via Meta Graph API
 * 
 * Requirements:
 * - Instagram Business or Creator Account
 * - Connected to a Facebook Page
 * - Permissions: instagram_basic, instagram_content_publish
 */
export class InstagramService {
  
  private static readonly GRAPH_API_VERSION = 'v21.0';
  private static readonly GRAPH_API_BASE = `https://graph.facebook.com/${this.GRAPH_API_VERSION}`;

  /**
   * Get Instagram Business Accounts connected to Facebook Pages
   */
  static async getInstagramAccountsFromPages(pageAccessToken: string): Promise<{
    success: boolean;
    accounts?: InstagramBusinessAccount[];
    error?: string;
  }> {
    try {
      // Get Instagram Business Account from Facebook Page
      const response = await fetch(
        `${this.GRAPH_API_BASE}/me/accounts?fields=instagram_business_account{id,username,profile_picture_url,followers_count}&access_token=${pageAccessToken}`
      );

      const data = await response.json() as any;

      if (!response.ok || data.error) {
        return {
          success: false,
          error: data.error?.message || 'Failed to fetch Instagram accounts'
        };
      }

      const accounts: InstagramBusinessAccount[] = [];
      
      if (data.data) {
        for (const page of data.data) {
          if (page.instagram_business_account) {
            accounts.push({
              id: page.instagram_business_account.id,
              username: page.instagram_business_account.username,
              profile_picture_url: page.instagram_business_account.profile_picture_url,
              followers_count: page.instagram_business_account.followers_count
            });
          }
        }
      }

      return {
        success: true,
        accounts
      };
    } catch (error) {
      console.error('Error fetching Instagram accounts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Step 1: Create media container
   * This prepares the media for publishing
   */
  static async createMediaContainer(
    igUserId: string,
    accessToken: string,
    options: {
      imageUrl?: string;
      videoUrl?: string;
      caption?: string;
      mediaType?: 'IMAGE' | 'VIDEO' | 'REELS' | 'CAROUSEL_ALBUM' | 'STORIES';
      coverUrl?: string; // For videos
      children?: string[]; // For carousels (container IDs)
    }
  ): Promise<MediaContainerResult> {
    try {
      console.log('📋 Instagram createMediaContainer called with options:', {
        hasImageUrl: !!options.imageUrl,
        hasVideoUrl: !!options.videoUrl,
        mediaType: options.mediaType,
        imageUrlPreview: options.imageUrl ? options.imageUrl.substring(0, 100) + '...' : undefined,
        videoUrlPreview: options.videoUrl ? options.videoUrl.substring(0, 100) + '...' : undefined
      });
      
      const params = new URLSearchParams({
        access_token: accessToken
      });

      // Add caption if provided
      if (options.caption) {
        params.append('caption', options.caption);
      }

      // Handle different media types
      if (options.mediaType === 'REELS') {
        if (!options.videoUrl) {
          return { success: false, error: 'Video URL required for Reels' };
        }
        params.append('media_type', 'REELS');
        params.append('video_url', options.videoUrl);
        if (options.coverUrl) {
          params.append('cover_url', options.coverUrl);
        }
      } else if (options.mediaType === 'STORIES') {
        params.append('media_type', 'STORIES');
        if (options.imageUrl) {
          params.append('image_url', options.imageUrl);
        } else if (options.videoUrl) {
          params.append('video_url', options.videoUrl);
        }
      } else if (options.mediaType === 'CAROUSEL_ALBUM') {
        if (!options.children || options.children.length === 0) {
          return { success: false, error: 'Children containers required for carousel' };
        }
        params.append('media_type', 'CAROUSEL');
        params.append('children', options.children.join(','));
      } else {
        // Single image or video
        if (options.imageUrl) {
          params.append('image_url', options.imageUrl);
        } else if (options.videoUrl) {
          // Instagram API REQUIRES media_type=REELS for ALL videos (regular videos and reels)
          // media_type=VIDEO is deprecated per Instagram API documentation
          params.append('media_type', 'REELS');
          params.append('video_url', options.videoUrl);
          if (options.coverUrl) {
            params.append('cover_url', options.coverUrl);
          }
        } else {
          return { success: false, error: 'Either image_url or video_url is required' };
        }
      }

      // Log the actual params being sent
      console.log('📤 Sending to Instagram API:', {
        url: `${this.GRAPH_API_BASE}/${igUserId}/media`,
        params: Object.fromEntries(params.entries())
      });
      
      const response = await fetch(
        `${this.GRAPH_API_BASE}/${igUserId}/media`,
        {
          method: 'POST',
          body: params
        }
      );

      const data = await response.json() as any;

      if (!response.ok || data.error) {
        console.error('❌ Instagram container creation failed:', data.error);
        console.error('📉 Failed params were:', Object.fromEntries(params.entries()));
        return {
          success: false,
          error: data.error?.message || 'Failed to create media container'
        };
      }

      console.log('✅ Instagram media container created:', data.id);
      
      return {
        success: true,
        containerId: data.id
      };
    } catch (error) {
      console.error('Error creating Instagram media container:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Step 2: Publish media container
   * This actually publishes the post to Instagram
   */
  static async publishMediaContainer(
    igUserId: string,
    containerId: string,
    accessToken: string
  ): Promise<PublishResult> {
    try {
      const params = new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken
      });

      const response = await fetch(
        `${this.GRAPH_API_BASE}/${igUserId}/media_publish`,
        {
          method: 'POST',
          body: params
        }
      );

      const data = await response.json() as any;

      if (!response.ok || data.error) {
        console.error('❌ Instagram publish failed:', data.error);
        return {
          success: false,
          error: data.error?.message || 'Failed to publish media'
        };
      }

      console.log('✅ Instagram post published:', data.id);
      
      return {
        success: true,
        postId: data.id
      };
    } catch (error) {
      console.error('Error publishing Instagram media:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check media container status
   * Important for videos - must wait for processing before publishing
   */
  static async checkContainerStatus(
    containerId: string,
    accessToken: string
  ): Promise<{ ready: boolean; statusCode?: string; error?: string; errorDetails?: any }> {
    try {
      const response = await fetch(
        `${this.GRAPH_API_BASE}/${containerId}?fields=status_code,status&access_token=${accessToken}`
      );

      const data = await response.json() as any;

      if (!response.ok || data.error) {
        console.error('❌ Status check failed:', data.error);
        return {
          ready: false,
          error: data.error?.message || 'Failed to check status',
          errorDetails: data.error
        };
      }

      console.log('📊 Container status:', { 
        containerId: containerId.substring(0, 20) + '...', 
        status_code: data.status_code,
        status: data.status 
      });

      // Status codes: FINISHED, IN_PROGRESS, ERROR
      return {
        ready: data.status_code === 'FINISHED',
        statusCode: data.status_code,
        errorDetails: data.status_code === 'ERROR' ? data : undefined
      };
    } catch (error) {
      console.error('❌ Exception checking container status:', error);
      return {
        ready: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Upload local file to Instagram (requires hosting the file temporarily)
   * Returns a publicly accessible URL for the file
   */
  static getPublicUrlForFile(filePath: string, mediaType: 'image' | 'video'): string {
    // Extract filename from path
    const filename = filePath.split('/').pop() || 'media';
    
    // Check if running in Replit or locally
    const replitDomain = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN;
    
    if (replitDomain) {
      // Use Replit's domain to serve the file
      const protocol = 'https';
      console.log(`🌐 Using Replit public URL: ${protocol}://${replitDomain}/temp-media/${filename}`);
      return `${protocol}://${replitDomain}/temp-media/${filename}`;
    } else {
      // For local development, use temp-media endpoint (will be uploaded to Cloudinary separately)
      const port = process.env.PORT || 3000;
      console.log(`🌐 Local development - file will be uploaded to Cloudinary: ${filePath}`);
      return `http://localhost:${port}/temp-media/${filename}`;
    }
  }

  /**
   * Upload local file to Cloudinary and return public URL
   */
  static async uploadToCloudinary(filePath: string, mediaType: 'image' | 'video'): Promise<string | null> {
    try {
      const fs = await import('fs');
      const cloudinary = (await import('../utils/cloudinary')).default;
      
      if (!fs.existsSync(filePath)) {
        console.error('❌ File not found for Cloudinary upload:', filePath);
        return null;
      }

      console.log(`☁️ Uploading to Cloudinary: ${filePath}`);
      
      const resourceType = mediaType === 'video' ? 'video' : 'image';
      const result = await cloudinary.uploader.upload(filePath, {
        resource_type: resourceType,
        folder: 'instagram_posts',
      });

      console.log(`✅ Cloudinary upload complete: ${result.secure_url}`);
      return result.secure_url;
    } catch (error) {
      console.error('❌ Cloudinary upload failed:', error);
      return null;
    }
  }

  /**
   * Complete publishing flow with automatic status checking for videos
   */
  static async publishPost(
    igUserId: string,
    accessToken: string,
    options: {
      imageUrl?: string;
      videoUrl?: string;
      caption?: string;
      mediaType?: 'IMAGE' | 'VIDEO' | 'REELS' | 'CAROUSEL_ALBUM' | 'STORIES';
      coverUrl?: string;
      children?: string[];
    }
  ): Promise<PublishResult> {
    // Step 1: Create media container
    const containerResult = await this.createMediaContainer(igUserId, accessToken, options);
    
    if (!containerResult.success || !containerResult.containerId) {
      return {
        success: false,
        error: containerResult.error || 'Failed to create container'
      };
    }

    // Step 2: Wait for processing (especially for videos)
    if (options.videoUrl || options.mediaType === 'REELS') {
      console.log('⏳ Waiting for Instagram video processing (up to 20 minutes for large videos)...');
      
      let attempts = 0;
      const maxAttempts = 240; // 240 attempts × 5 seconds = 20 minutes total
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds per check
        
        const statusCheck = await this.checkContainerStatus(containerResult.containerId, accessToken);
        
        if (statusCheck.ready) {
          console.log('✅ Video processing complete');
          break;
        }
        
        if (statusCheck.statusCode === 'ERROR') {
          console.error('❌ Instagram video processing ERROR:', statusCheck.errorDetails);
          const errorMsg = statusCheck.errorDetails?.status 
            ? `Video processing failed: ${statusCheck.errorDetails.status}` 
            : 'Video processing failed on Instagram servers';
          return {
            success: false,
            error: errorMsg
          };
        }
        
        attempts++;
        if (attempts % 12 === 0) {
          const minutesElapsed = Math.floor((attempts * 5) / 60);
          const secondsElapsed = (attempts * 5) % 60;
          console.log(`⏳ Still processing... (${minutesElapsed}m ${secondsElapsed}s elapsed, max 20 minutes)`);
        }
      }
      
      if (attempts >= maxAttempts) {
        return {
          success: false,
          error: 'Video processing timeout after 20 minutes - Instagram may need more time for very large videos. Please try again later or use a smaller video file.'
        };
      }
      
      // Additional safety buffer after processing completes
      console.log('⏳ Adding 10-second safety buffer before publishing...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    } else {
      // For images, wait a short time
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Step 3: Publish
    return await this.publishMediaContainer(igUserId, containerResult.containerId, accessToken);
  }

  /**
   * Get Instagram insights/analytics
   */
  static async getInsights(
    igUserId: string,
    accessToken: string,
    metrics: string[] = ['impressions', 'reach', 'engagement']
  ): Promise<any> {
    try {
      const response = await fetch(
        `${this.GRAPH_API_BASE}/${igUserId}/insights?metric=${metrics.join(',')}&period=day&access_token=${accessToken}`
      );

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching Instagram insights:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
