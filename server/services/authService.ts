import bcrypt from 'bcrypt';
import { storage } from '../storage';
import { PlatformUser, InsertPlatformUser, LoginCredentials, RegisterData } from '@shared/schema';

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  static async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(password, hashedPassword);
  }

  static async register(userData: RegisterData): Promise<{ success: boolean; user?: PlatformUser; error?: string }> {
    try {
      // Check if username already exists
      const existingUserByUsername = await storage.getPlatformUserByUsername(userData.username);
      if (existingUserByUsername) {
        return { success: false, error: 'Username already exists' };
      }

      // Check if email already exists
      const existingUserByEmail = await storage.getPlatformUserByEmail(userData.email);
      if (existingUserByEmail) {
        return { success: false, error: 'Email already exists' };
      }

      // Hash password
      const hashedPassword = await this.hashPassword(userData.password);

      // Create user
      const newUser: InsertPlatformUser = {
        username: userData.username,
        password: hashedPassword,
        email: userData.email,
        fullName: userData.fullName,
        role: 'user'
      };

      const user = await storage.createPlatformUser(newUser);
      
      // Log activity
      await storage.createActivity({
        userId: null,
        type: 'user_registered',
        description: `New team member registered: ${userData.fullName} (@${userData.username})`,
        metadata: { userId: user.id, username: userData.username }
      });

      return { success: true, user };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Registration failed. Please try again.' };
    }
  }

  static async login(credentials: LoginCredentials): Promise<{ success: boolean; user?: PlatformUser; error?: string }> {
    try {
      // Find user by username
      const user = await storage.getPlatformUserByUsername(credentials.username);
      if (!user) {
        return { success: false, error: 'Invalid username or password' };
      }

      // Check if user is active
      if (!user.isActive) {
        return { success: false, error: 'Account is deactivated. Please contact your administrator.' };
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(credentials.password, user.password);
      if (!isValidPassword) {
        return { success: false, error: 'Invalid username or password' };
      }

      // Update last login
      await storage.updatePlatformUser(user.id, { 
        lastLoginAt: new Date() 
      });

      // Log activity
      await storage.createActivity({
        userId: user.id,
        type: 'user_login',
        description: `${user.fullName} logged into the dashboard`,
        metadata: { username: user.username }
      });

      return { success: true, user };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Login failed. Please try again.' };
    }
  }

  static async getUserById(id: number): Promise<PlatformUser | null> {
    try {
      const user = await storage.getPlatformUser(id);
      return user || null;
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  static async updateUserProfile(userId: number, updates: Partial<PlatformUser>): Promise<{ success: boolean; error?: string }> {
    try {
      const allowedUpdates = ['fullName', 'email'];
      const filteredUpdates: any = {};
      
      for (const key of allowedUpdates) {
        if (updates[key as keyof PlatformUser] !== undefined) {
          filteredUpdates[key] = updates[key as keyof PlatformUser];
        }
      }

      if (Object.keys(filteredUpdates).length === 0) {
        return { success: false, error: 'No valid updates provided' };
      }

      filteredUpdates.updatedAt = new Date();
      await storage.updatePlatformUser(userId, filteredUpdates);
      
      return { success: true };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: 'Profile update failed' };
    }
  }

  static async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await storage.getPlatformUser(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Verify current password
      const isValidPassword = await this.verifyPassword(currentPassword, user.password);
      if (!isValidPassword) {
        return { success: false, error: 'Current password is incorrect' };
      }

      // Hash new password
      const hashedNewPassword = await this.hashPassword(newPassword);
      
      // Update password
      await storage.updatePlatformUser(userId, { 
        password: hashedNewPassword,
        updatedAt: new Date()
      });

      // Log activity
      await storage.createActivity({
        userId: userId,
        type: 'password_changed',
        description: `${user.fullName} changed their password`,
        metadata: { username: user.username }
      });

      return { success: true };
    } catch (error) {
      console.error('Change password error:', error);
      return { success: false, error: 'Password change failed' };
    }
  }

  static async getTeamMembers(): Promise<PlatformUser[]> {
    try {
      return await storage.getAllPlatformUsers();
    } catch (error) {
      console.error('Get team members error:', error);
      return [];
    }
  }

  static async deactivateUser(userId: number, adminId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = await storage.getPlatformUser(adminId);
      if (!admin || admin.role !== 'admin') {
        return { success: false, error: 'Unauthorized' };
      }

      const user = await storage.getPlatformUser(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      await storage.updatePlatformUser(userId, { 
        isActive: false,
        updatedAt: new Date()
      });

      // Log activity
      await storage.createActivity({
        userId: adminId,
        type: 'user_deactivated',
        description: `${admin.fullName} deactivated user: ${user.fullName}`,
        metadata: { targetUserId: userId, targetUsername: user.username }
      });

      return { success: true };
    } catch (error) {
      console.error('Deactivate user error:', error);
      return { success: false, error: 'User deactivation failed' };
    }
  }
}