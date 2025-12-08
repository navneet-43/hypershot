import fetch from 'node-fetch';

/**
 * Facebook Graph API Video Validator
 * Validates videos against Facebook's specific requirements and limitations
 */
export class FacebookVideoValidator {
  
  // Facebook Graph API Video Requirements
  static readonly REQUIREMENTS = {
    // Size and Duration Limits
    URL_UPLOAD_MAX_SIZE: 1 * 1024 * 1024 * 1024, // 1 GB for URL uploads
    RESUMABLE_MAX_SIZE: 1.75 * 1024 * 1024 * 1024, // 1.75 GB for resumable uploads
    MARKETING_API_MAX_SIZE: 10 * 1024 * 1024 * 1024, // 10 GB for Marketing API
    
    // Duration Limits
    URL_UPLOAD_MAX_DURATION: 20 * 60, // 20 minutes for URL uploads
    RESUMABLE_MAX_DURATION: 45 * 60, // 45 minutes for resumable uploads
    RECOMMENDED_MIN_DURATION: 3, // 3 seconds minimum
    RECOMMENDED_MAX_DURATION: 90, // 90 seconds for optimal engagement
    REELS_MAX_DURATION: 60, // 60 seconds for Reels
    
    // Resolution Requirements
    RECOMMENDED_RESOLUTION: { width: 1080, height: 1920 }, // Portrait
    MIN_RESOLUTION: { width: 540, height: 960 },
    
    // Frame Rate
    MIN_FRAME_RATE: 24,
    MAX_FRAME_RATE: 60,
    
    // Aspect Ratios (width:height)
    ASPECT_RATIOS: {
      LANDSCAPE: 16/9,
      SQUARE: 1/1,
      PORTRAIT: 9/16
    },
    
    // Bitrate Recommendations
    BITRATE_720P: 5, // Mbps
    BITRATE_1080P: 8, // Mbps
    
    // Supported Formats
    SUPPORTED_VIDEO_CODECS: ['H.264', 'H.265'],
    SUPPORTED_AUDIO_CODECS: ['AAC'],
    SUPPORTED_CONTAINERS: ['MP4', 'MOV']
  };

  /**
   * Validate video against Facebook Graph API requirements
   */
  static async validateForFacebook(videoUrl: string): Promise<{
    isValid: boolean;
    uploadMethod: 'file_url' | 'resumable' | 'rejected' | 'youtube_native';
    violations: string[];
    recommendations: string[];
    fileSize: number;
    estimatedDuration?: number;
    detectedFormat?: string;
  }> {
    console.log('🔍 VALIDATING VIDEO FOR FACEBOOK GRAPH API:', videoUrl);
    
    // Handle YouTube URLs with access limitation support
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      console.log('🎥 YOUTUBE URL DETECTED - Checking access status');
      
      const { YouTubeHelper } = await import('./youtubeHelper');
      const videoId = YouTubeHelper.extractVideoId(videoUrl);
      
      if (!videoId) {
        return {
          isValid: false,
          uploadMethod: 'rejected',
          violations: ['Invalid YouTube URL format'],
          recommendations: [
            'Use standard YouTube URL format: youtube.com/watch?v=VIDEO_ID',
            'Ensure the URL contains a valid video ID'
          ],
          fileSize: 0
        };
      }
      
      // Always pass validation for YouTube URLs - let the publishing service handle access issues
      console.log('✅ YOUTUBE VALIDATION PASSED - Will handle access limitations during publishing');
      
      return {
        isValid: true,
        uploadMethod: 'youtube_native',
        violations: [],
        recommendations: [
          'YouTube URL validated - will use optimal posting method available',
          'Fallback to link sharing if video download is restricted',
          'Facebook will generate video preview automatically'
        ],
        fileSize: 0,
        detectedFormat: 'YouTube Video'
      };
    }
    
    const violations: string[] = [];
    const recommendations: string[] = [];
    let fileSize = 0;
    let detectedFormat: string | null = null;
    
    try {
      // Get basic file information
      const response = await fetch(videoUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FacebookBot/1.0)',
          'Accept': 'video/*'
        }
      });
      
      if (!response.ok) {
        violations.push(`Video URL not accessible: ${response.status} ${response.statusText}`);
        return {
          isValid: false,
          uploadMethod: 'rejected',
          violations,
          recommendations: [
            'Ensure video URL is publicly accessible',
            'Check sharing permissions are set to "Anyone with the link"',
            'Verify the video file exists and is not corrupted'
          ],
          fileSize: 0
        };
      }
      
      const contentLength = response.headers.get('content-length');
      const contentType = response.headers.get('content-type');
      fileSize = contentLength ? parseInt(contentLength, 10) : 0;
      detectedFormat = contentType || 'unknown';
      
      console.log('📊 VIDEO SPECS DETECTED:', {
        size: `${(fileSize / 1024 / 1024).toFixed(2)}MB`,
        type: detectedFormat
      });
      
      // Validate file size against Facebook limits
      if (fileSize > this.REQUIREMENTS.MARKETING_API_MAX_SIZE) {
        violations.push(`Video exceeds maximum size limit: ${(fileSize / 1024 / 1024 / 1024).toFixed(2)}GB > 10GB`);
      }
      
      // Validate content type
      if (!contentType?.includes('video') && !contentType?.includes('application/octet-stream')) {
        violations.push(`Invalid content type detected: ${contentType}. Expected video/* format`);
        recommendations.push('Ensure the URL points directly to a video file');
        recommendations.push('Check if URL needs conversion (e.g., Dropbox sharing links)');
      }
      
      // Determine optimal upload method based on size
      let uploadMethod: 'file_url' | 'resumable' | 'rejected' = 'rejected';
      
      if (fileSize <= this.REQUIREMENTS.URL_UPLOAD_MAX_SIZE) {
        uploadMethod = 'file_url';
        console.log('✅ FILE SIZE COMPATIBLE: Using file_url method');
      } else if (fileSize <= this.REQUIREMENTS.RESUMABLE_MAX_SIZE) {
        uploadMethod = 'resumable';
        console.log('⚡ LARGE FILE DETECTED: Using resumable upload method');
        recommendations.push('Large file will use resumable upload for reliability');
      } else if (fileSize <= this.REQUIREMENTS.MARKETING_API_MAX_SIZE) {
        uploadMethod = 'resumable';
        console.log('🚀 VERY LARGE FILE: Using resumable upload (Marketing API limits)');
        recommendations.push('Very large file requires resumable upload with extended processing time');
      } else {
        violations.push('File too large for any Facebook upload method');
      }
      
      // Add format-specific recommendations
      this.addFormatRecommendations(detectedFormat, fileSize, recommendations);
      
      // Add encoding recommendations
      recommendations.push('Ensure video uses H.264 codec for best compatibility');
      recommendations.push('Use AAC audio codec for optimal Facebook processing');
      recommendations.push('MP4 container format recommended');
      
      // Duration recommendations (can't detect without downloading, so provide guidance)
      if (uploadMethod === 'file_url') {
        recommendations.push('Ensure video duration is under 20 minutes for file_url upload');
      } else if (uploadMethod === 'resumable') {
        recommendations.push('Ensure video duration is under 45 minutes for resumable upload');
      }
      
      const isValid = violations.length === 0;
      
      return {
        isValid,
        uploadMethod,
        violations,
        recommendations,
        fileSize,
        detectedFormat: detectedFormat || undefined
      };
      
    } catch (error) {
      console.error('❌ FACEBOOK VALIDATION ERROR:', error);
      
      return {
        isValid: false,
        uploadMethod: 'rejected',
        violations: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        recommendations: [
          'Check your internet connection',
          'Verify the video URL is accessible',
          'Try using a different video hosting service',
          'Ensure the video file is not corrupted'
        ],
        fileSize: 0
      };
    }
  }
  
  /**
   * Add format-specific recommendations
   */
  private static addFormatRecommendations(contentType: string, fileSize: number, recommendations: string[]): void {
    const sizeMB = fileSize / 1024 / 1024;
    
    // Size-based recommendations
    if (sizeMB < 50) {
      recommendations.push('Small file size detected - should upload quickly');
    } else if (sizeMB < 500) {
      recommendations.push('Medium file size - expect normal upload time');
    } else {
      recommendations.push('Large file size - upload may take several minutes');
    }
    
    // Bitrate recommendations based on file size
    if (sizeMB > 100) {
      recommendations.push('Consider reducing bitrate: 5 Mbps for 720p, 8 Mbps for 1080p');
    }
    
    // Format-specific guidance
    if (contentType?.includes('quicktime') || contentType?.includes('mov')) {
      recommendations.push('MOV format detected - consider converting to MP4 for better compatibility');
    } else if (contentType?.includes('avi')) {
      recommendations.push('AVI format detected - MP4 conversion recommended for optimal Facebook processing');
    } else if (contentType?.includes('webm')) {
      recommendations.push('WebM format detected - may work but MP4 is preferred');
    }
  }
  
  /**
   * Generate comprehensive validation report
   */
  static generateFacebookValidationReport(result: {
    isValid: boolean;
    uploadMethod: 'file_url' | 'resumable' | 'rejected';
    violations: string[];
    recommendations: string[];
    fileSize: number;
    detectedFormat?: string;
  }): string {
    const sizeMB = (result.fileSize / 1024 / 1024).toFixed(2);
    
    let report = `🎬 FACEBOOK VIDEO VALIDATION REPORT

📊 FILE SPECIFICATIONS:
• Size: ${sizeMB}MB
• Format: ${result.detectedFormat || 'Unknown'}
• Upload Method: ${result.uploadMethod.toUpperCase()}
• Status: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`;

    if (result.violations.length > 0) {
      report += `\n\n❌ VIOLATIONS FOUND:`;
      result.violations.forEach((violation, index) => {
        report += `\n${index + 1}. ${violation}`;
      });
    }
    
    if (result.recommendations.length > 0) {
      report += `\n\n💡 RECOMMENDATIONS:`;
      result.recommendations.forEach((rec, index) => {
        report += `\n${index + 1}. ${rec}`;
      });
    }
    
    // Add Facebook-specific upload guidance
    if (result.uploadMethod === 'file_url') {
      report += `\n\n🚀 UPLOAD STRATEGY:
Using file_url method for optimal speed and compatibility.
Estimated upload time: ${this.estimateUploadTime(result.fileSize)}`;
    } else if (result.uploadMethod === 'resumable') {
      report += `\n\n⚡ UPLOAD STRATEGY:
Using resumable upload for large file reliability.
Benefits: Resume interrupted uploads, handle network issues.
Estimated upload time: ${this.estimateUploadTime(result.fileSize)}`;
    } else {
      report += `\n\n🚫 UPLOAD BLOCKED:
File cannot be uploaded to Facebook due to violations listed above.`;
    }
    
    return report;
  }
  
  /**
   * Estimate upload time based on file size
   */
  private static estimateUploadTime(fileSize: number): string {
    const sizeMB = fileSize / 1024 / 1024;
    
    if (sizeMB < 10) return '< 30 seconds';
    if (sizeMB < 50) return '1-2 minutes';
    if (sizeMB < 200) return '3-5 minutes';
    if (sizeMB < 500) return '5-10 minutes';
    return '10+ minutes';
  }
}