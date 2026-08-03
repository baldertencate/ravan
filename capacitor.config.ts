/// <reference types="@capacitor/local-notifications" />

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.baldertencate.ravan",
  appName: "Ravân",
  webDir: "dist-native",
  backgroundColor: "#fffefb",
  server: {
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#fffefb",
  },
  plugins: {
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
      hidden: false,
    },
    LocalNotifications: {
      iconColor: "#2e5d45",
    },
  },
};

export default config;
