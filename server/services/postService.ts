import schedule from 'node-schedule';
import { storage } from '../storage';
import { Post, posts } from '@shared/schema';
import fetch from 'node-fetch';
import { db } from '../db';
import { and, eq } from 'drizzle-orm';

// Store active job schedules by post ID
const activeJobs: Record<number, schedule.Job> = {};

/**
 * Publish a post to Facebook using Hootsuite-style approach
 * @param post The post to publish
 * @returns Result of the operation
 */
export async function publishPostToFacebook(post: Post): Promise<{success: boolean, data?: any, error?: string}> {
  // Import services at function level for error handler access
  const { progressTracker } = await import('./progressTrackingService');
  
  try {
    const { HootsuiteStyleFacebookService } = await import('./hootsuiteStyleFacebookService');
    
    // Initialize progress tracking if uploadId is provided
    if ((post as any).uploadId && post.userId) {
      console.log(`📊 Initializing progress tracking for upload: ${(post as any).uploadId}`);
      progressTracker.startUpload((post as any).uploadId, post.userId);
      progressTracker.updateProgress((post as any).uploadId, 'Starting Facebook publish process...', 5, 'Validating account and preparing upload');
    }
    
    // Verify post has all required data
    if (!post.accountId) {
      return { success: false, error: 'No Facebook account selected for this post' };
    }
    
    if (!post.content && !post.mediaUrl) {
      return { success: false, error: 'Post must have content or media' };
    }
    
    // Get the Facebook account
    const account = await storage.getFacebookAccount(post.accountId);
    if (!account) {
      return { success: false, error: 'Facebook account not found' };
    }
    
    if (!account.accessToken) {
      return { success: false, error: 'Facebook account is not properly authenticated' };
    }
    
    // Update progress
    if ((post as any).uploadId) {
      progressTracker.updateProgress((post as any).uploadId, 'Validating Facebook authentication...', 10, 'Checking page access token');
    }
    
    // Validate token before using it
    const isValidToken = await HootsuiteStyleFacebookService.validatePageToken(account.pageId, account.accessToken);
    if (!isValidToken) {
      console.log('Invalid page token detected, attempting refresh...');
      if ((post as any).uploadId) {
        progressTracker.completeUpload((post as any).uploadId, false, 'Facebook access token is invalid or expired');
      }
      return { 
        success: false, 
        error: 'Facebook access token is invalid or expired. Please refresh your Facebook connection.' 
      };
    }
    
    console.log(`Publishing post ${post.id} to Facebook page: ${account.name} (${account.pageId})`);
    console.log(`📝 Post mediaType: "${post.mediaType}" | mediaUrl: ${post.mediaUrl ? 'present' : 'none'}`);
    
    // Update progress
    if ((post as any).uploadId) {
      progressTracker.updateProgress((post as any).uploadId, 'Processing custom labels...', 15, 'Resolving label IDs to names');
    }
    
    // Resolve label IDs to label names if labels are provided as IDs
    let resolvedLabels = post.labels;
    if (post.labels && post.labels.length > 0 && post.userId) {
      const labelNames = [];
      for (const label of post.labels) {
        // Check if label is an ID (number as string) or already a name
        if (/^\d+$/.test(label)) {
          // It's an ID, resolve to name
          try {
            const customLabels = await storage.getCustomLabels(post.userId);
            const labelObj = customLabels.find(l => l.id.toString() === label);
            if (labelObj) {
              labelNames.push(labelObj.name);
            } else {
              labelNames.push(label); // Keep original if not found
            }
          } catch (error) {
            console.warn(`Failed to resolve label ID ${label}:`, error);
            labelNames.push(label); // Keep original on error
          }
        } else {
          // It's already a name
          labelNames.push(label);
        }
      }
      resolvedLabels = labelNames;
      console.log('✅ CUSTOM LABELS RESOLVED:', post.labels, '->', resolvedLabels);
    }
    
    // CRITICAL: Log labels being sent to Facebook for debugging
    if (resolvedLabels && resolvedLabels.length > 0) {
      console.log(`📊 POST ${post.id}: Sending ${resolvedLabels.length} custom labels to Facebook:`, resolvedLabels);
    } else {
      console.warn(`⚠️ POST ${post.id}: NO CUSTOM LABELS - labels field is ${post.labels ? 'empty array' : 'null/undefined'}`);
    }
    
    let result;
    
    // Determine post type based on mediaType and publish accordingly
    if (post.mediaUrl && post.mediaType && post.mediaType !== 'none') {
      switch (post.mediaType) {
        case 'photo':
        case 'image':
          if ((post as any).uploadId) {
            progressTracker.updateProgress((post as any).uploadId, 'Publishing photo to Facebook...', 30, 'Uploading image content');
          }
          // Use simple photo service to avoid import issues
          const { SimpleFacebookPhotoService } = await import('./simpleFacebookPhotoService');
          result = await SimpleFacebookPhotoService.uploadPhoto(
            account.pageId,
            account.accessToken,
            post.mediaUrl,
            post.content || undefined,
            resolvedLabels || undefined,
            post.language || undefined
          );
          break;
          
        case 'video':
          if ((post as any).uploadId) {
            progressTracker.updateProgress((post as any).uploadId, 'Processing video for Facebook upload...', 25, 'Starting video processing and upload');
          }
          result = await HootsuiteStyleFacebookService.publishVideoPost(
            account.pageId,
            account.accessToken,
            post.mediaUrl,
            post.content || undefined,
            resolvedLabels || undefined,
            post.language || undefined,
            (post as any).uploadId // Pass uploadId for progress tracking
          );
          break;
          
        case 'reel':
          if ((post as any).uploadId) {
            progressTracker.updateProgress((post as any).uploadId, 'Processing Reel for Facebook upload...', 25, 'Starting Reel processing and upload');
          }
          result = await HootsuiteStyleFacebookService.publishReelPost(
            account.pageId,
            account.accessToken,
            post.mediaUrl,
            post.content || undefined,
            resolvedLabels || undefined,
            post.language || undefined,
            (post as any).uploadId // Pass uploadId for progress tracking
          );
          break;
          
        default:
          if ((post as any).uploadId) {
            progressTracker.updateProgress((post as any).uploadId, 'Publishing content to Facebook...', 30, 'Processing text with media link');
          }
          // Fallback to text post with media as link
          result = await HootsuiteStyleFacebookService.publishTextPost(
            account.pageId,
            account.accessToken,
            post.content || 'Check out this content!',
            post.mediaUrl,
            resolvedLabels || undefined,
            post.language || undefined
          );
      }
    } else {
      // Text-only post
      if ((post as any).uploadId) {
        progressTracker.updateProgress((post as any).uploadId, 'Publishing text post to Facebook...', 30, 'Processing text content');
      }
      result = await HootsuiteStyleFacebookService.publishTextPost(
        account.pageId,
        account.accessToken,
        post.content!,
        post.link || undefined,
        resolvedLabels || undefined,
        post.language || undefined
      );
    }
    
    if (result.success) {
      // Complete progress tracking
      if ((post as any).uploadId) {
        progressTracker.completeUpload((post as any).uploadId, true, 'Video uploaded and published to Facebook successfully');
      }
      
      // Log activity for successful publication
      const languageInfo = post.language ? ` (${post.language.toUpperCase()})` : '';
      const labelsInfo = resolvedLabels && resolvedLabels.length > 0 ? ` with labels: ${resolvedLabels.join(', ')}` : '';
      
      await storage.createActivity({
        userId: post.userId || null,
        type: 'post_published',
        description: `Post published to Facebook page: ${account.name}${languageInfo}${labelsInfo}`,
        metadata: { 
          postId: post.id,
          facebookPostId: result.postId,
          pageId: account.pageId,
          customLabels: resolvedLabels,
          language: post.language,
          mediaType: post.mediaType
        }
      });
      
      console.log(`Successfully published post ${post.id} to Facebook. FB Post ID: ${result.postId}`);
      
      return { 
        success: true, 
        data: { 
          facebookPostId: result.postId,
          pageId: account.pageId,
          pageName: account.name
        }
      };
    } else {
      // Complete progress tracking for failed upload
      if ((post as any).uploadId) {
        progressTracker.completeUpload((post as any).uploadId, false, result.error || 'Facebook publishing failed');
      }
      
      console.error(`Failed to publish post ${post.id} to Facebook:`, result.error);
      return { 
        success: false, 
        error: result.error || 'Unknown Facebook publishing error'
      };
    }
    
  } catch (error) {
    // Complete progress tracking for error
    if ((post as any).uploadId) {
      progressTracker.completeUpload((post as any).uploadId, false, error instanceof Error ? error.message : 'Unknown error occurred');
    }
    
    console.error('Error publishing to Facebook:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Schedule a post for future publication
 * @param post The post to schedule
 */
export function schedulePostPublication(post: Post): void {
  console.log(`🔍 SCHEDULE DEBUG: Attempting to schedule post ${post.id}`);
  console.log(`🔍 Post status: ${post.status}`);
  console.log(`🔍 Scheduled for: ${post.scheduledFor}`);
  
  if (!post.scheduledFor || post.status !== 'scheduled') {
    console.warn(`❌ Post ${post.id} is not scheduled or has no scheduled date`);
    console.warn(`❌ Status: ${post.status}, ScheduledFor: ${post.scheduledFor}`);
    return;
  }
  
  // Cancel any existing job for this post
  if (activeJobs[post.id]) {
    console.log(`🔄 Canceling existing job for post ${post.id}`);
    activeJobs[post.id].cancel();
    delete activeJobs[post.id];
  }
  
  const scheduledTime = new Date(post.scheduledFor);
  const now = new Date();
  console.log(`🕐 Current time: ${now.toISOString()}`);
  console.log(`🕐 Scheduled time: ${scheduledTime.toISOString()}`);
  console.log(`🕐 Time difference (ms): ${scheduledTime.getTime() - now.getTime()}`);
  
  if (scheduledTime <= now) {
    console.warn(`❌ Post ${post.id} scheduled time is in the past`);
    console.warn(`❌ Scheduled: ${scheduledTime.toISOString()}, Current: ${now.toISOString()}`);
    return;
  }
  
  // Schedule new job
  console.log(`✅ SCHEDULING: Creating job for post ${post.id} at ${scheduledTime.toISOString()}`);
  activeJobs[post.id] = schedule.scheduleJob(scheduledTime, async () => {
    try {
      console.log(`🚀 EXECUTING SCHEDULED POST: ${post.id} at ${new Date().toISOString()}`);
      console.log(`🚀 IST TIME: ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`);
      
      // CRITICAL: Use atomic update to prevent race conditions with ReliableSchedulingService
      // This ensures only one scheduler can process the post at a time
      const [updatedPost] = await db
        .update(posts)
        .set({ status: 'publishing' })
        .where(and(eq(posts.id, post.id), eq(posts.status, 'scheduled')))
        .returning();
      
      // If no row was updated, another process already took this post
      if (!updatedPost) {
        console.log(`⚡ RACE CONDITION PREVENTED: Post ${post.id} already being processed by ReliableSchedulingService`);
        
        // Log this critical event for production monitoring
        await storage.createActivity({
          userId: post.userId || null,
          type: 'system_race_condition_prevented',
          description: `Race condition prevented: Post ${post.id} was already being processed by ReliableSchedulingService (Primary vs Backup)`,
          metadata: { 
            postId: post.id,
            preventedBy: 'PrimaryScheduler',
            originalScheduledTime: post.scheduledFor,
            attemptedAt: new Date().toISOString()
          }
        });
        return;
      }
      
      const currentPost = updatedPost;
      
      // Determine platform and publish accordingly
      const platform = (currentPost as any).platform || 'facebook';
      const platformName = platform === 'instagram' ? 'Instagram' : 'Facebook';
      
      console.log(`📝 PUBLISHING POST: "${currentPost.content}" to ${platformName}...`);
      
      // Platform-specific publishing
      let result;
      if (platform === 'instagram') {
        result = await publishPostToInstagram(currentPost);
      } else {
        result = await publishPostToFacebook(currentPost);
      }
      
      if (result.success) {
        // Update post status with platform-specific post ID
        const updateData: any = {
          status: 'published',
          publishedAt: new Date()
        };
        
        if (platform === 'facebook') {
          updateData.facebookPostId = result.data?.postId;
        } else if (platform === 'instagram') {
          updateData.instagramPostId = result.data?.instagramPostId;
        }
        
        await storage.updatePost(post.id, updateData);
        
        // Log activity
        await storage.createActivity({
          userId: currentPost.userId || null,
          type: 'post_published',
          description: `Scheduled post published to ${platformName}`,
          metadata: { postId: currentPost.id, platform }
        });
        
        console.log(`✅ Successfully published scheduled post ${post.id} to ${platformName}`);
      } else {
        // Handle failure
        await storage.updatePost(post.id, {
          status: 'failed',
          errorMessage: result.error || 'Unknown error during scheduled publication'
        });
        
        // Log activity
        await storage.createActivity({
          userId: currentPost.userId || null,
          type: 'post_failed',
          description: `Scheduled post failed to publish to ${platformName}`,
          metadata: { 
            postId: currentPost.id,
            platform,
            error: result.error
          }
        });
        
        console.error(`❌ Failed to publish scheduled post ${post.id} to ${platformName}:`, result.error);
      }
    } catch (error) {
      console.error(`Error executing scheduled post ${post.id}:`, error);
      
      try {
        // Update post status to failed
        await storage.updatePost(post.id, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error during scheduled publication'
        });
      } catch (updateError) {
        console.error(`Error updating post ${post.id} status:`, updateError);
      }
    } finally {
      // Remove the job from active jobs
      delete activeJobs[post.id];
    }
  });
  
  console.log(`✅ SCHEDULE SUCCESS: Post ${post.id} scheduled for publication at ${scheduledTime.toISOString()}`);
  console.log(`🎯 ACTIVE JOBS COUNT: ${Object.keys(activeJobs).length}`);
}

/**
 * Initialize scheduling for all scheduled posts
 * Call this when the server starts
 */
export async function initializeScheduledPosts(): Promise<void> {
  try {
    console.log('Initializing scheduled posts system...');
    
    // First, process any overdue posts that should have already been published
    await processOverduePosts();
    
    // Get all scheduled posts
    const scheduledPosts = await storage.getScheduledPosts();
    let scheduledCount = 0;
    
    // Schedule each post
    for (const post of scheduledPosts) {
      schedulePostPublication(post);
      scheduledCount++;
    }
    
    console.log(`Initialized ${scheduledCount} scheduled posts`);
    
    // Set up periodic check for overdue posts every 2 minutes
    setInterval(async () => {
      await processOverduePosts();
    }, 2 * 60 * 1000);
    
  } catch (error) {
    console.error("Error initializing scheduled posts:", error);
  }
}

/**
 * Process posts that should have already been published but are still scheduled
 */
async function processOverduePosts(): Promise<void> {
  try {
    const now = new Date();
    console.log(`🔍 CHECKING OVERDUE POSTS at ${now.toISOString()}`);
    
    // Get posts that are scheduled but past their scheduled time
    const overduePosts = await storage.getOverduePosts();
    
    if (overduePosts.length > 0) {
      console.log(`📋 Found ${overduePosts.length} overdue posts to publish immediately`);
      
      for (const post of overduePosts) {
        console.log(`⏰ PUBLISHING OVERDUE POST: ${post.id} (was scheduled for ${post.scheduledFor})`);
        console.log(`⏰ Content: "${post.content}"`);
        
        try {
          // CRITICAL: Use atomic update to prevent race conditions with ReliableSchedulingService
          // This ensures only one scheduler can process the post at a time
          const [updatedPost] = await db
            .update(posts)
            .set({ status: 'publishing' })
            .where(and(eq(posts.id, post.id), eq(posts.status, 'scheduled')))
            .returning();
          
          // If no row was updated, another process already took this post
          if (!updatedPost) {
            console.log(`⚡ RACE CONDITION PREVENTED: Post ${post.id} already being processed by ReliableSchedulingService`);
            
            // Log this critical event for production monitoring
            await storage.createActivity({
              userId: post.userId || null,
              type: 'system_race_condition_prevented',
              description: `Race condition prevented: Post ${post.id} was already being processed by ReliableSchedulingService (Backup vs Primary)`,
              metadata: { 
                postId: post.id,
                preventedBy: 'BackupScheduler',
                originalScheduledTime: post.scheduledFor,
                attemptedAt: new Date().toISOString()
              }
            });
            continue;
          }
          
          const result = await publishPostToFacebook(updatedPost);
          
          if (result.success) {
            await storage.updatePost(post.id, {
              status: 'published',
              publishedAt: new Date()
            });
            
            await storage.createActivity({
              userId: post.userId || null,
              type: 'post_published',
              description: `Overdue post published to Facebook`,
              metadata: { postId: post.id, wasOverdue: true }
            });
            
            console.log(`✅ Successfully published overdue post ${post.id}`);
          } else {
            await storage.updatePost(post.id, {
              status: 'failed',
              errorMessage: result.error || 'Failed to publish overdue post'
            });
            
            console.error(`❌ Failed to publish overdue post ${post.id}:`, result.error);
          }
        } catch (error) {
          console.error(`❌ Error publishing overdue post ${post.id}:`, error);
          
          try {
            await storage.updatePost(post.id, {
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : 'Unknown error'
            });
          } catch (updateError) {
            console.error(`Error updating failed post ${post.id}:`, updateError);
          }
        }
      }
    } else {
      console.log(`✅ No overdue posts found`);
    }
  } catch (error) {
    console.error('Error processing overdue posts:', error);
  }
}

/**
 * Handler for scheduled posts that failed to publish
 * This can be run periodically to retry failed posts
 */
export async function retryFailedPosts(): Promise<void> {
  try {
    // Get all failed posts directly
    const failedPosts = await storage.getFailedPosts();
    let retriedCount = 0;
    
    // Retry each failed post
    for (const post of failedPosts) {
      try {
        // Only retry posts that failed within the last 24 hours
        const failedAt = post.publishedAt || post.createdAt;
        if (!failedAt) continue; // Skip if no timestamp available
        
        const timeSinceFailed = Date.now() - new Date(failedAt).getTime();
        const hoursSinceFailed = timeSinceFailed / (1000 * 60 * 60);
        
        if (hoursSinceFailed <= 24) {
          await publishPostToFacebook(post);
          retriedCount++;
        }
      } catch (error) {
        console.error(`Error retrying failed post ${post.id}:`, error);
      }
    }
    
    console.log(`Retried ${retriedCount} failed posts`);
  } catch (error) {
    console.error("Error retrying failed posts:", error);
  }
}

/**
 * Cancel a scheduled post
 */
export async function cancelScheduledPost(postId: number): Promise<boolean> {
  try {
    if (activeJobs[postId]) {
      activeJobs[postId].cancel();
      delete activeJobs[postId];
      console.log(`Cancelled scheduled post ${postId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error cancelling scheduled post ${postId}:`, error);
    return false;
  }
}

/**
 * Get upcoming posts for the next N days
 */
export async function getUpcomingPostsForDays(userId: number, days: number = 7): Promise<Post[]> {
  const now = new Date();
  const endDate = new Date();
  endDate.setDate(now.getDate() + days);
  
  const allPosts = await storage.getPosts(userId);
  
  return allPosts.filter(post => {
    // Only include scheduled posts
    if (post.status !== 'scheduled') return false;
    
    // Check if post has a scheduled date
    if (!post.scheduledFor) return false;
    
    // Check if post is scheduled within the date range
    const scheduledDate = new Date(post.scheduledFor);
    return scheduledDate >= now && scheduledDate <= endDate;
  });
}

/**
 * Publish a post to Instagram
 * @param post The post to publish
 * @returns Result of the operation
 */
export async function publishPostToInstagram(post: Post): Promise<{success: boolean, data?: any, error?: string}> {
  try {
    const { InstagramService } = await import('./instagramService');
    
    // Verify post has Instagram data
    if (!post.instagramAccountId) {
      return { success: false, error: 'No Instagram account selected for this post' };
    }
    
    if (!post.content && !post.mediaUrl) {
      return { success: false, error: 'Post must have content or media' };
    }
    
    // Get the Instagram account
    const instagramAccount = await storage.getInstagramAccount(post.instagramAccountId);
    if (!instagramAccount) {
      return { success: false, error: 'Instagram account not found' };
    }
    
    if (!instagramAccount.accessToken) {
      return { success: false, error: 'Instagram account is not properly authenticated' };
    }
    
    console.log(`📸 Publishing post ${post.id} to Instagram: @${instagramAccount.username}`);
    console.log(`📝 Post mediaType: "${post.mediaType}" | mediaUrl: ${post.mediaUrl ? 'present' : 'none'}`);
    
    // Download media if needed (for Google Drive, Facebook, etc.)
    let mediaUrl = post.mediaUrl;
    let webdavPath: string | undefined;
    let localFilePath: string | undefined; // PRODUCTION FIX: Track local file for cleanup
    if (post.mediaUrl && !post.mediaUrl.startsWith('/tmp/')) {
      console.log('📥 Downloading media from external source...');
      const { InstagramMediaDownloader } = await import('./instagramMediaDownloader');
      
      // Determine media type hint for better download handling
      const mediaTypeHint = (post.mediaType === 'photo' || post.mediaType === 'image') ? 'image' : 'video';
      const downloadResult = await InstagramMediaDownloader.downloadMedia(post.mediaUrl, mediaTypeHint);
      
      if (!downloadResult.success || !downloadResult.filePath) {
        return {
          success: false,
          error: `Failed to download media: ${downloadResult.error || 'Unknown error'}`
        };
      }
      
      console.log(`✅ Media downloaded successfully: ${downloadResult.filePath}`);
      localFilePath = downloadResult.filePath; // PRODUCTION FIX: Store for cleanup
      
      // Use WebDAV public URL if available, otherwise create Replit public URL or use Cloudinary
      if (downloadResult.publicUrl) {
        mediaUrl = downloadResult.publicUrl;
        webdavPath = downloadResult.webdavPath;
        console.log(`🌐 Using WebDAV public URL: ${mediaUrl}`);
      } else {
        // Check if running locally (no Replit domain) - use Cloudinary
        const isLocalEnv = !process.env.REPLIT_DOMAINS && !process.env.REPLIT_DEV_DOMAIN;
        
        if (isLocalEnv && process.env.CLOUDINARY_CLOUD_NAME) {
          console.log('☁️ Local development - uploading to Cloudinary...');
          const cloudinaryMediaType = (post.mediaType === 'photo') ? 'image' : 'video';
          const cloudinaryUrl = await InstagramService.uploadToCloudinary(
            downloadResult.filePath,
            cloudinaryMediaType
          );
          
          if (cloudinaryUrl) {
            mediaUrl = cloudinaryUrl;
            console.log(`🌐 Using Cloudinary public URL: ${mediaUrl}`);
          } else {
            console.error('❌ Failed to upload to Cloudinary');
            return {
              success: false,
              error: 'Failed to upload media to Cloudinary for Instagram access'
            };
          }
        } else {
          // Fallback to Replit temp-media endpoint
          const filename = downloadResult.filePath.split('/').pop() || 'media';
          const replitDomain = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || 'localhost:5000';
          const protocol = (process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN) ? 'https' : 'http';
          mediaUrl = `${protocol}://${replitDomain}/temp-media/${filename}`;
          console.log(`🌐 Using Replit public URL: ${mediaUrl}`);
          
          // CRITICAL: Mark this file as protected from cleanup while Instagram processes it
          if (localFilePath) {
            const { tempFileManager } = await import('../utils/tempFileManager');
            tempFileManager.protectFile(localFilePath);
            console.log(`🛡️ Protected file from cleanup during Instagram processing: ${filename}`);
          }
        }
      }
    }
    
    // Determine media type for Instagram
    let instagramMediaType: 'IMAGE' | 'VIDEO' | 'REELS' | 'CAROUSEL_ALBUM' | 'STORIES' = 'IMAGE';
    const options: any = {
      caption: post.content,
    };
    
    if ((post.mediaType === 'photo' || post.mediaType === 'image') && mediaUrl) {
      instagramMediaType = 'IMAGE';
      options.imageUrl = mediaUrl;
    } else if (post.mediaType === 'video' && mediaUrl) {
      instagramMediaType = 'VIDEO';
      options.videoUrl = mediaUrl;
    } else if (post.mediaType === 'reel' && mediaUrl) {
      instagramMediaType = 'REELS';
      options.videoUrl = mediaUrl;
    }
    
    options.mediaType = instagramMediaType;
    
    // Use the complete publishing flow with automatic 20-minute timeout for videos/reels
    console.log('📸 Publishing to Instagram with automatic processing detection...');
    const publishResult = await InstagramService.publishPost(
      instagramAccount.businessAccountId,
      instagramAccount.accessToken,
      options
    );
    
    if (!publishResult.success) {
      console.error('❌ Failed to publish Instagram post:', publishResult.error);
      
      // PRODUCTION FIX: Unprotect and clean up local temp file on failure
      if (localFilePath) {
        try {
          const { tempFileManager } = await import('../utils/tempFileManager');
          const { InstagramMediaDownloader } = await import('./instagramMediaDownloader');
          
          tempFileManager.unprotectFile(localFilePath);
          console.log('🔓 Unprotected file from cleanup protection');
          
          InstagramMediaDownloader.cleanupFile(localFilePath);
          console.log('🧹 Cleaned up local temp file after failed publish');
        } catch (cleanupError) {
          console.warn('⚠️ Failed to cleanup local temp file:', cleanupError);
        }
      }
      
      // Clean up WebDAV file on failure
      if (webdavPath) {
        try {
          const { getWebDAVStorage } = await import('./webdavStorageService');
          await getWebDAVStorage().deleteFile(webdavPath);
          console.log('🧹 Cleaned up WebDAV file after failed publish');
        } catch (cleanupError) {
          console.warn('⚠️ Failed to cleanup WebDAV file:', cleanupError);
        }
      }
      
      return { 
        success: false, 
        error: publishResult.error || 'Failed to publish to Instagram' 
      };
    }
    
    console.log(`✅ Successfully published to Instagram! Post ID: ${publishResult.postId}`);
    
    // PRODUCTION FIX: Unprotect and clean up local temp file immediately after successful publish
    // File is already backed up to SFTP - no need to keep it locally
    if (localFilePath) {
      try {
        const { tempFileManager } = await import('../utils/tempFileManager');
        const { InstagramMediaDownloader } = await import('./instagramMediaDownloader');
        
        tempFileManager.unprotectFile(localFilePath);
        console.log('🔓 Unprotected file from cleanup protection');
        
        InstagramMediaDownloader.cleanupFile(localFilePath);
        console.log('🧹 Cleaned up local temp file after successful publish (saved disk space)');
      } catch (cleanupError) {
        console.warn('⚠️ Failed to cleanup local temp file:', cleanupError);
      }
    }
    
    // Clean up WebDAV file after successful publish
    if (webdavPath) {
      try {
        const { getWebDAVStorage } = await import('./webdavStorageService');
        await getWebDAVStorage().deleteFile(webdavPath);
        console.log('🧹 Cleaned up WebDAV file after successful publish');
      } catch (cleanupError) {
        console.warn('⚠️ Failed to cleanup WebDAV file:', cleanupError);
      }
    }
    
    return {
      success: true,
      data: {
        instagramPostId: publishResult.postId
      }
    };
    
  } catch (error) {
    console.error('Error publishing to Instagram:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Instagram publishing error'
    };
  }
}

// Export as a service object for use in other modules
export const postService = {
  publishPostToFacebook,
  publishPostToInstagram,
  schedulePostPublication,
  initializeScheduledPosts,
  retryFailedPosts,
  cancelScheduledPost,
  getUpcomingPostsForDays
};