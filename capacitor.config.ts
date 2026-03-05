import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jdhospital.messenger',
  appName: '정동병원 메신저',
  webDir: 'build',
  icon: 'icon-192x192.png',
  server: {
    androidScheme: 'https',
    url: 'https://192.168.0.230:3000',  // Ubuntu 서버 주소 (3000 포트)
    useLiveReload: false,
  } as any,
  android: {
    webContentsDebuggingEnabled: true,
    buildOptions: {
      keystorePath: null,
      keystorePassword: null,
      keystoreAlias: null,
      keystoreAliasPassword: null,
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
    App: {
      backgroundTaskDuration: 300
    } as any,
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    }
  }
};

export default config;
