import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {

    override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }

    func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
        GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
        // Register native MethodChannels after the engine is ready.
        // Using pluginRegistry.registrar gives a stable messenger guaranteed available at this point,
        // avoiding the scene-lifecycle race where window?.rootViewController is nil at didFinishLaunching.
        guard let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "com.allmythings.channels") else {
            return
        }
        let messenger = registrar.messenger()
        CoreMLDetector.register(messenger: messenger)
        MacServerDiscovery.register(messenger: messenger)
    }
}
