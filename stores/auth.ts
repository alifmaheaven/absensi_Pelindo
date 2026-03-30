// src/store/auth.store.ts
import { IUser } from "@/types";
import { create } from "zustand";

type AuthState = {
  user: IUser | null;
  setUser: (user: IUser) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
}));
