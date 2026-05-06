import 'dart:async';
import 'dart:io';

import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/presentation/screens/about_screen.dart';
import 'package:all_my_things/presentation/screens/camera_capture_screen.dart';
import 'package:all_my_things/presentation/screens/inventory_feed_screen.dart';
import 'package:all_my_things/presentation/screens/item_detail_screen.dart';
import 'package:all_my_things/presentation/screens/legal_document_screen.dart';
import 'package:all_my_things/presentation/screens/profile_screen.dart';
import 'package:all_my_things/presentation/screens/scene_review_screen.dart';
import 'package:all_my_things/presentation/screens/search_screen.dart';
import 'package:all_my_things/presentation/screens/settings_screen.dart';
import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';

/// Application router. The home (`/items`) is the only "shell" — its
/// floating ActionCapsule replaces the legacy bottom-nav, so there's no
/// shared chrome wrapper anymore. Modal-style routes (camera, scene-review,
/// item detail) get a slide/fade transition; settings & profile use cards.
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/items',
    routes: [
      GoRoute(
        path: '/verification_flow',
        pageBuilder: (context, state) => const NoTransitionPage(
          child: _VerificationFlowLoader(),
        ),
      ),
      GoRoute(
        path: '/items',
        name: 'items',
        pageBuilder: (context, state) => const NoTransitionPage(
          child: InventoryFeedScreen(),
        ),
      ),
      GoRoute(
        path: '/search',
        name: 'search',
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const SearchScreen(),
          transitionsBuilder: _fadeTransition,
        ),
      ),
      GoRoute(
        path: '/profile',
        name: 'profile',
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const ProfileScreen(),
          transitionsBuilder: _fadeTransition,
        ),
        routes: [
          GoRoute(
            path: 'about',
            name: 'about',
            pageBuilder: (context, state) => CustomTransitionPage(
              child: const AboutScreen(),
              transitionsBuilder: _fadeTransition,
            ),
          ),
          GoRoute(
            path: 'privacy',
            name: 'privacy',
            pageBuilder: (context, state) => CustomTransitionPage(
              child: const LegalDocumentScreen(
                title: 'Privacy Policy',
                assetPath: 'assets/legal/privacy_policy.md',
              ),
              transitionsBuilder: _fadeTransition,
            ),
          ),
          GoRoute(
            path: 'terms',
            name: 'terms',
            pageBuilder: (context, state) => CustomTransitionPage(
              child: const LegalDocumentScreen(
                title: 'Terms of Service',
                assetPath: 'assets/legal/terms_of_service.md',
              ),
              transitionsBuilder: _fadeTransition,
            ),
          ),
        ],
      ),
      GoRoute(
        path: '/settings',
        name: 'settings',
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const SettingsScreen(),
          transitionsBuilder: _fadeTransition,
        ),
      ),
      GoRoute(
        path: '/camera',
        name: 'camera',
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const CameraCaptureScreen(),
          transitionsBuilder: _slideUpTransition,
        ),
      ),
      GoRoute(
        path: '/scene-review',
        name: 'scene-review',
        pageBuilder: (context, state) {
          final imageFile = state.extra as File?;
          if (imageFile == null) {
            return const MaterialPage<void>(
              child: _MissingImage(),
            );
          }
          return CustomTransitionPage(
            child: SceneReviewScreen(imageFile: imageFile),
            transitionsBuilder: _fadeTransition,
          );
        },
      ),
      GoRoute(
        path: '/item/:id',
        name: 'item',
        pageBuilder: (context, state) {
          final id = state.pathParameters['id'];
          if (id == null || id.isEmpty) {
            return const MaterialPage<void>(child: _MissingItem());
          }
          return CustomTransitionPage(
            child: ItemDetailScreen(itemId: id),
            transitionsBuilder: _fadeTransition,
          );
        },
      ),
    ],
  );
});

class _VerificationFlowLoader extends ConsumerStatefulWidget {
  const _VerificationFlowLoader();

  @override
  ConsumerState<_VerificationFlowLoader> createState() =>
      _VerificationFlowLoaderState();
}

class _VerificationFlowLoaderState
    extends ConsumerState<_VerificationFlowLoader> {
  @override
  void initState() {
    super.initState();
    unawaited(_loadAndGo());
  }

  Future<void> _loadAndGo() async {
    try {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      final byteData = await rootBundle.load('assets/test_images/ai_interior.png');
      final dir = await getApplicationDocumentsDirectory();
      final file = File('${dir.path}/ai_interior.png');
      await file.parent.create(recursive: true);
      await file.writeAsBytes(
        byteData.buffer
            .asUint8List(byteData.offsetInBytes, byteData.lengthInBytes),
        flush: true,
      );
      if (!mounted) return;
      unawaited(
        ref.read(inventoryItemsProvider.notifier).processSceneInBackground(file),
      );
      if (mounted) context.go('/items');
    } catch (e, st) {
      debugPrint('Verification failed critically: $e\n$st');
      if (mounted) context.go('/items');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: context.palette.background,
        body: const Center(child: CircularProgressIndicator()),
      );
}

class _MissingImage extends StatelessWidget {
  const _MissingImage();

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Scaffold(
      backgroundColor: p.background,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            'No image to review.',
            style:
                AppTypography.inter(size: 14, color: p.mutedForeground),
          ),
        ),
      ),
    );
  }
}

class _MissingItem extends StatelessWidget {
  const _MissingItem();

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Scaffold(
      backgroundColor: p.background,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            'Invalid item id.',
            style:
                AppTypography.inter(size: 14, color: p.mutedForeground),
          ),
        ),
      ),
    );
  }
}

Widget _slideUpTransition(
  BuildContext context,
  Animation<double> animation,
  Animation<double> secondaryAnimation,
  Widget child,
) {
  final tween = Tween(begin: const Offset(0, 1), end: Offset.zero)
      .chain(CurveTween(curve: Curves.easeInOutCubic));
  return SlideTransition(position: animation.drive(tween), child: child);
}

Widget _fadeTransition(
  BuildContext context,
  Animation<double> animation,
  Animation<double> secondaryAnimation,
  Widget child,
) =>
    FadeTransition(opacity: animation, child: child);
