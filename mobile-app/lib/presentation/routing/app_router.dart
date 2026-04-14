import 'dart:async';
import 'dart:io';

import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/presentation/camera/camera_capture_screen.dart';
import 'package:all_my_things/presentation/profile/about_screen.dart';
import 'package:all_my_things/presentation/profile/legal_document_screen.dart';
import 'package:all_my_things/presentation/profile/profile_screen.dart';
import 'package:all_my_things/presentation/screens/detection_results_screen.dart';
import 'package:all_my_things/presentation/screens/inventory_feed_screen.dart';
import 'package:all_my_things/presentation/screens/item_detail_screen.dart';
import 'package:all_my_things/presentation/screens/search_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';

/// Application routing configuration with transitions
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/items',
    routes: [
      // For verification purposes - auto loads ai_interior.jpg
      GoRoute(
        path: '/verification_flow',
        pageBuilder: (context, state) => const NoTransitionPage(
          child: _VerificationFlowLoader(),
        ),
      ),
      // Root shell route with bottom navigation
      ShellRoute(
        builder: (context, state, child) {
          return _RootNavigationShell(child: child);
        },
        routes: [
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
            pageBuilder: (context, state) => const NoTransitionPage(
              child: SearchScreen(),
            ),
          ),
          GoRoute(
            path: '/profile',
            name: 'profile',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: ProfileScreen(),
            ),
            routes: [
              GoRoute(
                path: 'about',
                name: 'about',
                pageBuilder: (context, state) => const CustomTransitionPage(
                  child: AboutScreen(),
                  transitionsBuilder: _fadeTransition,
                ),
              ),
              GoRoute(
                path: 'privacy',
                name: 'privacy',
                pageBuilder: (context, state) => const CustomTransitionPage(
                  child: LegalDocumentScreen(
                    title: 'Privacy Policy',
                    assetPath: 'assets/legal/privacy_policy.md',
                  ),
                  transitionsBuilder: _fadeTransition,
                ),
              ),
              GoRoute(
                path: 'terms',
                name: 'terms',
                pageBuilder: (context, state) => const CustomTransitionPage(
                  child: LegalDocumentScreen(
                    title: 'Terms of Service',
                    assetPath: 'assets/legal/terms_of_service.md',
                  ),
                  transitionsBuilder: _fadeTransition,
                ),
              ),
            ],
          ),
        ],
      ),

      GoRoute(
        path: '/camera',
        name: 'camera',
        pageBuilder: (context, state) => const CustomTransitionPage(
          child: CameraCaptureScreen(),
          transitionsBuilder: _slideUpTransition,
        ),
      ),

      GoRoute(
        path: '/detection',
        name: 'detection',
        pageBuilder: (context, state) {
          final imageFile = state.extra as File?;
          if (imageFile == null) {
            return const MaterialPage(child: Scaffold(body: Center(child: Text('No image'))));
          }
          return CustomTransitionPage(
            child: DetectionResultsScreen(imageFile: imageFile),
            transitionsBuilder: _fadeTransition,
          );
        },
      ),

      GoRoute(
        path: '/item/:id',
        name: 'item',
        pageBuilder: (context, state) {
          final itemId = int.tryParse(state.pathParameters['id'] ?? '');
          if (itemId == null) return const MaterialPage(child: Scaffold(body: Center(child: Text('Invalid ID'))));
          return CustomTransitionPage(
            child: ItemDetailScreen(itemId: itemId),
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
  ConsumerState<_VerificationFlowLoader> createState() => _VerificationFlowLoaderState();
}

class _VerificationFlowLoaderState extends ConsumerState<_VerificationFlowLoader> {
  @override
  void initState() {
    super.initState();
    unawaited(_loadAndGo());
  }

  Future<void> _loadAndGo() async {
    try {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      debugPrint('Loading verification asset: ai_interior.png');
      final byteData = await rootBundle.load('assets/test_images/ai_interior.png');
      final directory = await getApplicationDocumentsDirectory();
      final file = File('${directory.path}/ai_interior.png');
      
      debugPrint('Target path: ${file.path}');
      await file.parent.create(recursive: true);
      
      await file.writeAsBytes(
        byteData.buffer.asUint8List(byteData.offsetInBytes, byteData.lengthInBytes),
        flush: true,
      );

      if (mounted) {
        debugPrint('Asset loaded successfully, starting background processing');
        // Start background identification - do NOT await here so we can navigate immediately
        unawaited(ref.read(inventoryItemsProvider.notifier).processImageInBackground(file));
        
        if (mounted) {
          debugPrint('Navigating to inventory feed');
          context.go('/items');
        }
      }
    } catch (e, stack) {
      debugPrint('Verification failed critically: $e');
      debugPrint(stack.toString());
      if (mounted) context.go('/items');
    }
  }

  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: CircularProgressIndicator(color: Colors.black)));
}

class _RootNavigationShell extends StatefulWidget {
  const _RootNavigationShell({required this.child});
  final Widget child;
  @override State<_RootNavigationShell> createState() => _RootNavigationShellState();
}

class _RootNavigationShellState extends State<_RootNavigationShell> {
  int _currentIndex = 0;
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: widget.child,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Colors.grey.shade200, width: 0.5))),
        child: BottomAppBar(
          height: 60, color: Colors.white, elevation: 0, padding: EdgeInsets.zero,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: <Widget>[
              _BottomNavItem(icon: _currentIndex == 0 ? Icons.home_filled : Icons.home_outlined, isActive: _currentIndex == 0, onTap: () { setState(() => _currentIndex = 0); context.go('/items'); }),
              _BottomNavItem(icon: Icons.search_rounded, isActive: _currentIndex == 1, onTap: () { setState(() => _currentIndex = 1); context.go('/search'); }),
              _BottomNavItem(
                key: const Key('add-item-nav'),
                icon: Icons.add_box_outlined, 
                isActive: false, 
                onTap: () => context.push('/camera'),
              ),
              _BottomNavItem(
                icon: Icons.favorite_border_rounded, 
                isActive: false, 
                onTap: () {},
              ),
              _BottomNavItem(
                icon: _currentIndex == 2 ? Icons.person : Icons.person_outline, 
                isActive: _currentIndex == 2, onTap: () { setState(() => _currentIndex = 2); context.go('/profile'); }),
            ],
          ),
        ),
      ),
    );
  }
}

class _BottomNavItem extends StatelessWidget {
  const _BottomNavItem({required this.icon, required this.isActive, required this.onTap, super.key});
  final IconData icon; final bool isActive; final VoidCallback onTap;
  @override Widget build(BuildContext context) => IconButton(icon: Icon(icon, size: 30, color: isActive ? Colors.black : Colors.black87), onPressed: onTap);
}

Widget _slideUpTransition(BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation, Widget child) {
  final tween = Tween(begin: const Offset(0, 1), end: Offset.zero).chain(CurveTween(curve: Curves.easeInOutCubic));
  return SlideTransition(position: animation.drive(tween), child: child);
}

Widget _fadeTransition(BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation, Widget child) => FadeTransition(opacity: animation, child: child);
