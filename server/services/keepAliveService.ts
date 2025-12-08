/**
 * Keep Alive Service
 * Prevents Replit server sleep by maintaining activity
 */

import fetch from 'node-fetch';

export class KeepAliveService {
  private static pingInterval: NodeJS.Timeout | null = null;
  private static healthInterval: NodeJS.Timeout | null = null;
  private static activityInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize keep-alive service
   */
  static async initialize(): Promise<void> {
    console.log('🔄 INITIALIZING KEEP-ALIVE SERVICE...');
    
    // Get the Replit domain for self-pinging
    const replitDomain = process.env.REPLIT_DOMAINS;
    if (!replitDomain) {
      console.log('⚠️ REPLIT_DOMAINS not found - using localhost for keep-alive');
    }
    
    const baseUrl = replitDomain ? `https://${replitDomain}` : 'http://localhost:5000';
    
    // EXTREME KEEP-ALIVE: Self-ping every 30 seconds to prevent sleep
    this.pingInterval = setInterval(async () => {
      try {
        const response = await fetch(`${baseUrl}/api/health`, {
          method: 'GET'
        });
        
        if (response.ok) {
          console.log('🏓 Keep-alive ping successful');
        } else {
          console.log('⚠️ Keep-alive ping failed:', response.status);
        }
      } catch (error) {
        console.log('⚠️ Keep-alive ping error:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, 30 * 1000); // Every 30 seconds - Balanced for production reliability
    
    // Additional health check every 45 seconds with scheduling status
    this.healthInterval = setInterval(async () => {
      try {
        const response = await fetch(`${baseUrl}/api/scheduling-status`, {
          method: 'GET'
        });
        
        if (response.ok) {
          console.log('💚 Health check passed');
        }
      } catch (error) {
        console.log('⚠️ Health check failed:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, 45 * 1000); // Every 45 seconds - Reduced to prevent DB overload
    
    // EXTREME MEASURE: Create constant activity to prevent any sleep
    this.activityInterval = setInterval(() => {
      // Small CPU activity to keep system awake
      const start = Date.now();
      while (Date.now() - start < 2) {
        // Tiny calculation to maintain activity
        Math.random() * Math.PI;
      }
      // Also log to keep I/O active
      console.log('🤖 Background activity pulse');
    }, 20 * 1000); // Every 20 seconds - Optimized for production
    
    console.log('✅ KEEP-ALIVE SERVICE INITIALIZED - PRODUCTION MODE: 30s pings + 45s health checks + 20s activity pulses');
  }

  /**
   * Shutdown keep-alive service
   */
  static shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
    
    if (this.activityInterval) {
      clearInterval(this.activityInterval);
      this.activityInterval = null;
    }
    
    console.log('🛑 KEEP-ALIVE SERVICE SHUTDOWN');
  }

  /**
   * Manual ping trigger
   */
  static async ping(): Promise<boolean> {
    try {
      const replitDomain = process.env.REPLIT_DOMAINS;
      const baseUrl = replitDomain ? `https://${replitDomain}` : 'http://localhost:5000';
      
      const response = await fetch(`${baseUrl}/api/health`, {
        method: 'GET'
      });
      
      return response.ok;
    } catch (error) {
      console.error('Manual ping failed:', error);
      return false;
    }
  }
}