export interface FacebookAccount {
  id: number;
  userId: number;
  name: string;
  pageId: string;
  accessToken: string;
  isActive: boolean;
  createdAt: Date;
}

export interface User {
  id: number;
  username: string;
  email: string;
  fullName?: string;
  facebookId?: string;
  facebookToken?: string;
  createdAt: Date;
}