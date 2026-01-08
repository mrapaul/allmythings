import 'package:all_my_things/presentation/camera/camera_capture_screen.dart';
import 'package:all_my_things/presentation/profile/profile_screen.dart';
import 'package:all_my_things/presentation/screens/inventory_feed_screen.dart';
import 'package:all_my_things/presentation/search/search_screen.dart';
import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Simple main navigation with bottom bar
class MainNavigation extends ConsumerStatefulWidget {
  const MainNavigation({super.key});

  @override
  ConsumerState<MainNavigation> createState() => _MainNavigationState();
}

class _MainNavigationState extends ConsumerState<MainNavigation> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    InventoryFeedScreen(),
    SearchScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      body: _screens[_currentIndex],
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (context) => const CameraCaptureScreen(),
              fullscreenDialog: true,
            ),
          );
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
                setState(() {
                  _currentIndex = 0;
                });
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
                setState(() {
                  _currentIndex = 1;
                });
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
                setState(() {
                  _currentIndex = 2;
                });
              },
            ),
          ],
        ),
      ),
    );
  }
}
