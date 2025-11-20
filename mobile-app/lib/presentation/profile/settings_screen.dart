import 'package:all_my_things/presentation/common/custom_app_bar.dart'; // Added import
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: const CustomAppBar(title: 'Settings'), // Replaced AppBar
      body: ListView(
        children: const [
          ListTile(
            title: Text('General Settings'),
          ),
          // TODO: Add more settings options
        ],
      ),
    );
  }
}
