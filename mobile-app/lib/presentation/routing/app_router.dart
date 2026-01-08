import 'dart:io';

import 'package:all_my_things/presentation/camera/camera_capture_screen.dart';
import 'package:all_my_things/presentation/screens/detection_results_screen.dart';
import 'package:all_my_things/presentation/screens/inventory_feed_screen.dart';
import 'package:all_my_things/presentation/screens/item_detail_screen.dart';
import 'package:all_my_things/presentation/profile/profile_screen.dart';
import 'package:all_my_things/presentation/search/search_screen.dart';
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Application routing configuration with transitions
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/items',
    routes: [
      // Root shell route with bottom navigation
      ShellRoute(
        builder: (context, state, child) {
          return _RootNavigationShell(child: child);
        },
        routes: [
          // Inventory feed (home)
          GoRoute(
            path: '/items',
            name: 'items',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: InventoryFeedScreen(),
            ),
          ),

          // Search
          GoRoute(
            path: '/search',
            name: 'search',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: SearchScreen(),
            ),
          ),

          // Profile
          GoRoute(
            path: '/profile',
            name: 'profile',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: ProfileScreen(),
            ),
          ),
        ],
      ),

      // Camera capture (modal)
      GoRoute(
        path: '/camera',
        name: 'camera',
        pageBuilder: (context, state) => const CustomTransitionPage(
          child: CameraCaptureScreen(),
          transitionsBuilder: _slideUpTransition,
        ),
      ),

      // Detection results (receives File as extra)
      GoRoute(
        path: '/detection',
        name: 'detection',
        pageBuilder: (context, state) {
          final imageFile = state.extra as File?;
          if (imageFile == null) {
            return const MaterialPage(
              child: Scaffold(
                body: Center(child: Text('No image provided')),
              ),
            );
          }

          return CustomTransitionPage(
            child: DetectionResultsScreen(imageFile: imageFile),
            transitionsBuilder: _fadeTransition,
          );
        },
      ),

      // Edit labels
      GoRoute(
        path: '/edit/:id',
        name: 'edit',
        pageBuilder: (context, state) {
          final itemId = int.tryParse(state.pathParameters['id'] ?? '');
          if (itemId == null) {
            return const MaterialPage(
              child: Scaffold(
                body: Center(child: Text('Invalid item ID')),
              ),
            );
          }

          return const CustomTransitionPage(
            child: Scaffold(
              body: Center(child: Text('Edit Labels - To be implemented')),
            ),
            transitionsBuilder: _slideLeftTransition,
          );
        },
      ),

      // Item detail
      GoRoute(
        path: '/item/:id',
        name: 'item',
        pageBuilder: (context, state) {
          final itemId = int.tryParse(state.pathParameters['id'] ?? '');
          if (itemId == null) {
            return const MaterialPage(
              child: Scaffold(
                body: Center(child: Text('Invalid item ID')),
              ),
            );
          }

          return CustomTransitionPage(
            child: ItemDetailScreen(itemId: itemId),
            transitionsBuilder: _fadeTransition,
          );
        },
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            Text('Route not found: ${state.uri}'),
          ],
        ),
      ),
    ),
  );
});

/// Root shell navigation widget with bottom navigation
class _RootNavigationShell extends StatefulWidget {
  const _RootNavigationShell({required this.child});

  final Widget child;

  @override
  State<_RootNavigationShell> createState() => _RootNavigationShellState();
}

class _RootNavigationShellState extends State<_RootNavigationShell> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      body: widget.child,
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          context.push('/camera');
        },
        backgroundColor: AppTheme.primaryBlack,
        shape: const CircleBorder(),
        heroTag: 'main-camera-fab',
        child: const Icon(Icons.add, color: Colors.white, size: 32),
      ),
      bottomNavigationBar: BottomAppBar(
        shape: const CircularNotchedRectangle(),
        notchMargin: 8,
        color: Colors.white,
        elevation: 0,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: <Widget>[
            IconButton(
              icon: Icon(
                _currentIndex == 0 ? Icons.home : Icons.home_outlined,
                color: _currentIndex == 0
                    ? AppTheme.primaryBlack
                    : AppTheme.textSecondary,
              ),
              onPressed: () {
                setState(() => _currentIndex = 0);
                context.go('/items');
              },
            ),
            IconButton(
              icon: Icon(
                _currentIndex == 1 ? Icons.search : Icons.search_outlined,
                color: _currentIndex == 1
                    ? AppTheme.primaryBlack
                    : AppTheme.textSecondary,
              ),
              onPressed: () {
                setState(() => _currentIndex = 1);
                context.go('/search');
              },
            ),
            // Spacer for the FAB
            const SizedBox(width: 48),
            IconButton(
              icon: Icon(
                _currentIndex == 2 ? Icons.person : Icons.person_outline,
                color: _currentIndex == 2
                    ? AppTheme.primaryBlack
                    : AppTheme.textSecondary,
              ),
              onPressed: () {
                setState(() => _currentIndex = 2);
                context.go('/profile');
              },
            ),
          ],
        ),
      ),
    );
  }
}

// Transition builders
Widget _slideUpTransition(
  BuildContext context,
  Animation<double> animation,
  Animation<double> secondaryAnimation,
  Widget child,
) {
  const begin = Offset(0, 1);
  const end = Offset.zero;
  const curve = Curves.easeInOutCubic;

  final tween = Tween(begin: begin, end: end).chain(
    CurveTween(curve: curve),
  );

  return SlideTransition(
    position: animation.drive(tween),
    child: child,
  );
}

Widget _slideLeftTransition(
  BuildContext context,
  Animation<double> animation,
  Animation<double> secondaryAnimation,
  Widget child,
) {
  const begin = Offset(1, 0);
  const end = Offset.zero;
  const curve = Curves.easeInOutCubic;

  final tween = Tween(begin: begin, end: end).chain(
    CurveTween(curve: curve),
  );

  return SlideTransition(
    position: animation.drive(tween),
    child: child,
  );
}

Widget _fadeTransition(
  BuildContext context,
  Animation<double> animation,
  Animation<double> secondaryAnimation,
  Widget child,
) {
  return FadeTransition(
    opacity: animation,
    child: child,
  );
}
