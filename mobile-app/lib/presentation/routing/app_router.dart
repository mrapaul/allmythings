import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Application routing configuration
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/',
        name: 'home',
        builder: (context, state) => const Scaffold(
          body: Center(child: Text('Home Screen - To be implemented')),
        ),
      ),
      GoRoute(
        path: '/camera',
        name: 'camera',
        builder: (context, state) => const Scaffold(
          body: Center(child: Text('Camera Screen - To be implemented')),
        ),
      ),
    ],
  );
});
