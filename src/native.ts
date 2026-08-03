import { Capacitor } from "@capacitor/core";
import { Haptics } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";

export const IS_NATIVE_APP = Capacitor.isNativePlatform();

const REMINDER_CHANNEL_ID = "practice-reminders";
const REMINDER_ID_START = 7_400;
const REMINDER_COUNT = 60;

function pause(duration: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, duration));
}

export function playHapticPattern(pattern: number[]) {
  if (!IS_NATIVE_APP) {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
    return;
  }

  void (async () => {
    for (let index = 0; index < pattern.length; index += 1) {
      const duration = pattern[index];
      if (index % 2 === 0) await Haptics.vibrate({ duration });
      if (index < pattern.length - 1) await pause(duration);
    }
  })();
}

export async function requestReminderPermission() {
  if (!IS_NATIVE_APP) return true;
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

async function cancelNativeReminders() {
  const pending = await LocalNotifications.getPending();
  const reminders = pending.notifications
    .filter(({ id }) => id >= REMINDER_ID_START && id < REMINDER_ID_START + REMINDER_COUNT)
    .map(({ id }) => ({ id }));
  if (reminders.length) await LocalNotifications.cancel({ notifications: reminders });
}

export async function syncNativeReminder(settings: {
  enabled: boolean;
  time: string;
  interval: number;
}) {
  if (!IS_NATIVE_APP) return "web" as const;
  await cancelNativeReminders();
  if (!settings.enabled) return "off" as const;

  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") return "denied" as const;

  await LocalNotifications.createChannel({
    id: REMINDER_CHANNEL_ID,
    name: "Practice reminders",
    description: "Reminders to practise reading Farsi with Ravân",
    importance: 3,
    vibration: true,
  });

  const [savedHour, savedMinute] = settings.time.split(":").map(Number);
  const hour = Number.isFinite(savedHour) ? savedHour : 19;
  const minute = Number.isFinite(savedMinute) ? savedMinute : 0;
  const firstReminder = new Date();
  firstReminder.setHours(hour, minute, 0, 0);
  if (firstReminder.getTime() <= Date.now()) firstReminder.setDate(firstReminder.getDate() + 1);

  const notifications = Array.from({ length: REMINDER_COUNT }, (_, index) => {
    const at = new Date(firstReminder);
    at.setDate(at.getDate() + index * settings.interval);
    return {
      id: REMINDER_ID_START + index,
      title: "A few minutes of Farsi?",
      body: "Grow your Ravân flower with a short reading practice.",
      schedule: { at },
      channelId: REMINDER_CHANNEL_ID,
      autoCancel: true,
    };
  });

  await LocalNotifications.schedule({ notifications });
  return "scheduled" as const;
}

export async function shareNativeApp(options: { title: string; text: string; url: string }) {
  if (!IS_NATIVE_APP) return false;
  await Share.share({ ...options, dialogTitle: "Share Ravân" });
  return true;
}
