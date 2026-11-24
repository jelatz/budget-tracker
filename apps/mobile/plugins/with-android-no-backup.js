const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Disables Android Auto Backup to protect local financial state and session metadata.
 */
module.exports = function withAndroidNoBackup(config) {
  return withAndroidManifest(config, (nextConfig) => {
    const mainApplication =
      nextConfig.modResults.manifest.application?.[0];
    if (mainApplication) {
      mainApplication.$['android:allowBackup'] = 'false';
    }
    return nextConfig;
  });
};
