import 'package:all_my_things/application/providers/inventory_providers.dart';
import 'package:all_my_things/presentation/common/custom_app_bar.dart'; // Added import
import 'package:all_my_things/presentation/common/loading_indicator.dart';
import 'package:all_my_things/presentation/profile/settings_screen.dart'; // Added import
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Profile screen with stats and settings
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(inventoryStatsProvider);

    return Scaffold(
      appBar: const CustomAppBar(title: 'Profile'), // Replaced AppBar
      body: statsAsync.when(
        data: (stats) => SingleChildScrollView(
          child: Column(
            children: [
              const SizedBox(height: 24),

              // Profile Icon
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.grey[200],
                ),
                child: const Icon(
                  Icons.inventory_2,
                  size: 48,
                  color: Colors.black,
                ),
              ),

              const SizedBox(height: 16),

              const Text(
                'Home Inventory',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 32),

              // Stats
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _StatCard(
                    label: 'Items',
                    value: stats.totalItems.toString(),
                    icon: Icons.inventory_2_outlined,
                  ),
                  _StatCard(
                    label: 'Labels',
                    value: stats.totalLabels.toString(),
                    icon: Icons.label_outline,
                  ),
                  _StatCard(
                    label: 'Categories',
                    value: stats.totalCategories.toString(),
                    icon: Icons.category_outlined,
                  ),
                ],
              ),

              const SizedBox(height: 32),

              // Last Captured
              if (stats.lastCaptured != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          const Icon(Icons.access_time),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Last Captured',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey,
                                ),
                              ),
                              Text(
                                _formatDateTime(stats.lastCaptured!),
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

              const SizedBox(height: 24),

              // Settings
              const Divider(),
              ListTile(
                leading: const Icon(Icons.info_outline),
                title: const Text('About'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  showAboutDialog(
                    context: context,
                    applicationName: 'Home Inventory',
                    applicationVersion: '1.0.0',
                    applicationLegalese:
                        '© 2025 Visual Home Inventory Manager\n\nMinimalistic Instagram-style home inventory app with AI-powered object detection.',
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.help_outline),
                title: const Text('Help & Support'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  _showHelpDialog(context);
                },
              ),
              ListTile(
                leading: const Icon(Icons.settings_outlined),
                title: const Text('Settings'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => const SettingsScreen(),
                    ),
                  );
                },
              ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.refresh, color: Colors.blue),
                title: const Text(
                  'Refresh Data',
                  style: TextStyle(color: Colors.blue),
                ),
                onTap: () {
                  ref.invalidate(inventoryItemsProvider);
                  ref.invalidate(inventoryStatsProvider);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Data refreshed')),
                  );
                },
              ),
            ],
          ),
        ),
        loading: () => const LoadingIndicator(),
        error: (error, stack) => Center(
          child: Text('Error: $error'),
        ),
      ),
    );
  }

  String _formatDateTime(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);

    if (difference.inDays > 0) {
      return '${difference.inDays} day${difference.inDays > 1 ? 's' : ''} ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours} hour${difference.inHours > 1 ? 's' : ''} ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes} minute${difference.inMinutes > 1 ? 's' : ''} ago';
    } else {
      return 'Just now';
    }
  }

  void _showHelpDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('How to Use'),
        content: const SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '📸 Capture',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              SizedBox(height: 8),
              Text(
                'Tap the + icon to capture photos of your items. The AI will detect and label objects automatically.',
              ),
              SizedBox(height: 16),
              Text(
                '🏷️ Labels',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              SizedBox(height: 8),
              Text(
                'Add custom labels like color, brand, or room to organize your items better.',
              ),
              SizedBox(height: 16),
              Text(
                '🔍 Search',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              SizedBox(height: 8),
              Text(
                'Use the search tab to quickly find items by their labels or descriptions.',
              ),
              SizedBox(height: 16),
              Text(
                '📊 Grid View',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              SizedBox(height: 8),
              Text(
                'Browse your inventory in an Instagram-style photo grid on the home tab.',
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Got it'),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
  });
  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, size: 32, color: Colors.black),
        const SizedBox(height: 8),
        Text(
          value,
          style: const TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            fontSize: 14,
            color: Colors.grey[600],
          ),
        ),
      ],
    );
  }
}
