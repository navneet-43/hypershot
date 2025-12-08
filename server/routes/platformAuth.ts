import { Request, Response, Router } from 'express';
import session from 'express-session';
import { AuthService } from '../services/authService';
import { loginSchema, registerSchema } from '@shared/schema';
import { z } from 'zod';

const router = Router();

// Session middleware
export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
});

// Middleware to check authentication
export function requireAuth(req: Request, res: Response, next: Function) {
  if (req.session && (req.session as any).userId) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
}

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    const result = await AuthService.register(validatedData);

    if (result.success && result.user) {
      // Auto-login after registration
      (req.session as any).userId = result.user.id;
      (req.session as any).user = {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        fullName: result.user.fullName,
        role: result.user.role
      };

      res.json({
        success: true,
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          fullName: result.user.fullName,
          role: result.user.role
        }
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.errors[0].message });
    } else {
      console.error('Registration error:', error);
      res.status(500).json({ success: false, error: 'Registration failed' });
    }
  }
});

// Login user
router.post('/login', async (req: Request, res: Response) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const result = await AuthService.login(validatedData);

    if (result.success && result.user) {
      (req.session as any).userId = result.user.id;
      (req.session as any).user = {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        fullName: result.user.fullName,
        role: result.user.role
      };

      res.json({
        success: true,
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          fullName: result.user.fullName,
          role: result.user.role
        }
      });
    } else {
      res.status(401).json({ success: false, error: result.error });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: error.errors[0].message });
    } else {
      console.error('Login error:', error);
      res.status(500).json({ success: false, error: 'Login failed' });
    }
  }
});

// Get current user status
router.get('/status', (req: Request, res: Response) => {
  if (req.session && (req.session as any).userId) {
    res.json({
      isAuthenticated: true,
      user: (req.session as any).user
    });
  } else {
    res.json({
      isAuthenticated: false,
      user: null
    });
  }
});

// Logout user
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      res.status(500).json({ success: false, error: 'Logout failed' });
    } else {
      res.clearCookie('connect.sid');
      res.json({ success: true });
    }
  });
});

// Update user profile
router.put('/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.session as any).userId;
    const { fullName, email } = req.body;

    const result = await AuthService.updateUserProfile(userId, { fullName, email });

    if (result.success) {
      // Update session data
      (req.session as any).user.fullName = fullName;
      (req.session as any).user.email = email;

      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, error: 'Profile update failed' });
  }
});

// Change password
router.put('/password', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.session as any).userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
    }

    const result = await AuthService.changePassword(userId, currentPassword, newPassword);

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ success: false, error: 'Password change failed' });
  }
});

// Get team members (admin only)
router.get('/team', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const teamMembers = await AuthService.getTeamMembers();
    
    // Remove sensitive data
    const sanitizedMembers = teamMembers.map(member => ({
      id: member.id,
      username: member.username,
      email: member.email,
      fullName: member.fullName,
      role: member.role,
      isActive: member.isActive,
      lastLoginAt: member.lastLoginAt,
      createdAt: member.createdAt
    }));

    res.json(sanitizedMembers);
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// Deactivate user (admin only)
router.put('/team/:id/deactivate', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req.session as any).user;
    const targetUserId = parseInt(req.params.id);

    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (user.id === targetUserId) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const result = await AuthService.deactivateUser(targetUserId, user.id);

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ success: false, error: 'User deactivation failed' });
  }
});

export default router;