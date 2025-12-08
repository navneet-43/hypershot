# Media Management with Cloudinary

This document provides a comprehensive guide to media management in our social media publishing tool using Cloudinary for image and video storage, optimization, and delivery.

## Overview

Our application leverages Cloudinary to handle all aspects of media management for social media posts, including:

1. Image uploads (JPG, PNG, GIF, WebP, etc.)
2. Video uploads (up to 100MB)
3. Media optimization for different social platforms
4. Secure storage and CDN delivery
5. Media transformation and effects

## Prerequisites

To implement media management, we need:

1. **Cloudinary Account**
   - Sign up at [cloudinary.com](https://cloudinary.com/)
   - Get API credentials from your dashboard

2. **Environment Variables**
   - `CLOUDINARY_CLOUD_NAME`: Your Cloudinary cloud name
   - `CLOUDINARY_API_KEY`: Your Cloudinary API key
   - `CLOUDINARY_API_SECRET`: Your Cloudinary API secret

3. **Dependencies**
   - Cloudinary Node.js SDK
   - Multer for handling file uploads

## Implementation

### 1. Cloudinary Setup

```typescript
// server/utils/cloudinary.ts
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadImage = async (fileBuffer: Buffer, mimeType: string = 'image/jpeg', folder: string = 'social_posts'): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Create a readable stream from the buffer
    const stream = require('stream');
    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileBuffer);
    
    // Create a cloudinary upload stream
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto', // Automatically detect resource type (image/video)
        format: mimeType.split('/')[1], // Extract format from MIME type
        // Additional options for optimization
        transformation: [
          { quality: 'auto' }, // Auto quality optimization
          { fetch_format: 'auto' }, // Auto format selection for best delivery
        ],
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        
        // Return the secure URL of the uploaded media
        resolve(result.secure_url);
      },
    );
    
    // Pipe the buffer stream to the upload stream
    bufferStream.pipe(uploadStream);
  });
};

export const deleteImage = async (publicId: string): Promise<boolean> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === 'ok';
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    return false;
  }
};

// Helper to extract public ID from Cloudinary URL
export const getPublicIdFromUrl = (url: string): string | null => {
  try {
    // Example URL: https://res.cloudinary.com/cloud-name/image/upload/v1234567890/folder/filename.jpg
    const regex = /\/v\d+\/(.+)\.\w+$/;
    const match = url.match(regex);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error extracting public ID:', error);
    return null;
  }
};
```

### 2. File Upload Middleware

```typescript
// routes.ts (partial)
import multer from 'multer';
import { uploadImage } from './utils/cloudinary';

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Only images and videos are allowed.') as any);
    }
  },
});

// Media upload endpoint
app.post("/api/media/upload", upload.single('media'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No media file provided' 
      });
    }
    
    const user = await authenticateUser(req, res);
    
    // Get the file buffer and MIME type
    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;
    
    // Folder structure: user_id/media_type/
    const folder = `user_${user.id}/${mimeType.startsWith('image/') ? 'images' : 'videos'}`;
    
    // Upload to Cloudinary
    const mediaUrl = await uploadImage(fileBuffer, mimeType, folder);
    
    // Create activity log
    await storage.createActivity({
      userId: user.id,
      type: 'media_uploaded',
      description: `Uploaded ${mimeType.startsWith('image/') ? 'image' : 'video'} to Cloudinary`,
      metadata: { 
        url: mediaUrl,
        mimeType,
        size: req.file.size
      }
    });
    
    res.json({
      success: true,
      mediaUrl,
      mimeType,
      size: req.file.size
    });
  } catch (error) {
    console.error('Media upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error uploading media', 
      error: (error as Error).message 
    });
  }
});
```

### 3. Frontend Media Upload Component

```tsx
// client/src/components/common/MediaUpload.tsx
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Upload, X, Image as ImageIcon, Film } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface MediaUploadProps {
  onUploadComplete: (url: string, mimeType: string) => void;
  existingMediaUrl?: string;
  allowedTypes?: string; // e.g., "image/*,video/*"
}

export default function MediaUpload({ 
  onUploadComplete, 
  existingMediaUrl,
  allowedTypes = "image/*,video/*" 
}: MediaUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(existingMediaUrl || null);
  const [mediaType, setMediaType] = useState<string | null>(null);
  
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('media', file);
      
      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Upload successful',
        description: 'Media file has been uploaded.',
      });
      
      setPreview(data.mediaUrl);
      setMediaType(data.mimeType);
      onUploadComplete(data.mediaUrl, data.mimeType);
    },
    onError: (error) => {
      toast({
        title: 'Upload failed',
        description: (error as Error).message || 'Failed to upload media file.',
        variant: 'destructive',
      });
    },
  });
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file size (100MB limit)
    if (file.size > 100 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'The maximum file size is 100MB.',
        variant: 'destructive',
      });
      return;
    }
    
    // Create a preview
    const fileType = file.type;
    setMediaType(fileType);
    
    if (fileType.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else if (fileType.startsWith('video/')) {
      // For videos, use a URL.createObjectURL preview
      const url = URL.createObjectURL(file);
      setPreview(url);
      
      // Clean up the object URL when we're done with it
      return () => URL.revokeObjectURL(url);
    }
    
    // Start upload
    uploadMutation.mutate(file);
  };
  
  const handleClear = () => {
    setPreview(null);
    setMediaType(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onUploadComplete('', '');
  };
  
  const handleClick = () => {
    fileInputRef.current?.click();
  };
  
  return (
    <div className="w-full">
      <input
        type="file"
        accept={allowedTypes}
        onChange={handleFileChange}
        ref={fileInputRef}
        className="hidden"
      />
      
      {!preview ? (
        <Button
          type="button"
          variant="outline"
          onClick={handleClick}
          className="w-full h-32 border-dashed flex flex-col items-center justify-center gap-2"
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <Upload className="h-6 w-6" />
              <span>Upload Media</span>
              <span className="text-xs text-muted-foreground">
                Images or videos up to 100MB
              </span>
            </>
          )}
        </Button>
      ) : (
        <Card className="relative overflow-hidden">
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
          
          <CardContent className="p-0">
            {mediaType?.startsWith('image/') ? (
              <img
                src={preview}
                alt="Preview"
                className="w-full h-48 object-cover"
              />
            ) : mediaType?.startsWith('video/') ? (
              <video
                src={preview}
                controls
                className="w-full h-48 object-cover"
              />
            ) : (
              <div className="w-full h-48 bg-muted flex items-center justify-center">
                {mediaType?.startsWith('image/') ? (
                  <ImageIcon className="h-12 w-12 text-muted-foreground" />
                ) : (
                  <Film className="h-12 w-12 text-muted-foreground" />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

## Usage in Post Creation

The media upload component is integrated into the post creation form:

```tsx
// Partial example from post creation component
<div className="space-y-4">
  <FormField
    control={form.control}
    name="content"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Post Content</FormLabel>
        <FormControl>
          <Textarea
            placeholder="Enter your post content..."
            className="min-h-32"
            {...field}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
  
  <FormField
    control={form.control}
    name="mediaUrl"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Media</FormLabel>
        <FormControl>
          <MediaUpload
            existingMediaUrl={field.value || ''}
            onUploadComplete={(url) => {
              field.onChange(url);
            }}
          />
        </FormControl>
        <FormDescription>
          Add an image or video to your post (optional)
        </FormDescription>
        <FormMessage />
      </FormItem>
    )}
  />
  
  {/* Other form fields... */}
</div>
```

## Advanced Features

### 1. Image Transformations

Cloudinary allows for powerful image transformations that can be applied via URL parameters:

```typescript
// Generate a transformed image URL
export const getTransformedImageUrl = (url: string, options: {
  width?: number;
  height?: number;
  crop?: string;
  quality?: number;
  format?: string;
}): string => {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }
  
  // Example URL: https://res.cloudinary.com/cloud-name/image/upload/v1234567890/folder/filename.jpg
  
  // Split URL to insert transformation parameters
  const splitUrl = url.split('/upload/');
  if (splitUrl.length !== 2) return url;
  
  const transformations = [];
  
  if (options.width) transformations.push(`w_${options.width}`);
  if (options.height) transformations.push(`h_${options.height}`);
  if (options.crop) transformations.push(`c_${options.crop}`);
  if (options.quality) transformations.push(`q_${options.quality}`);
  if (options.format) transformations.push(`f_${options.format}`);
  
  // No transformations to apply
  if (transformations.length === 0) return url;
  
  // Combine transformations with commas
  const transformationString = transformations.join(',');
  
  // Reconstruct URL with transformations
  return `${splitUrl[0]}/upload/${transformationString}/${splitUrl[1]}`;
};
```

Usage example:

```tsx
// Responsive image component with Cloudinary transformations
function ResponsiveImage({ url, alt }: { url: string, alt: string }) {
  const smallImageUrl = getTransformedImageUrl(url, { width: 400, quality: 80 });
  const mediumImageUrl = getTransformedImageUrl(url, { width: 800, quality: 80 });
  const largeImageUrl = getTransformedImageUrl(url, { width: 1200, quality: 80 });
  
  return (
    <img
      src={mediumImageUrl}
      srcSet={`${smallImageUrl} 400w, ${mediumImageUrl} 800w, ${largeImageUrl} 1200w`}
      sizes="(max-width: 600px) 400px, (max-width: 1200px) 800px, 1200px"
      alt={alt}
      className="w-full h-auto"
    />
  );
}
```

### 2. Video Optimizations

For videos, Cloudinary can perform optimizations and format conversions:

```typescript
// Video optimization options
export const getOptimizedVideoUrl = (url: string, options: {
  width?: number;
  height?: number;
  quality?: string; // e.g., 'auto', '70'
  format?: string; // e.g., 'mp4', 'webm'
}): string => {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }
  
  // Split URL to insert transformation parameters
  const splitUrl = url.split('/upload/');
  if (splitUrl.length !== 2) return url;
  
  const transformations = [];
  
  if (options.width) transformations.push(`w_${options.width}`);
  if (options.height) transformations.push(`h_${options.height}`);
  if (options.quality) transformations.push(`q_${options.quality}`);
  if (options.format) transformations.push(`f_${options.format}`);
  
  // Add video-specific optimizations
  transformations.push('vc_auto'); // Auto video codec
  
  // No transformations to apply
  if (transformations.length === 0) return url;
  
  // Combine transformations with commas
  const transformationString = transformations.join(',');
  
  // Reconstruct URL with transformations
  return `${splitUrl[0]}/upload/${transformationString}/${splitUrl[1]}`;
};
```

### 3. Social Media Platform Optimizations

Different social platforms have different requirements for media. We can create platform-specific transformations:

```typescript
type SocialPlatform = 'facebook' | 'instagram' | 'twitter' | 'linkedin';

// Get platform-optimized media URL
export const getPlatformOptimizedUrl = (url: string, platform: SocialPlatform): string => {
  if (!url) return url;
  
  const isVideo = url.match(/\.(mp4|mov|avi|wmv|flv|webm)($|\?)/i);
  
  // Platform-specific optimizations
  switch (platform) {
    case 'facebook':
      if (isVideo) {
        return getOptimizedVideoUrl(url, {
          format: 'mp4',
          quality: 'auto',
        });
      } else {
        return getTransformedImageUrl(url, {
          width: 1200,
          height: 630,
          crop: 'fill',
          quality: 90,
        });
      }
    
    case 'instagram':
      if (isVideo) {
        return getOptimizedVideoUrl(url, {
          format: 'mp4',
          quality: 'auto',
        });
      } else {
        return getTransformedImageUrl(url, {
          width: 1080,
          height: 1080,
          crop: 'fill',
          quality: 90,
        });
      }
    
    case 'twitter':
      if (isVideo) {
        return getOptimizedVideoUrl(url, {
          format: 'mp4',
          quality: 'auto',
        });
      } else {
        return getTransformedImageUrl(url, {
          width: 1200,
          height: 675,
          crop: 'fill',
          quality: 90,
        });
      }
    
    case 'linkedin':
      if (isVideo) {
        return getOptimizedVideoUrl(url, {
          format: 'mp4',
          quality: 'auto',
        });
      } else {
        return getTransformedImageUrl(url, {
          width: 1200,
          height: 627,
          crop: 'fill',
          quality: 90,
        });
      }
    
    default:
      return url;
  }
};
```

## Media Management Workflow

The complete media management workflow:

1. **Upload Process**
   - User selects a file in the UI
   - File is validated client-side (type, size)
   - File is sent to the server
   - Server uploads to Cloudinary
   - Server returns the media URL to the client
   - URL is stored with the post

2. **Media Preview**
   - Images are displayed using appropriate transformations
   - Videos are displayed with HTML5 video player
   - Optimized versions are loaded based on screen size

3. **Publishing Process**
   - When a post is published, platform-specific versions are created
   - Media URLs are included in API calls to social platforms

4. **Media Cleanup**
   - When a post is deleted, associated media is also removed
   - Background job can scan for orphaned media files

## Error Handling

Media uploads can encounter various errors that need to be handled:

### 1. File Size Limits

```typescript
// Server-side validation
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (req, file, cb) => {
    // File type validation
    // ...
  },
});

// Error handler for file size exceeded
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: 'File too large. Maximum size is 100MB.',
      });
    }
  }
  next(err);
});
```

### 2. File Type Validation

```typescript
// Client-side validation
const isValidFileType = (file: File, acceptedTypes: string) => {
  const types = acceptedTypes.split(',').map(type => type.trim());
  
  for (const type of types) {
    if (type === file.type || type === '*/*') {
      return true;
    }
    
    // Handle wildcards like 'image/*'
    if (type.endsWith('/*')) {
      const category = type.split('/')[0];
      if (file.type.startsWith(`${category}/`)) {
        return true;
      }
    }
  }
  
  return false;
};
```

### 3. Connection Errors

```typescript
const uploadWithRetry = async (file: File, maxRetries = 3): Promise<string> => {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      const formData = new FormData();
      formData.append('media', file);
      
      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }
      
      const data = await response.json();
      return data.mediaUrl;
    } catch (error) {
      retries++;
      
      if (retries >= maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
    }
  }
  
  throw new Error('Upload failed after multiple attempts');
};
```

## Performance Considerations

1. **Client-side Resizing**
   - Resize large images before upload to reduce bandwidth
   - Use the browser's Canvas API for client-side resizing

```typescript
const resizeImageBeforeUpload = async (file: File, maxWidth = 2000, maxHeight = 2000): Promise<File> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      // Don't resize non-image files
      return resolve(file);
    }
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Calculate new dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Convert to Blob/File
        canvas.toBlob((blob) => {
          if (!blob) {
            return reject(new Error('Canvas to Blob conversion failed'));
          }
          
          // Create a new File from the blob
          const resizedFile = new File([blob], file.name, {
            type: file.type,
            lastModified: Date.now(),
          });
          
          resolve(resizedFile);
        }, file.type);
      };
      
      img.onerror = () => {
        reject(new Error('Error loading image'));
      };
    };
    
    reader.onerror = () => {
      reject(new Error('Error reading file'));
    };
  });
};
```

2. **Lazy Loading**
   - Use lazy loading for media in lists and feeds
   - Load optimized thumbnails first, then full versions

```tsx
<img
  src={getTransformedImageUrl(url, { width: 20, quality: 10 })} // Tiny placeholder
  data-src={getTransformedImageUrl(url, { width: 800, quality: 80 })} // Full version
  className="lazy-load w-full h-auto blur-sm transition-all duration-300"
  alt={alt}
  loading="lazy"
  onLoad={(e) => {
    // Load the full image after placeholder is loaded
    const img = e.target as HTMLImageElement;
    const fullSrc = img.getAttribute('data-src');
    if (fullSrc) {
      const fullImg = new Image();
      fullImg.src = fullSrc;
      fullImg.onload = () => {
        img.src = fullSrc;
        img.classList.remove('blur-sm');
      };
    }
  }}
/>
```

3. **Responsive Images**
   - Use srcset and sizes for responsive images
   - Load different sizes based on viewport width

## Security Considerations

1. **Access Control**
   - Verify user permissions before allowing uploads
   - Validate file content (not just extension)
   - Scan files for malware when possible

2. **Secure URLs**
   - Always use HTTPS URLs for media
   - Consider signed URLs for sensitive content

3. **Rate Limiting**
   - Implement rate limiting for upload endpoints
   - Track upload patterns to detect abuse

## Monitoring and Maintenance

1. **Usage Tracking**
   - Monitor Cloudinary usage to stay within limits
   - Track media usage by user and post

2. **Cleanup Process**
   - Implement a background job to remove unused media
   - Delete media associated with deleted posts

## Resources

- [Cloudinary Documentation](https://cloudinary.com/documentation)
- [Cloudinary Node.js SDK](https://github.com/cloudinary/cloudinary_npm)
- [Multer Documentation](https://github.com/expressjs/multer)
- [Optimizing Images for the Web](https://web.dev/fast/#optimize-your-images)