import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { IWeekScheduleItem } from "@/types";

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions on app launch
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("shift-reminders", {
        name: "Pengingat Shift Kerja",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1e90ff",
        enableLights: true,
        enableVibrate: true,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === "granted";
  } catch (error) {
    if (__DEV__) console.debug("Error requesting notification permissions:", error);
    return false;
  }
}

// Mutex dan debounce state untuk mencegah race condition pemanggilan simultan dari index.tsx dan jadwal.tsx
let isSyncing = false;
let pendingSchedules: IWeekScheduleItem[] | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule local reminder notifications for upcoming shifts in the week (Debounced & Mutexed)
 */
export async function syncShiftNotifications(schedules: IWeekScheduleItem[]) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    executeSyncShiftNotifications(schedules);
  }, 400);
}

async function executeSyncShiftNotifications(schedules: IWeekScheduleItem[]) {
  if (isSyncing) {
    pendingSchedules = schedules;
    return;
  }

  isSyncing = true;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      if (__DEV__) console.debug("[ShiftReminder] Permission not granted; skipping schedule.");
      return;
    }

    // Get all scheduled notifications and cancel previously scheduled shift reminders
    const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    for (const notif of scheduled) {
      if (notif.content.data?.type === "shift_reminder") {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier).catch(() => {});
      }
    }

    const now = Date.now();

    for (const item of schedules) {
      if (!item.has_schedule || !item.shift || !item.date) continue;

      const shift = item.shift;
      const reminderMins = shift.reminder_minutes ?? 30;

      // item.date is "YYYY-MM-DD", shift.start_time is "HH:mm" or "HH:mm:ss"
      const startTime = shift.start_time.slice(0, 5);

      // Build target shift start Date in WIB (+07:00)
      const shiftStartDate = new Date(`${item.date}T${startTime}:00+07:00`);
      if (isNaN(shiftStartDate.getTime())) continue;

      // Trigger time is shift start minus reminder minutes
      const triggerTimeMs = shiftStartDate.getTime() - reminderMins * 60 * 1000;

      // Only schedule if the trigger time is in the future (at least 1 minute ahead)
      if (triggerTimeMs > now + 60 * 1000) {
        const bodyText =
          reminderMins === 0
            ? `Shift "${shift.name}" Anda dimulai sekarang pada pukul ${startTime} WIB. Siapkan kehadiran Anda!`
            : `Shift "${shift.name}" Anda akan dimulai dalam ${reminderMins} menit pada pukul ${startTime} WIB. Siapkan kehadiran Anda!`;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: "⏰ Pengingat Jadwal Shift",
            body: bodyText,
            data: {
              type: "shift_reminder",
              shiftId: shift.id,
              date: item.date,
            },
            sound: true,
            ...(Platform.OS === "android" ? { channelId: "shift-reminders" } : {}),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(triggerTimeMs),
          },
        }).catch((err) => {
          if (__DEV__) console.debug("[ShiftReminder] Failed to schedule single notification:", err);
        });

        if (__DEV__) {
          console.debug(
            `[ShiftReminder] Scheduled reminder for ${item.date} ${startTime} (triggering at ${new Date(triggerTimeMs).toISOString()})`
          );
        }
      }
    }
  } catch (error) {
    if (__DEV__) console.debug("Error scheduling shift reminders:", error);
  } finally {
    isSyncing = false;
    if (pendingSchedules) {
      const next = pendingSchedules;
      pendingSchedules = null;
      executeSyncShiftNotifications(next);
    }
  }
}
