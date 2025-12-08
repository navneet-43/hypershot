/**
 * Google Drive Link Converter
 * Converts Google Drive share links to direct download URLs that Facebook can access
 */

export function convertGoogleDriveLink(shareLink: string): string | null {
  try {
    // Handle different Google Drive URL formats
    const patterns = [
      // https://drive.google.com/file/d/FILE_ID/view?usp=sharing
      /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view/,
      // https://drive.google.com/open?id=FILE_ID
      /https:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
      // https://drive.google.com/uc?id=FILE_ID
      /https:\/\/drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/,
    ];

    for (const pattern of patterns) {
      const match = shareLink.match(pattern);
      if (match && match[1]) {
        const fileId = match[1];
        // Convert to direct download URL
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
      }
    }

    // If it's already a direct download URL, return as is
    if (shareLink.includes('drive.google.com/uc?export=download')) {
      return shareLink;
    }

    // If it's already a direct download URL with different format
    if (shareLink.includes('drive.google.com/uc?id=')) {
      const match = shareLink.match(/id=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return `https://drive.google.com/uc?export=download&id=${match[1]}`;
      }
    }

    console.warn('Could not convert Google Drive link:', shareLink);
    return null;
  } catch (error) {
    console.error('Error converting Google Drive link:', error);
    return null;
  }
}

export function isGoogleDriveLink(url: string): boolean {
  return url.includes('drive.google.com') || url.includes('docs.google.com');
}

export function validateGoogleDriveLink(url: string): { valid: boolean; message?: string } {
  if (!url) {
    return { valid: false, message: 'URL is required' };
  }

  if (!isGoogleDriveLink(url)) {
    return { valid: false, message: 'URL must be a Google Drive link' };
  }

  const convertedUrl = convertGoogleDriveLink(url);
  if (!convertedUrl) {
    return { 
      valid: false, 
      message: 'Invalid Google Drive link format. Please use a share link from Google Drive.' 
    };
  }

  return { valid: true };
}

export async function testGoogleDriveAccess(url: string): Promise<{ accessible: boolean; error?: string }> {
  try {
    const convertedUrl = convertGoogleDriveLink(url);
    if (!convertedUrl) {
      return { accessible: false, error: 'Invalid Google Drive link' };
    }

    // Test if the file is accessible
    const response = await fetch(convertedUrl, { method: 'HEAD' });
    
    if (response.ok) {
      return { accessible: true };
    } else if (response.status === 403) {
      return { 
        accessible: false, 
        error: 'File is not publicly accessible. Please check sharing permissions.' 
      };
    } else {
      return { 
        accessible: false, 
        error: `File not accessible (HTTP ${response.status})` 
      };
    }
  } catch (error) {
    return { 
      accessible: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}