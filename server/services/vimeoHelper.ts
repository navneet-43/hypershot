import fetch from 'node-fetch';

/**
 * Vimeo video access helper
 * Handles Vimeo URLs and provides direct video access for Facebook uploads
 */
export class VimeoHelper {
  
  /**
   * Check if URL is a Vimeo link
   */
  static isVimeoUrl(url: string): boolean {
    return url.includes('vimeo.com') || url.includes('player.vimeo.com');
  }

  /**
   * Extract Vimeo video ID from various URL formats
   */
  static extractVideoId(url: string): string | null {
    // Handle various Vimeo URL formats
    const patterns = [
      /vimeo\.com\/(\d+)/,                    // https://vimeo.com/123456789
      /vimeo\.com\/video\/(\d+)/,             // https://vimeo.com/video/123456789
      /player\.vimeo\.com\/video\/(\d+)/,     // https://player.vimeo.com/video/123456789
      /vimeo\.com\/channels\/[^\/]+\/(\d+)/,  // https://vimeo.com/channels/staffpicks/123456789
      /vimeo\.com\/groups\/[^\/]+\/videos\/(\d+)/, // https://vimeo.com/groups/shortfilms/videos/123456789
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
   * Get Vimeo video information using oEmbed API (no auth required)
   */
  static async getVideoInfo(videoId: string): Promise<{
    success: boolean;
    title?: string;
    duration?: number;
    width?: number;
    height?: number;
    thumbnailUrl?: string;
    embedUrl?: string;
    error?: string;
  }> {
    try {
      const oembedUrl = `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`;
      
      const response = await fetch(oembedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FacebookBot/1.0)'
        }
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch video info: ${response.status} ${response.statusText}`
        };
      }

      const data = await response.json() as any;

      return {
        success: true,
        title: data.title,
        duration: data.duration,
        width: data.width,
        height: data.height,
        thumbnailUrl: data.thumbnail_url,
        embedUrl: data.html ? this.extractEmbedUrl(data.html) : undefined
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extract embed URL from Vimeo oEmbed HTML response
   */
  private static extractEmbedUrl(html: string): string | undefined {
    const match = html.match(/src="([^"]+)"/);
    return match ? match[1] : undefined;
  }

  /**
   * Attempt to get direct video URL from Vimeo
   * Note: This requires the video to have download enabled by the owner
   */
  static async getDirectVideoUrl(videoId: string): Promise<{
    success: boolean;
    directUrl?: string;
    qualities?: Array<{quality: string, url: string, size?: number}>;
    error?: string;
    requiresAuth?: boolean;
  }> {
    try {
      // Method 1: Try Vimeo's oembed with additional parameters
      const oembedUrl = `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}&width=640&height=360`;
      
      const oembedResponse = await fetch(oembedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FacebookBot/1.0)'
        }
      });

      if (oembedResponse.ok) {
        const oembedData = await oembedResponse.json() as any;
        
        // Check if we can extract a direct video URL from the oembed response
        if (oembedData.video_id) {
          // Method 2: Try the player config endpoint
          const configUrl = `https://player.vimeo.com/video/${videoId}/config`;
          
          try {
            const configResponse = await fetch(configUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; FacebookBot/1.0)',
                'Referer': `https://vimeo.com/${videoId}`,
                'Accept': 'application/json'
              }
            });

            if (configResponse.ok) {
              const configData = await configResponse.json() as any;

              // Extract progressive video files
              const progressiveFiles = configData?.request?.files?.progressive;
              const dashFiles = configData?.request?.files?.dash?.streams;
              const hlsFiles = configData?.request?.files?.hls?.cdns;
              
              if (progressiveFiles && Array.isArray(progressiveFiles) && progressiveFiles.length > 0) {
                const qualities = progressiveFiles.map((file: any) => ({
                  quality: file.quality || 'unknown',
                  url: file.url,
                  size: file.size
                }));

                // Get the best quality version available
                const bestQuality = progressiveFiles.reduce((best: any, current: any) => {
                  const currentHeight = parseInt(current.quality?.replace('p', '') || '0');
                  const bestHeight = parseInt(best.quality?.replace('p', '') || '0');
                  return currentHeight > bestHeight ? current : best;
                });

                return {
                  success: true,
                  directUrl: bestQuality.url,
                  qualities
                };
              }

              // Try HLS streams as fallback
              if (hlsFiles && Object.keys(hlsFiles).length > 0) {
                const hlsUrl = Object.values(hlsFiles)[0] as any;
                if (hlsUrl?.url) {
                  return {
                    success: true,
                    directUrl: hlsUrl.url,
                    qualities: [{ quality: 'hls', url: hlsUrl.url }]
                  };
                }
              }
            }
          } catch (configError) {
            console.log('Config endpoint failed, trying alternative method...');
          }
        }
      }

      // Method 3: Try direct download endpoint if available
      const downloadUrl = `https://vimeo.com/${videoId}/download`;
      try {
        const downloadResponse = await fetch(downloadUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FacebookBot/1.0)'
          }
        });

        if (downloadResponse.ok) {
          const location = downloadResponse.headers.get('location');
          if (location) {
            return {
              success: true,
              directUrl: location,
              qualities: [{ quality: 'download', url: location }]
            };
          }
        }
      } catch (downloadError) {
        console.log('Download endpoint not available');
      }

      return {
        success: false,
        error: 'Direct video access not available - video owner may need to enable download permissions',
        requiresAuth: false
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to access Vimeo video',
        requiresAuth: true
      };
    }
  }

  /**
   * Get optimized Vimeo URL for Facebook video upload
   */
  static async getOptimizedVideoUrl(originalUrl: string): Promise<{
    workingUrl: string;
    size: number;
    contentType: string | null;
    verified: boolean;
    embedUrl?: string;
    videoInfo?: any;
    method: 'direct' | 'embed' | 'fallback';
    error?: string;
  }> {
    console.log('🎬 OPTIMIZING VIMEO URL for video access');
    
    const videoId = this.extractVideoId(originalUrl);
    
    if (!videoId) {
      console.log('❌ Could not extract Vimeo video ID');
      return {
        workingUrl: originalUrl,
        size: 0,
        contentType: null,
        verified: false,
        method: 'fallback',
        error: 'Could not extract video ID from Vimeo URL'
      };
    }

    console.log('🔍 VIMEO VIDEO ID:', videoId);

    // Get video information first
    const videoInfo = await this.getVideoInfo(videoId);
    
    if (!videoInfo.success) {
      console.log('⚠️ Failed to get Vimeo video info:', videoInfo.error);
      return {
        workingUrl: originalUrl,
        size: 0,
        contentType: null,
        verified: false,
        method: 'fallback',
        error: `Video info unavailable: ${videoInfo.error}`
      };
    }

    console.log('✅ VIMEO VIDEO INFO OBTAINED:', {
      title: videoInfo.title,
      duration: videoInfo.duration,
      resolution: `${videoInfo.width}x${videoInfo.height}`
    });

    // Try to get direct video URL
    const directResult = await this.getDirectVideoUrl(videoId);
    
    if (directResult.success && directResult.directUrl) {
      console.log('✅ VIMEO DIRECT URL FOUND:', directResult.directUrl);
      
      // Test the direct URL to verify it's actually a video file
      try {
        const testResponse = await fetch(directResult.directUrl, { 
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FacebookBot/1.0)'
          }
        });
        
        const contentLength = testResponse.headers.get('content-length');
        const contentType = testResponse.headers.get('content-type');
        
        // Ensure it's actually a video content type
        if (contentType && contentType.startsWith('video/')) {
          console.log('✅ VERIFIED VIMEO DIRECT VIDEO URL');
          return {
            workingUrl: directResult.directUrl,
            size: contentLength ? parseInt(contentLength, 10) : 0,
            contentType,
            verified: testResponse.ok,
            embedUrl: videoInfo.embedUrl,
            videoInfo,
            method: 'direct'
          };
        } else {
          console.log('⚠️ Direct URL content type not video:', contentType);
        }
      } catch (error) {
        console.log('⚠️ Direct URL test failed:', error);
      }
    } else {
      console.log('⚠️ Could not get direct Vimeo URL:', directResult.error);
    }

    // Since direct video access failed, return with clear guidance
    console.log('❌ VIMEO DIRECT ACCESS UNAVAILABLE');
    
    return {
      workingUrl: originalUrl,
      size: 0,
      contentType: 'text/html',
      verified: false,
      embedUrl: videoInfo.embedUrl,
      videoInfo,
      method: 'fallback',
      error: 'Direct video access not available - video owner needs to enable download permissions'
    };
  }

  /**
   * Check if Vimeo video is suitable for Facebook upload
   */
  static async validateForFacebook(videoId: string): Promise<{
    isValid: boolean;
    hasDirectDownload: boolean;
    estimatedSize?: number;
    estimatedDuration?: number;
    resolution?: string;
    recommendations: string[];
    error?: string;
  }> {
    const recommendations: string[] = [];
    
    try {
      const videoInfo = await this.getVideoInfo(videoId);
      
      if (!videoInfo.success) {
        return {
          isValid: false,
          hasDirectDownload: false,
          recommendations: [
            'Ensure the Vimeo video is public or unlisted',
            'Check that the video exists and is accessible',
            'Try using a different Vimeo video for testing'
          ],
          error: videoInfo.error
        };
      }

      const directResult = await this.getDirectVideoUrl(videoId);
      const hasDirectDownload = directResult.success;

      // Analyze video specifications
      if (videoInfo.duration && videoInfo.duration > 20 * 60) {
        recommendations.push('Video duration over 20 minutes - consider using resumable upload');
      }

      if (videoInfo.width && videoInfo.height) {
        const aspectRatio = videoInfo.width / videoInfo.height;
        const resolution = `${videoInfo.width}x${videoInfo.height}`;
        
        recommendations.push(`Resolution: ${resolution} (${aspectRatio > 1 ? 'Landscape' : aspectRatio < 1 ? 'Portrait' : 'Square'})`);
        
        if (videoInfo.width < 540 || videoInfo.height < 540) {
          recommendations.push('Consider using higher resolution video (minimum 540p recommended)');
        }
      }

      if (!hasDirectDownload) {
        recommendations.push('Video owner needs to enable download permissions for direct upload');
        recommendations.push('Alternative: Use embed approach or ask owner to enable downloads');
      }

      return {
        isValid: true,
        hasDirectDownload,
        estimatedDuration: videoInfo.duration,
        resolution: videoInfo.width && videoInfo.height ? `${videoInfo.width}x${videoInfo.height}` : undefined,
        recommendations
      };

    } catch (error) {
      return {
        isValid: false,
        hasDirectDownload: false,
        recommendations: [
          'Check your internet connection',
          'Verify the Vimeo video URL is correct',
          'Ensure the video is publicly accessible'
        ],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate Vimeo setup instructions
   */
  static getVimeoInstructions(): string {
    return `VIMEO VIDEO SETUP FOR FACEBOOK:

1. **Upload to Vimeo**:
   • Create free Vimeo account
   • Upload your video file
   • Set privacy to "Public" or "Unlisted"

2. **Enable Downloads** (Important):
   • Go to video settings
   • Under "Privacy" → Enable "Allow downloads"
   • This enables direct video URL access

3. **Get Video URL**:
   • Copy the Vimeo video URL (vimeo.com/123456789)
   • Paste directly in your post form
   • System will automatically detect and optimize

4. **Supported Formats**:
   • vimeo.com/123456789 (direct video)
   • player.vimeo.com/video/123456789 (embed)
   • vimeo.com/channels/name/123456789 (channel)

✅ ADVANTAGES:
• Better programmatic access than Google Drive/Dropbox
• Professional video hosting with good compression
• Reliable direct download URLs when enabled
• No file size limits for free accounts
• Works well with Facebook's upload requirements

⚠️ REQUIREMENTS:
• Video owner must enable download permissions
• Video must be public or unlisted
• Direct URLs work better than embed URLs for Facebook`;
  }
}