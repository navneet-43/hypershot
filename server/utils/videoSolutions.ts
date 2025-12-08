/**
 * Comprehensive video optimization solutions for Facebook publishing
 */
export class VideoSolutions {
  
  /**
   * Get step-by-step compression guide for large videos
   */
  static getCompressionGuide(currentSizeMB: number): {
    targetSizeMB: number;
    compressionRatio: number;
    steps: string[];
    tools: { name: string; platform: string; free: boolean; instructions: string }[];
  } {
    const targetSizeMB = Math.min(95, currentSizeMB * 0.4); // Target 95MB or 40% of original
    const compressionRatio = Math.round((1 - targetSizeMB / currentSizeMB) * 100);
    
    return {
      targetSizeMB,
      compressionRatio,
      steps: [
        `Reduce video resolution (if currently 1080p, try 720p)`,
        `Lower bitrate to 2-4 Mbps for good quality`,
        `Trim unnecessary parts from beginning/end`,
        `Use efficient codec (H.264 for video, AAC for audio)`,
        `Export as MP4 format for best compatibility`
      ],
      tools: [
        {
          name: "HandBrake",
          platform: "Windows/Mac/Linux",
          free: true,
          instructions: "Download HandBrake → Open video → Preset: 'Fast 720p30' → Adjust quality to RF 23-25 → Start encode"
        },
        {
          name: "CloudConvert",
          platform: "Online",
          free: true,
          instructions: "Visit cloudconvert.com → Upload video → Choose MP4 → Settings: 720p, 3Mbps bitrate → Convert"
        },
        {
          name: "DaVinci Resolve",
          platform: "Windows/Mac/Linux",
          free: true,
          instructions: "Import video → Timeline → Deliver tab → MP4, H.264, 720p, 3Mbps → Render"
        }
      ]
    };
  }
  
  /**
   * Get alternative hosting solutions for large videos
   */
  static getAlternativeHosting(): {
    platform: string;
    description: string;
    benefits: string[];
    limitations: string[];
  }[] {
    return [
      {
        platform: "YouTube",
        description: "Upload to YouTube and share the link in Facebook posts",
        benefits: [
          "No file size limits",
          "Automatic optimization",
          "Built-in Facebook integration",
          "Analytics included"
        ],
        limitations: [
          "Requires YouTube account",
          "Video becomes public (unless unlisted)"
        ]
      },
      {
        platform: "Vimeo",
        description: "Professional video hosting with privacy controls",
        benefits: [
          "High quality playback",
          "Privacy settings available",
          "Clean embedding",
          "No ads on free tier"
        ],
        limitations: [
          "Weekly upload limits on free plan",
          "Lower discovery than YouTube"
        ]
      },
      {
        platform: "Streamable",
        description: "Simple video hosting for social media",
        benefits: [
          "No registration required",
          "Direct upload",
          "Social media optimized",
          "Fast streaming"
        ],
        limitations: [
          "Files expire after time",
          "Limited storage"
        ]
      }
    ];
  }
  
  /**
   * Generate Google Drive optimization suggestions
   */
  static getGoogleDriveOptimization(): {
    steps: string[];
    common_issues: { issue: string; solution: string }[];
  } {
    return {
      steps: [
        "Right-click video in Google Drive → Get link",
        "Change sharing to 'Anyone with the link can view'",
        "Ensure video is fully uploaded (check for processing status)",
        "Use direct download format in your Excel import",
        "Test the link in an incognito browser window"
      ],
      common_issues: [
        {
          issue: "Video shows as 'processing' in Google Drive",
          solution: "Wait for Google Drive to finish processing, then try again"
        },
        {
          issue: "Permission denied errors",
          solution: "Change sharing settings to public or 'Anyone with link'"
        },
        {
          issue: "Download quota exceeded",
          solution: "Wait 24 hours or compress video to reduce download size"
        },
        {
          issue: "Video format not supported",
          solution: "Convert to MP4 format before uploading to Google Drive"
        }
      ]
    };
  }
  
  /**
   * Create detailed error message with solutions
   */
  static createSolutionMessage(
    currentSizeMB: number,
    errorType: 'size' | 'format' | 'access' | 'corrupt'
  ): string {
    let message = `Video upload failed (${currentSizeMB.toFixed(1)}MB). Here's how to fix it:\n\n`;
    
    if (errorType === 'size' || currentSizeMB > 100) {
      const guide = this.getCompressionGuide(currentSizeMB);
      message += `🎯 TARGET: Reduce to ${guide.targetSizeMB}MB (${guide.compressionRatio}% compression)\n\n`;
      message += `📝 STEPS:\n`;
      guide.steps.forEach((step, i) => {
        message += `${i + 1}. ${step}\n`;
      });
      message += `\n🔧 RECOMMENDED TOOLS:\n`;
      guide.tools.slice(0, 2).forEach(tool => {
        message += `• ${tool.name} (${tool.platform}): ${tool.instructions}\n`;
      });
    }
    
    if (errorType === 'access') {
      const gdrive = this.getGoogleDriveOptimization();
      message += `\n🔗 GOOGLE DRIVE SETUP:\n`;
      gdrive.steps.forEach((step, i) => {
        message += `${i + 1}. ${step}\n`;
      });
    }
    
    if (errorType === 'format' || errorType === 'corrupt') {
      message += `\n📱 FORMAT REQUIREMENTS:\n`;
      message += `• Container: MP4\n`;
      message += `• Video: H.264 codec\n`;
      message += `• Audio: AAC codec\n`;
      message += `• Resolution: 720p or 1080p\n`;
      message += `• Bitrate: 2-5 Mbps\n`;
    }
    
    const alternatives = this.getAlternativeHosting();
    message += `\n🚀 QUICK ALTERNATIVES:\n`;
    alternatives.slice(0, 2).forEach(alt => {
      message += `• ${alt.platform}: ${alt.description}\n`;
    });
    
    return message;
  }
  
  /**
   * Check if video meets Facebook's basic requirements
   */
  static validateBasicRequirements(sizeMB: number, format?: string): {
    passes: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues = [];
    const recommendations = [];
    
    // Size check - Facebook supports up to 1.75GB for resumable uploads
    if (sizeMB > 1750) {
      issues.push(`File too large: ${sizeMB.toFixed(1)}MB (max: 1.75GB for Facebook)`);
      recommendations.push("Split into multiple shorter videos");
    } else if (sizeMB > 1000) {
      recommendations.push(`Large file (${sizeMB.toFixed(1)}MB): Will use resumable upload for reliability`);
    } else if (sizeMB > 100) {
      recommendations.push(`Medium file (${sizeMB.toFixed(1)}MB): Upload should proceed normally`);
    }
    
    // Format check
    if (format && !format.includes('mp4') && !format.includes('video/mp4')) {
      issues.push(`Format may not be optimal: ${format}`);
      recommendations.push("Convert to MP4 with H.264 codec");
    }
    
    return {
      passes: issues.length === 0,
      issues,
      recommendations
    };
  }
}