const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Android cleartext HTTP for the LAN api-service.
 *
 * The api-service is hosted on the user's own Mac at an http://<LAN-IP>:14000
 * URL. On physical Android devices (targetSdk 35+) all cleartext traffic is
 * blocked unless the manifest opts in — without this attribute every API call
 * fails with "Cleartext HTTP traffic not permitted".
 *
 * Background: app.json previously set `"usesCleartextTraffic": true` under
 * `android`, but that is NOT a supported Expo config key (verified against
 * @expo/config-types) — it was silently ignored and never reached the
 * manifest. This plugin writes the real attribute.
 *
 * Scope is intentionally app-wide rather than a network-security-config
 * whitelist: the server IP is dynamic (DHCP + mDNS discovery), so pinning
 * hosts/IPs in a network-security-config would rot. The attack surface is a
 * home LAN talking to the user's own server.
 */
module.exports = function withAndroidCleartext(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return mod;
  });
};
