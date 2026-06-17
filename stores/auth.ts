// src/store/auth.store.ts
import { removeToken, removeCheckInId, removeVersionCode } from "@/lib/storage";
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
  logout: () => {
    // Reset state user
    set({ user: null });

    // Bersihkan semua persisted storage dari auth
    // Gunakan Promise agar tidak blocking UI
    Promise.all([
      removeToken(),
      removeCheckInId(),
      removeVersionCode(),
    ]).catch((err) => {
      console.error("[AuthStore] Gagal membersihkan storage:", err);
    });
  },
}));
