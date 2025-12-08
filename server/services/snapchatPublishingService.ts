import crypto from 'crypto';
import { readFileSync, statSync } from 'fs';
import { SnapchatOAuthService } from './snapchatOAuthService';

/**
 * Snapchat Publishing Service
 * Handles uploading media and publishing to Snapchat Stories/Spotlight
 * 
 * IMPORTANT: Snapchat requires AES-256-CBC encryption for media uploads
 */

interface MediaUploadResult {
  success: boolean;
  mediaId?: string;
  error?: string;
}

interface PublishResult {
  success: boolean;
  storyId?: string;
  spotlightId?: string;
  error?: string;
}

export class SnapchatPublishingService {
  private static readonly API_BASE_URL = 'https://businessapi.snapchat.com/v1';
  private static readonly CHUNK_SIZE = 32 * 1024 * 1024; // 32MB chunks for large files

  /**
   * Encrypt media file using AES-256-CBC (required by Snapchat)
   * Returns the encrypted data, key, and IV
   */
  private static encryptMedia(filePath: string): {
    encryptedData: Buffer;
    key: Buffer;
    iv: Buffer;
  } {
    const fileData = readFileSync(filePath);
    
    // Generate random 256-bit key and 128-bit IV
    const key = crypto.randomBytes(32); // 256 bits
    const iv = crypto.randomBytes(16);  // 128 bits
    
    // Create cipher and encrypt
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encryptedData = Buffer.concat([
      cipher.update(fileData),
      cipher.final()
    ]);
    
    return { encryptedData, key, iv };
  }

  /**
   * Upload media to Snapchat
   * Handles both small and large (chunked) uploads
   */
  static async uploadMedia(
    profileId: string,
    accessToken: string,
    filePath: string,
    mediaType: 'image' | 'video'
  ): Promise<MediaUploadResult> {
    try {
      console.log(`📤 Uploading ${mediaType} to Snapchat...`);
      
      const fileStats = statSync(filePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);
      
      console.log(`📊 File size: ${fileSizeMB.toFixed(2)}MB`);
      
      // Encrypt the media (required by Snapchat)
      console.log('🔐 Encrypting media...');
      const { encryptedData, key, iv } = this.encryptMedia(filePath);
      
      if (fileStats.size > this.CHUNK_SIZE) {
        // Use chunked upload for large files
        return await this.uploadLargeMedia(profileId, accessToken, encryptedData, key, iv, mediaType);
      } else {
        // Single upload for smaller files
        return await this.uploadSmallMedia(profileId, accessToken, encryptedData, key, iv, mediaType);
      }
    } catch (error) {
      console.error('❌ Snapchat media upload failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown upload error'
      };
    }
  }

  /**
   * Upload small media file (< 32MB)
   */
  private static async uploadSmallMedia(
    profileId: string,
    accessToken: string,
    encryptedData: Buffer,
    key: Buffer,
    iv: Buffer,
    mediaType: 'image' | 'video'
  ): Promise<MediaUploadResult> {
    const response = await fetch(
      `${this.API_BASE_URL}/public_profiles/${profileId}/media`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream',
          'X-Snap-Media-Type': mediaType === 'image' ? 'IMAGE' : 'VIDEO',
          'X-Snap-Media-Encryption-Type': 'AES256CBC',
          'X-Snap-Media-Encryption-Key': key.toString('base64'),
          'X-Snap-Media-Encryption-Iv': iv.toString('base64'),
        },
        body: encryptedData,
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Snapchat media upload response:', errorData);
      throw new Error(`Media upload failed: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('✅ Media uploaded successfully:', data.media?.media_id);
    
    return {
      success: true,
      mediaId: data.media?.media_id,
    };
  }

  /**
   * Upload large media file (> 32MB) using chunked upload
   */
  private static async uploadLargeMedia(
    profileId: string,
    accessToken: string,
    encryptedData: Buffer,
    key: Buffer,
    iv: Buffer,
    mediaType: 'image' | 'video'
  ): Promise<MediaUploadResult> {
    console.log('📦 Using chunked upload for large file...');
    
    // Step 1: Initialize chunked upload
    const initResponse = await fetch(
      `${this.API_BASE_URL}/public_profiles/${profileId}/media/chunked_upload`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_size: encryptedData.length,
          media_type: mediaType === 'image' ? 'IMAGE' : 'VIDEO',
          encryption_type: 'AES256CBC',
          encryption_key: key.toString('base64'),
          encryption_iv: iv.toString('base64'),
        }),
      }
    );

    if (!initResponse.ok) {
      const errorData = await initResponse.text();
      throw new Error(`Failed to initialize chunked upload: ${errorData}`);
    }

    const initData = await initResponse.json();
    const uploadId = initData.chunked_upload?.id;
    
    if (!uploadId) {
      throw new Error('No upload ID received from Snapchat');
    }

    // Step 2: Upload chunks
    let offset = 0;
    let chunkNumber = 1;
    const totalChunks = Math.ceil(encryptedData.length / this.CHUNK_SIZE);

    while (offset < encryptedData.length) {
      const chunk = encryptedData.subarray(offset, offset + this.CHUNK_SIZE);
      
      console.log(`📤 Uploading chunk ${chunkNumber}/${totalChunks}...`);
      
      const chunkResponse = await fetch(
        `${this.API_BASE_URL}/public_profiles/${profileId}/media/chunked_upload/${uploadId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes ${offset}-${offset + chunk.length - 1}/${encryptedData.length}`,
          },
          body: chunk,
        }
      );

      if (!chunkResponse.ok) {
        const errorData = await chunkResponse.text();
        throw new Error(`Failed to upload chunk ${chunkNumber}: ${errorData}`);
      }

      offset += this.CHUNK_SIZE;
      chunkNumber++;
    }

    // Step 3: Finalize upload
    const finalizeResponse = await fetch(
      `${this.API_BASE_URL}/public_profiles/${profileId}/media/chunked_upload/${uploadId}/complete`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!finalizeResponse.ok) {
      const errorData = await finalizeResponse.text();
      throw new Error(`Failed to finalize chunked upload: ${errorData}`);
    }

    const finalData = await finalizeResponse.json();
    console.log('✅ Chunked upload completed:', finalData.media?.media_id);

    return {
      success: true,
      mediaId: finalData.media?.media_id,
    };
  }

  /**
   * Publish a Story to Snapchat
   */
  static async publishStory(
    profileId: string,
    accessToken: string,
    mediaId: string,
    caption?: string
  ): Promise<PublishResult> {
    try {
      console.log('📱 Publishing Story to Snapchat...');
      
      const body: any = {
        media_id: mediaId,
      };
      
      if (caption) {
        body.caption = caption;
      }

      const response = await fetch(
        `${this.API_BASE_URL}/public_profiles/${profileId}/stories`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Snapchat story publish response:', errorData);
        throw new Error(`Failed to publish story: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      const storyId = data.stories?.[0]?.story?.id;
      
      console.log('✅ Story published successfully:', storyId);
      
      return {
        success: true,
        storyId,
      };
    } catch (error) {
      console.error('❌ Snapchat story publish failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown publish error'
      };
    }
  }

  /**
   * Publish to Spotlight (viral video feed)
   */
  static async publishSpotlight(
    profileId: string,
    accessToken: string,
    mediaId: string,
    caption?: string
  ): Promise<PublishResult> {
    try {
      console.log('🌟 Publishing to Snapchat Spotlight...');
      
      const body: any = {
        media_id: mediaId,
      };
      
      if (caption) {
        body.caption = caption;
      }

      const response = await fetch(
        `${this.API_BASE_URL}/public_profiles/${profileId}/spotlight`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Snapchat spotlight publish response:', errorData);
        throw new Error(`Failed to publish to spotlight: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      const spotlightId = data.spotlight?.[0]?.spotlight?.id;
      
      console.log('✅ Spotlight published successfully:', spotlightId);
      
      return {
        success: true,
        spotlightId,
      };
    } catch (error) {
      console.error('❌ Snapchat spotlight publish failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown publish error'
      };
    }
  }

  /**
   * Publish a Saved Story (permanent content on profile)
   */
  static async publishSavedStory(
    profileId: string,
    accessToken: string,
    mediaId: string,
    title: string,
    caption?: string
  ): Promise<PublishResult> {
    try {
      console.log('💾 Publishing Saved Story to Snapchat...');
      
      const body: any = {
        media_id: mediaId,
        title: title,
      };
      
      if (caption) {
        body.caption = caption;
      }

      const response = await fetch(
        `${this.API_BASE_URL}/public_profiles/${profileId}/saved_stories`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Snapchat saved story publish response:', errorData);
        throw new Error(`Failed to publish saved story: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      const storyId = data.saved_stories?.[0]?.saved_story?.id;
      
      console.log('✅ Saved Story published successfully:', storyId);
      
      return {
        success: true,
        storyId,
      };
    } catch (error) {
      console.error('❌ Snapchat saved story publish failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown publish error'
      };
    }
  }

  /**
   * Complete publish flow: download media, upload to Snapchat, and publish
   */
  static async publishPost(
    account: {
      id: number;
      profileId: string;
      accessToken: string;
      refreshToken: string | null;
      tokenExpiresAt: Date | null;
    },
    options: {
      mediaUrl: string;
      caption?: string;
      mediaType: 'image' | 'video';
      publishType: 'story' | 'spotlight' | 'saved_story';
      savedStoryTitle?: string;
    }
  ): Promise<PublishResult & { mediaId?: string }> {
    try {
      // Ensure valid token
      const accessToken = await SnapchatOAuthService.ensureValidToken(account as any);
      
      // Download media from URL
      console.log('📥 Downloading media for Snapchat...');
      const { InstagramMediaDownloader } = await import('./instagramMediaDownloader');
      const downloadResult = await InstagramMediaDownloader.downloadMedia(
        options.mediaUrl,
        options.mediaType
      );
      
      if (!downloadResult.success || !downloadResult.filePath) {
        return {
          success: false,
          error: `Failed to download media: ${downloadResult.error || 'Unknown error'}`
        };
      }

      // Upload to Snapchat
      const uploadResult = await this.uploadMedia(
        account.profileId,
        accessToken,
        downloadResult.filePath,
        options.mediaType
      );

      if (!uploadResult.success || !uploadResult.mediaId) {
        return {
          success: false,
          error: uploadResult.error || 'Failed to upload media to Snapchat'
        };
      }

      // Publish based on type
      let publishResult: PublishResult;
      
      switch (options.publishType) {
        case 'story':
          publishResult = await this.publishStory(
            account.profileId,
            accessToken,
            uploadResult.mediaId,
            options.caption
          );
          break;
        case 'spotlight':
          publishResult = await this.publishSpotlight(
            account.profileId,
            accessToken,
            uploadResult.mediaId,
            options.caption
          );
          break;
        case 'saved_story':
          if (!options.savedStoryTitle) {
            return {
              success: false,
              error: 'Saved story requires a title'
            };
          }
          publishResult = await this.publishSavedStory(
            account.profileId,
            accessToken,
            uploadResult.mediaId,
            options.savedStoryTitle,
            options.caption
          );
          break;
        default:
          publishResult = await this.publishStory(
            account.profileId,
            accessToken,
            uploadResult.mediaId,
            options.caption
          );
      }

      return {
        ...publishResult,
        mediaId: uploadResult.mediaId,
      };
    } catch (error) {
      console.error('❌ Snapchat publish flow failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get story/spotlight analytics
   */
  static async getStoryStats(
    profileId: string,
    accessToken: string,
    storyId: string
  ): Promise<{
    views?: number;
    shares?: number;
    screenshots?: number;
    error?: string;
  }> {
    try {
      const response = await fetch(
        `${this.API_BASE_URL}/public_profiles/${profileId}/stories/${storyId}/stats?assetType=STORY`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        return { error: `Failed to get stats: ${errorData}` };
      }

      const data = await response.json();
      
      return {
        views: data.stats?.views,
        shares: data.stats?.shares,
        screenshots: data.stats?.screenshots,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
