import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.blindmatch.marriage',
  appName: 'نصفين',
  loggingBehavior: 'none',
  webDir: 'dist',
  backgroundColor: '#faf6ee',
  ios: { contentInset: 'never' }
};

export default config;
