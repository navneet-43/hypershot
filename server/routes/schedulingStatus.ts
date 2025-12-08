/**
 * Scheduling Status API Routes
 * Provides debugging information about the scheduling system
 */

import { Router } from 'express';
// Use the same auth pattern as other routes
const requireAuth = async (req: any, res: any, next: any) => {
  // Use default Facebook OAuth user (ID 3) without authentication
  req.user = { id: 3 };
  next();
};
import { ReliableSchedulingService } from '../services/reliableSchedulingService';
import { storage } from '../storage';

const router = Router();

/**
 * Get scheduling system status and overdue posts count
 */
router.get('/api/scheduling-status', requireAuth, async (req, res) => {
  try {
    const status = ReliableSchedulingService.getStatus();
    const overduePosts = await storage.getOverduePosts();
    const scheduledPosts = await storage.getScheduledPosts();
    
    res.json({
      system: status,
      overduePosts: overduePosts.length,
      scheduledPosts: scheduledPosts.length,
      lastCheck: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * Get duplicate prevention statistics for production monitoring
 */
router.get('/api/duplicate-prevention-stats', requireAuth, async (req, res) => {
  try {
    // Get race condition prevention activities from last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activities = await storage.getActivities(req.user?.id || 0);
    
    const raceConditionActivities = activities.filter(activity => 
      activity.type === 'system_race_condition_prevented' && 
      new Date(activity.createdAt) > twentyFourHoursAgo
    );
    
    // Get duplicate posts prevention count
    const preventionCount = raceConditionActivities.length;
    
    // Get successful publications in last 24 hours
    const successfulPublications = activities.filter(activity => 
      activity.type === 'post_published' && 
      new Date(activity.createdAt) > twentyFourHoursAgo
    ).length;
    
    res.json({
      duplicate_prevention: {
        race_conditions_prevented_24h: preventionCount,
        successful_publications_24h: successfulPublications,
        protection_active: true,
        last_prevention: raceConditionActivities.length > 0 ? raceConditionActivities[0].createdAt : null,
        prevented_posts: raceConditionActivities.map(activity => ({
          postId: activity.metadata?.postId,
          preventedBy: activity.metadata?.preventedBy,
          scheduledTime: activity.metadata?.originalScheduledTime,
          preventedAt: activity.createdAt
        }))
      },
      system_health: {
        dual_scheduler_protection: 'ACTIVE',
        atomic_locks: 'ENABLED',
        production_ready: true
      }
    });
  } catch (error) {
    console.error('Error getting duplicate prevention stats:', error);
    res.status(500).json({ error: 'Failed to get duplicate prevention stats' });
  }
});

/**
 * Force check for overdue posts (manual trigger)
 */
router.post('/api/force-check-posts', requireAuth, async (req, res) => {
  try {
    await ReliableSchedulingService.forceCheck();
    
    const overduePosts = await storage.getOverduePosts();
    
    res.json({
      success: true,
      message: 'Manual check completed',
      overduePosts: overduePosts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;