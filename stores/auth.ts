// src/store/auth.store.ts
import { clearCache, clearStorageByPrefixes } from "@/lib/cache";
import { removeToken, removeCheckInId, removeVersionCode } from "@/lib/storage";
import { IUser } from "@/types";
import { create } from "zustand";

type AuthState = {
  user: IUser | null;
  setUser: (user: IUser) => void;
  logout: () => void;
};

/**
 * MOB-02 — user-specific AsyncStorage namespaces that are NOT the offline queue.
 *
 * `clearCache()` only removes the `@cache_` namespace. These keys hold data
 * belonging to the signed-in user and would otherwise be readable by the next
 * user of a shared device:
 *
 *   @dr_draft_<routineId>_<date>  daily-routine drafts (user-entered work data)
 *
 * `@notif_rationale_shown` (device-level onboarding flag) and `@app_theme_mode`
 * (device preference) are deliberately NOT listed: they carry no user data and
 * wiping them would re-onboard every subsequent user. Likewise
 * `@cached_attendance_sites` / `@cached_attendance_statuses` are organisation
 * reference data that the offline geofence needs, not user data.
 *
 * NOTE: the offline queue (`@offline_queue`) and its failed bucket
 * (`@failed_attendance_queue`) are deliberately NOT cleared here — see below.
 */
const USER_SCOPED_STORAGE_PREFIXES = ["@dr_draft_"];

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => {
    // Reset state user
    set({ user: null });

    // Bersihkan semua persisted storage dari auth
    // Gunakan Promise agar tidak blocking UI
    //
    // MOB-02 — the offline queue is intentionally PRESERVED across logout.
    //
    // Deleting it would destroy a legitimate check-in: a port technician who
    // checks in with no signal and then ends their shift would silently lose a
    // payroll record. The cross-user defect is closed by *ownership*, not by
    // deletion — every queued item is stamped with its owner (`owner_user_id`,
    // lib/offlineQueue.ts) and `syncQueuedRequests()` refuses to submit an item
    // whose owner is not the currently authenticated identity. So A's queued
    // evidence stays on the device, invisible and unsubmittable for B, and
    // syncs normally the next time A authenticates on this device.
    Promise.all([
      clearCache(),
      clearStorageByPrefixes(USER_SCOPED_STORAGE_PREFIXES),
      removeToken(),
      removeCheckInId(),
      removeVersionCode(),
    ]).catch((err) => {
      console.error("[AuthStore] Gagal membersihkan storage:", err);
    });
  },
}));
