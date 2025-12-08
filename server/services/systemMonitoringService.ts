/**
 * System Monitoring Service
 * Tracks server health and identifies system interruptions
 */

import { storage } from '../storage';

export class SystemMonitoringService {
  private static heartbeatInterval: NodeJS.Timeout | null = null;
  private static lastHeartbeat: Date = new Date();

  /**
   * Initialize system monitoring
   */
  static async initialize(): Promise<void> {
    console.log('💓 INITIALIZING SYSTEM MONITORING...');
    
    // Record system startup
    try {
      await storage.createActivity({
        userId: null,
        type: 'system_startup',
        description: 'System monitoring service initialized',
        metadata: { 
          startupTime: new Date().toISOString(),
          checkInterval: 15
        }
      });
    } catch (error) {
      console.error('Failed to log system startup:', error);
    }
    
    // Set up heartbeat monitoring every minute
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(async () => {
      await this.recordHeartbeat();
    }, 60 * 1000); // Every minute
    
    this.lastHeartbeat = new Date();
    console.log('✅ SYSTEM MONITORING INITIALIZED');
  }

  /**
   * Record system heartbeat
   */
  private static async recordHeartbeat(): Promise<void> {
    const now = new Date();
    const timeSinceLastHeartbeat = now.getTime() - this.lastHeartbeat.getTime();
    const expectedInterval = 60 * 1000; // 60 seconds
    const tolerance = 10 * 1000; // 10 seconds tolerance
    
    // Detect if there was a gap (possible system restart/sleep)
    if (timeSinceLastHeartbeat > expectedInterval + tolerance) {
      const gapMinutes = Math.floor(timeSinceLastHeartbeat / 60000);
      console.log(`🚨 SYSTEM GAP DETECTED: ${gapMinutes} minutes since last heartbeat - possible restart/sleep`);
      
      try {
        await storage.createActivity({
          userId: null,
          type: 'system_gap',
          description: `System gap detected: ${gapMinutes} minutes`,
          metadata: { 
            gapMinutes,
            lastHeartbeat: this.lastHeartbeat.toISOString(),
            currentTime: now.toISOString(),
            possibleCause: gapMinutes > 30 ? 'server_sleep' : 'system_restart'
          }
        });
      } catch (error) {
        console.error('Failed to log system gap:', error);
      }
    }
    
    this.lastHeartbeat = now;
  }

  /**
   * Get system health status
   */
  static getHealthStatus(): {
    isHealthy: boolean;
    lastHeartbeat: Date;
    uptimeMinutes: number;
  } {
    const now = new Date();
    const timeSinceHeartbeat = now.getTime() - this.lastHeartbeat.getTime();
    const uptimeMinutes = Math.floor(timeSinceHeartbeat / 60000);
    
    return {
      isHealthy: timeSinceHeartbeat < 120000, // Healthy if heartbeat within 2 minutes
      lastHeartbeat: this.lastHeartbeat,
      uptimeMinutes
    };
  }

  /**
   * Shutdown monitoring
   */
  static shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    console.log('🛑 SYSTEM MONITORING SHUTDOWN');
  }
}