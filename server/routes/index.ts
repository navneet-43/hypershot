import { Router } from 'express';
import postRoutes from './postRoutes';

const router = Router();

// Register all routes
router.use('/posts', postRoutes);

export default router;