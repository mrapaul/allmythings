const {
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
  IOSConfig,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/**
 * UIScene lifecycle adoption for iOS 27 (Apple TN3187).
 *
 * Apps built with the iOS 27 SDK (Xcode 27) hard-crash at launch
 * (`…NoSceneLifecycleAdoption…`) unless they declare a scene manifest and a
 * scene delegate. Expo SDK 54's prebuild template is still on the classic
 * AppDelegate/window lifecycle and, as of writing, no official fix exists
 * even on canary (expo/expo#46663, #46664 — open, SDK 56).
 *
 * Strategy — the minimal-risk bridge:
 *  - The generated ExpoAppDelegate keeps creating the UIWindow and starting
 *    React Native in didFinishLaunching, which UIKit still invokes BEFORE the
 *    scene connects. Nothing about Expo's startup order changes.
 *  - A tiny SceneDelegate then ADOPTS that existing window into the
 *    connecting UIWindowScene. The window stays owned by the AppDelegate
 *    because React Native itself dereferences `appDelegate.window`
 *    (RCTDeviceInfo — see react/react-native#53602).
 *  - Deep links / universal links are forwarded from the scene callbacks to
 *    the existing AppDelegate handlers, since UIKit stops delivering them to
 *    the application-level callbacks once scenes are adopted.
 *
 * This plugin survives `expo prebuild --clean`; the mirrored files in ios/
 * do not (same caveat as the hand-applied Podfile deployment floor).
 */

const SCENE_DELEGATE_FILE = 'SceneDelegate.swift';

const SCENE_DELEGATE_SOURCE = `import UIKit

/// Minimal UIScene adoption (Apple TN3187) — see plugins/withUIScene.js for
/// the full rationale. The classic ExpoAppDelegate still creates the window
/// and starts React Native in didFinishLaunching (which runs before the
/// scene connects); this delegate only adopts that window into the scene.
/// The window must remain owned by the AppDelegate: React Native and several
/// Expo modules read \`UIApplication.shared.delegate.window\`.
@objc(SceneDelegate)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }

    if appDelegate.window == nil {
      // Defensive: if a future template stops making the window in
      // didFinishLaunching, create it here so launch still succeeds.
      appDelegate.window = UIWindow(frame: windowScene.coordinateSpace.bounds)
    }
    let window = appDelegate.window
    window?.windowScene = windowScene
    self.window = window
    window?.makeKeyAndVisible()

    // Cold-start deep link / universal link: under the scene lifecycle these
    // arrive here instead of application(_:open:options:).
    for context in connectionOptions.urlContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
    for activity in connectionOptions.userActivities {
      _ = appDelegate.application(UIApplication.shared, continue: activity) { _ in }
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity) { _ in }
  }
}
`;

/** The static scene manifest; single scene, delegate by Objective-C name. */
const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: 'SceneDelegate',
      },
    ],
  },
};

function withSceneManifest(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return mod;
  });
}

function withSceneDelegateFile(config) {
  return withDangerousMod(config, [
    'ios',
    (mod) => {
      const projectName = mod.modRequest.projectName;
      const file = path.join(mod.modRequest.platformProjectRoot, projectName, SCENE_DELEGATE_FILE);
      fs.writeFileSync(file, SCENE_DELEGATE_SOURCE);
      return mod;
    },
  ]);
}

function withSceneDelegateInTarget(config) {
  return withXcodeProject(config, (mod) => {
    const projectName = mod.modRequest.projectName;
    const filepath = `${projectName}/${SCENE_DELEGATE_FILE}`;
    if (!mod.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: mod.modResults,
      });
    }
    return mod;
  });
}

module.exports = function withUIScene(config) {
  return withSceneDelegateInTarget(withSceneDelegateFile(withSceneManifest(config)));
};
