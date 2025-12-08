import { IStorage } from '../server/storage';
import type { User } from '../shared/schema';

declare global {
  namespace Express {
    interface Request {
      storage: IStorage;
      user?: User;
    }
  }
}