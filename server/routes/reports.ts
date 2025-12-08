import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

// Get posts for reporting with detailed information
router.get('/posts', async (req, res) => {
  try {
    const userId = (req.session as any)?.userId || 3; // Default user for testing
    const { 
      dateRange, 
      status, 
      account, 
      contentBucket, 
      postType,
      platform,
      search,
      startDate,
      endDate
    } = req.query;

    console.log('📊 Fetching posts for reports with filters:', {
      userId,
      dateRange,
      status,
      account,
      contentBucket,
      postType,
      platform,
      search,
      startDate,
      endDate
    });

    // Get all posts for the user
    const posts = await storage.getAllPosts();
    
    // Get Facebook accounts to map account IDs to names
    const fbAccounts = await storage.getFacebookAccounts(userId);
    const accountMap = new Map(fbAccounts.map(acc => [acc.id, acc]));
    
    // Get Instagram accounts to map account IDs to names
    const igAccounts = await storage.getInstagramAccounts(userId);
    const instagramAccountMap = new Map(igAccounts.map(acc => [acc.id, acc]));

    // Get activities to find published information
    const activities = await storage.getActivities(userId);
    const publishedActivities = activities.filter(activity => 
      activity.type === 'post_published' && 
      activity.metadata && 
      typeof activity.metadata === 'object' &&
      'postId' in activity.metadata &&
      'facebookPostId' in activity.metadata
    );

    // Create a map of post ID to published activity
    const publishedMap = new Map();
    publishedActivities.forEach(activity => {
      if (activity.metadata && typeof activity.metadata === 'object' && 'postId' in activity.metadata) {
        const postId = (activity.metadata as any).postId;
        if (postId && !publishedMap.has(postId)) {
          publishedMap.set(postId, activity);
        }
      }
    });

    // Transform posts to include report data
    let reportPosts = posts.map(post => {
      const publishedActivity = publishedMap.get(post.id);
      const platform = post.platform || 'facebook';
      
      // Get account name based on platform
      let accountName = 'Unknown Account';
      let pageId = '';
      
      if (platform === 'instagram') {
        // For Instagram posts, look up in Instagram accounts
        const igAccount = post.instagramAccountId ? instagramAccountMap.get(post.instagramAccountId) : null;
        if (igAccount) {
          accountName = igAccount.username || igAccount.name || 'Instagram Account';
          pageId = igAccount.instagramBusinessAccountId || '';
        }
      } else {
        // For Facebook posts, look up in Facebook accounts
        const fbAccount = post.accountId ? accountMap.get(post.accountId) : null;
        if (fbAccount) {
          accountName = fbAccount.name || 'Facebook Page';
          pageId = fbAccount.pageId || '';
        }
      }
      
      return {
        id: post.id,
        accountId: post.accountId,
        instagramAccountId: post.instagramAccountId,
        platform: platform,
        content: post.content || '',
        createdAt: post.createdAt,
        publishedAt: publishedActivity?.createdAt || post.publishedAt,
        status: post.status,
        errorMessage: post.errorMessage,
        labels: post.labels || [],
        language: post.language || 'EN',
        mediaType: post.mediaType,
        accountName: accountName,
        pageId: pageId,
        facebookPostId: publishedActivity && publishedActivity.metadata && typeof publishedActivity.metadata === 'object' && 'facebookPostId' in publishedActivity.metadata ? (publishedActivity.metadata as any).facebookPostId : null
      };
    });

    // Apply date filters
    if (dateRange === 'custom' && startDate && endDate) {
      // Handle custom date range
      const filterStartDate = new Date(startDate as string);
      const filterEndDate = new Date(endDate as string);
      
      reportPosts = reportPosts.filter(post => {
        if (!post.createdAt) return false;
        const postDate = new Date(post.createdAt);
        return postDate >= filterStartDate && postDate <= filterEndDate;
      });
    } else if (dateRange && dateRange !== 'all') {
      // Handle preset date ranges
      const now = new Date();
      let filterStartDate: Date;
      
      switch (dateRange) {
        case 'today':
          filterStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          filterStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          filterStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          filterStartDate = new Date(0);
      }
      
      reportPosts = reportPosts.filter(post => 
        post.createdAt && new Date(post.createdAt) >= filterStartDate
      );
    }

    if (status && status !== 'all') {
      reportPosts = reportPosts.filter(post => post.status === status);
    }

    if (account && account !== 'all') {
      const accountParts = (account as string).split('-');
      if (accountParts.length >= 2) {
        const accountPlatform = accountParts[0];
        const accountId = parseInt(accountParts[1]);
        
        reportPosts = reportPosts.filter(post => {
          if (accountPlatform === 'instagram') {
            return post.platform === 'instagram' && post.instagramAccountId === accountId;
          } else {
            return post.platform === 'facebook' && post.accountId === accountId;
          }
        });
      }
    }

    if (contentBucket && contentBucket !== 'all') {
      reportPosts = reportPosts.filter(post => 
        post.labels.includes(contentBucket as string)
      );
    }

    // Helper function to determine post type
    const getPostType = (mediaType: string | null) => {
      if (!mediaType) return 'text';
      
      const type = mediaType.toLowerCase();
      if (type.includes('reel')) return 'reel';
      if (type.includes('video')) return 'video';
      if (type.includes('image') || type.includes('photo')) return 'photo';
      return 'text';
    };

    if (postType && postType !== 'all') {
      reportPosts = reportPosts.filter(post => {
        const actualPostType = getPostType(post.mediaType);
        return actualPostType === postType;
      });
    }

    if (platform && platform !== 'all') {
      reportPosts = reportPosts.filter(post => post.platform === platform);
    }

    if (search) {
      const searchTerm = (search as string).toLowerCase();
      reportPosts = reportPosts.filter(post => 
        post.content.toLowerCase().includes(searchTerm)
      );
    }

    // Sort by creation date (newest first)
    reportPosts.sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt) : new Date(0);
      const bDate = b.createdAt ? new Date(b.createdAt) : new Date(0);
      return bDate.getTime() - aDate.getTime();
    });

    console.log(`📊 Returning ${reportPosts.length} posts for reports`);
    res.json(reportPosts);

  } catch (error) {
    console.error('❌ Error fetching posts for reports:', error);
    res.status(500).json({ 
      error: 'Failed to fetch posts for reports',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get summary statistics for reports
router.get('/stats', async (req, res) => {
  try {
    const userId = (req.session as any)?.userId || 3;
    
    // Get posts and activities
    const posts = await storage.getAllPosts();
    const activities = await storage.getActivities(userId);
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calculate stats
    const stats = {
      total: posts.length,
      published: posts.filter(p => p.status === 'published').length,
      failed: posts.filter(p => p.status === 'failed').length,
      scheduled: posts.filter(p => p.status === 'scheduled').length,
      today: posts.filter(p => p.createdAt && new Date(p.createdAt) >= today).length,
      thisWeek: posts.filter(p => p.createdAt && new Date(p.createdAt) >= thisWeek).length,
      thisMonth: posts.filter(p => p.createdAt && new Date(p.createdAt) >= thisMonth).length,
      publishedToday: activities.filter(a => 
        a.type === 'post_published' && 
        a.createdAt && new Date(a.createdAt) >= today
      ).length
    };

    res.json(stats);

  } catch (error) {
    console.error('❌ Error fetching report stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch report statistics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as reportsRouter };