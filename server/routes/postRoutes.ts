import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { insertPostSchema } from '@shared/schema';
import { isAuthenticated } from '../auth';
import * as postService from '../services/postService';

const router = Router();

/**
 * Get all posts for the authenticated user
 */
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const posts = await req.storage.getPosts(userId);
    res.json(posts);
  } catch (error) {
    console.error('Error getting posts:', error);
    res.status(500).json({ error: 'Failed to retrieve posts' });
  }
});

/**
 * Get upcoming scheduled posts
 */
router.get('/upcoming', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const posts = await req.storage.getUpcomingPosts(userId);
    res.json(posts);
  } catch (error) {
    console.error('Error getting upcoming posts:', error);
    res.status(500).json({ error: 'Failed to retrieve upcoming posts' });
  }
});

/**
 * Get a single post by ID
 */
router.get('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }
    
    const post = await req.storage.getPost(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Verify user has access to this post
    if (post.userId !== req.user?.id) {
      return res.status(403).json({ error: 'Not authorized to access this post' });
    }
    
    res.json(post);
  } catch (error) {
    console.error('Error getting post:', error);
    res.status(500).json({ error: 'Failed to retrieve post' });
  }
});

/**
 * Create a new post
 */
router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Validate post data
    const postSchema = insertPostSchema.extend({
      accountId: z.number().positive().or(z.null()).optional(),
      scheduledFor: z.string().optional().transform(date => date ? new Date(date) : undefined),
      labels: z.array(z.string()).or(z.string().transform(str => JSON.parse(str))).optional(),
    });
    
    const validatedData = postSchema.parse(req.body);
    
    // Validate scheduled time is not in the past
    if (validatedData.scheduledFor) {
      const now = new Date();
      const scheduledTime = new Date(validatedData.scheduledFor);
      if (scheduledTime <= now) {
        const timeDiff = Math.floor((now.getTime() - scheduledTime.getTime()) / (1000 * 60));
        console.log(`❌ CREATE VALIDATION ERROR: Scheduled time is ${timeDiff} minutes in the past`);
        console.log(`❌ Requested: ${scheduledTime.toISOString()}, Current: ${now.toISOString()}`);
        return res.status(400).json({ 
          error: 'Scheduled time cannot be in the past',
          details: `The scheduled time is ${timeDiff} minutes in the past. Please choose a future time.`
        });
      }
    }
    
    // Create post with default values
    const postData = {
      ...validatedData,
      userId,
      status: validatedData.scheduledFor ? 'scheduled' : 'draft',
      labels: Array.isArray(validatedData.labels) ? validatedData.labels : [],
    };
    
    const post = await req.storage.createPost(postData);
    
    // If post is scheduled, set up scheduling
    if (post.status === 'scheduled' && post.scheduledFor) {
      await postService.schedulePostPublication(post);
    }
    
    // Log activity
    await req.storage.createActivity({
      userId,
      type: 'post_created',
      description: `Created a new ${post.status} post`,
      metadata: { postId: post.id }
    });
    
    res.status(201).json(post);
  } catch (error) {
    console.error('Error creating post:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid post data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create post' });
  }
});

/**
 * Update an existing post
 */
router.put('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    if (isNaN(postId)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }
    
    // Check if post exists and belongs to the user
    const existingPost = await req.storage.getPost(postId);
    if (!existingPost) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    if (existingPost.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this post' });
    }
    
    // Validate update data
    const updateSchema = z.object({
      content: z.string().optional(),
      accountId: z.number().positive().or(z.null()).optional(),
      mediaUrl: z.string().url().or(z.null()).optional(),
      link: z.string().url().or(z.null()).optional(),
      status: z.enum(['draft', 'scheduled', 'published', 'failed']).optional(),
      labels: z.array(z.string()).or(z.string().transform(str => JSON.parse(str))).optional(),
      language: z.string().optional(),
      scheduledFor: z.string().optional().transform(date => date ? new Date(date) : undefined),
    });
    
    const validatedData = updateSchema.parse(req.body);
    
    // Validate scheduled time is not in the past
    if (validatedData.scheduledFor) {
      const now = new Date();
      const scheduledTime = new Date(validatedData.scheduledFor);
      if (scheduledTime <= now) {
        const timeDiff = Math.floor((now.getTime() - scheduledTime.getTime()) / (1000 * 60));
        console.log(`❌ VALIDATION ERROR: Scheduled time is ${timeDiff} minutes in the past`);
        console.log(`❌ Requested: ${scheduledTime.toISOString()}, Current: ${now.toISOString()}`);
        return res.status(400).json({ 
          error: 'Scheduled time cannot be in the past',
          details: `The scheduled time is ${timeDiff} minutes in the past. Please choose a future time.`
        });
      }
    }
    
    // Handle scheduling changes
    let wasScheduled = existingPost.status === 'scheduled';
    let isNowScheduled = validatedData.status === 'scheduled' || 
      (existingPost.status === 'scheduled' && validatedData.status === undefined);
    
    // Prepare update data
    const updateData: any = { ...validatedData };
    
    // Handle labels specifically to ensure correct format
    if (validatedData.labels) {
      updateData.labels = Array.isArray(validatedData.labels) ? validatedData.labels : [];
    }
    
    // Update post
    const updatedPost = await req.storage.updatePost(postId, updateData);
    if (!updatedPost) {
      return res.status(404).json({ error: 'Post not found after update' });
    }
    
    // Handle scheduling changes
    if (!wasScheduled && isNowScheduled && updatedPost.scheduledFor) {
      // Post newly scheduled
      console.log(`📅 SCHEDULING: Post ${updatedPost.id} newly scheduled for ${updatedPost.scheduledFor}`);
      await postService.schedulePostPublication(updatedPost);
    } else if (wasScheduled && isNowScheduled && updatedPost.scheduledFor) {
      // Post was already scheduled - check if time changed
      const oldTime = existingPost.scheduledFor;
      const newTime = updatedPost.scheduledFor;
      
      if (oldTime && newTime && oldTime.getTime() !== newTime.getTime()) {
        // Scheduled time changed - reschedule
        console.log(`🔄 RESCHEDULING: Post ${updatedPost.id} time changed from ${oldTime.toISOString()} to ${newTime.toISOString()}`);
        await postService.schedulePostPublication(updatedPost);
      }
    } else if (wasScheduled && !isNowScheduled) {
      // Post was unscheduled - cancel existing job
      console.log(`❌ UNSCHEDULING: Post ${updatedPost.id} no longer scheduled`);
      await postService.cancelScheduledPost(updatedPost.id);
    }
    
    // Log activity
    await req.storage.createActivity({
      userId,
      type: 'post_updated',
      description: `Updated ${updatedPost.status} post`,
      metadata: { postId: updatedPost.id }
    });
    
    res.json(updatedPost);
  } catch (error) {
    console.error('Error updating post:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid post data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update post' });
  }
});

/**
 * Delete a post
 */
router.delete('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    if (isNaN(postId)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }
    
    // Check if post exists and belongs to the user
    const existingPost = await req.storage.getPost(postId);
    if (!existingPost) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    if (existingPost.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }
    
    // Cancel scheduling if post is scheduled
    if (existingPost.status === 'scheduled') {
      await postService.cancelScheduledPost(postId);
    }
    
    // Delete the post
    const success = await req.storage.deletePost(postId);
    if (!success) {
      return res.status(500).json({ error: 'Failed to delete post' });
    }
    
    // Log activity
    await req.storage.createActivity({
      userId,
      type: 'post_deleted',
      description: `Deleted ${existingPost.status} post`,
      metadata: { postContent: existingPost.content.substring(0, 50) }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

/**
 * Publish a post immediately
 */
router.post('/:id/publish', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    if (isNaN(postId)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }
    
    // Check if post exists and belongs to the user
    const existingPost = await req.storage.getPost(postId);
    if (!existingPost) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    if (existingPost.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to publish this post' });
    }
    
    // Don't allow publishing already published posts
    if (existingPost.status === 'published') {
      return res.status(400).json({ error: 'Post is already published' });
    }
    
    // Publish the post
    const result = await postService.publishPostToFacebook(existingPost);
    
    if (result.success) {
      // Update post status
      const updatedPost = await req.storage.updatePost(postId, {
        status: 'published',
        publishedAt: new Date()
      });
      
      // Log activity
      await req.storage.createActivity({
        userId,
        type: 'post_published',
        description: 'Published post immediately',
        metadata: { postId: existingPost.id }
      });
      
      res.json({ 
        success: true, 
        post: updatedPost,
        publishResult: result.data
      });
    } else {
      // Handle publication failure
      await req.storage.updatePost(postId, {
        status: 'failed',
        errorMessage: result.error || 'Unknown error occurred during publication'
      });
      
      // Log activity
      await req.storage.createActivity({
        userId,
        type: 'post_failed',
        description: 'Failed to publish post',
        metadata: { 
          postId: existingPost.id,
          error: result.error
        }
      });
      
      res.status(500).json({ 
        success: false, 
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error publishing post:', error);
    res.status(500).json({ error: 'Failed to publish post' });
  }
});

/**
 * Retry failed posts
 */
router.post('/retry-failed', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Get all failed posts for this user
    const failedPosts = await req.storage.getPosts(userId).then(posts => 
      posts.filter(post => post.status === 'failed')
    );
    
    if (failedPosts.length === 0) {
      return res.json({ message: 'No failed posts to retry', retriedCount: 0 });
    }
    
    let successCount = 0;
    const results = [];
    
    // Try to publish each failed post
    for (const post of failedPosts) {
      try {
        const result = await postService.publishPostToFacebook(post);
        
        if (result.success) {
          // Update post status
          await req.storage.updatePost(post.id, {
            status: 'published',
            publishedAt: new Date(),
            errorMessage: null
          });
          
          successCount++;
          results.push({ 
            postId: post.id, 
            success: true 
          });
        } else {
          // Update error message
          await req.storage.updatePost(post.id, {
            errorMessage: result.error || 'Unknown error occurred during publication'
          });
          
          results.push({ 
            postId: post.id, 
            success: false, 
            error: result.error 
          });
        }
      } catch (error) {
        console.error(`Error retrying post ${post.id}:`, error);
        results.push({ 
          postId: post.id, 
          success: false, 
          error: 'Internal server error during retry' 
        });
      }
    }
    
    // Log activity
    await req.storage.createActivity({
      userId,
      type: 'posts_retried',
      description: `Retried ${failedPosts.length} failed posts, ${successCount} succeeded`,
      metadata: { results }
    });
    
    res.json({ 
      message: `Retried ${failedPosts.length} posts, ${successCount} succeeded`,
      retriedCount: failedPosts.length,
      successCount,
      results
    });
  } catch (error) {
    console.error('Error retrying failed posts:', error);
    res.status(500).json({ error: 'Failed to retry posts' });
  }
});

export default router;