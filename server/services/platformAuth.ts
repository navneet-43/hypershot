import bcrypt from 'bcrypt';
import { storage } from '../storage';
import { 
  type PlatformUser, 
  type InsertPlatformUser,
  type LoginCredentials,
  type RegisterData,
  loginSchema,
  registerSchema
} from '../../shared/schema';

export class PlatformAuthService {
  private static readonly SALT_ROUNDS = 12;

  // Register a new platform user
  static async register(data: RegisterData): Promise<{ success: true; user: PlatformUser } | { success: false; error: string }> {
    try {
      // Validate input data
      const validation = registerSchema.safeParse(data);
      if (!validation.success) {
        return { success: false, error: 'Invalid registration data' };
      }

      const { username, email, password, fullName } = validation.data;

      // Check if username already exists
      const existingUser = await storage.getPlatformUserByUsername(username);
      if (existingUser) {
        return { success: false, error: 'Username already exists' };
      }

      // Check if email already exists
      const existingEmail = await storage.getPlatformUserByEmail(email);
      if (existingEmail) {
        return { success: false, error: 'Email already exists' };
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);

      // Create user
      const userData: InsertPlatformUser = {
        username,
        email,
        password: hashedPassword,
        fullName,
        role: 'user'
      };

      const user = await storage.createPlatformUser(userData);
      return { success: true, user };

    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Failed to register user' };
    }
  }

  // Login platform user
  static async login(credentials: LoginCredentials): Promise<{ success: true; user: PlatformUser } | { success: false; error: string }> {
    try {
      // Validate input data
      const validation = loginSchema.safeParse(credentials);
      if (!validation.success) {
        return { success: false, error: 'Invalid login credentials' };
      }

      const { username, password } = validation.data;

      // Find user by username
      const user = await storage.getPlatformUserByUsername(username);
      if (!user) {
        return { success: false, error: 'Invalid username or password' };
      }

      // Check if user is active
      if (!user.isActive) {
        return { success: false, error: 'Account is deactivated' };
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return { success: false, error: 'Invalid username or password' };
      }

      // Update last login time
      await storage.updatePlatformUserLastLogin(user.id);

      return { success: true, user };

    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Login failed' };
    }
  }

  // Get user by ID
  static async getUserById(id: number): Promise<PlatformUser | null> {
    try {
      const user = await storage.getPlatformUser(id);
      return user || null;
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  // Update user profile
  static async updateProfile(userId: number, data: Partial<PlatformUser>): Promise<{ success: true; user: PlatformUser } | { success: false; error: string }> {
    try {
      // Remove sensitive fields that shouldn't be updated directly
      const { password, id, createdAt, ...updateData } = data;
      
      const updatedUser = await storage.updatePlatformUser(userId, updateData);
      if (!updatedUser) {
        return { success: false, error: 'User not found' };
      }

      return { success: true, user: updatedUser };

    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: 'Failed to update profile' };
    }
  }

  // Change password
  static async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<{ success: true } | { success: false; error: string }> {
    try {
      const user = await storage.getPlatformUser(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return { success: false, error: 'Current password is incorrect' };
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

      // Update password
      await storage.updatePlatformUser(userId, { password: hashedNewPassword });

      return { success: true };

    } catch (error) {
      console.error('Change password error:', error);
      return { success: false, error: 'Failed to change password' };
    }
  }
}