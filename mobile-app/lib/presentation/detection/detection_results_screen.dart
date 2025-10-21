import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../application/providers/detection_providers.dart';
import '../../application/providers/inventory_providers.dart';
import '../../application/state/detection_state.dart';
import '../common/loading_indicator.dart';
import '../common/error_view.dart';

/// Screen showing detection results
class DetectionResultsScreen extends ConsumerWidget {
  const DetectionResultsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detectionState = ref.watch(detectionNotifierProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detection Results'),
        actions: [
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: () {
              ref.read(detectionNotifierProvider.notifier).reset();
              Navigator.of(context).pop();
            },
          ),
        ],
      ),
      body: detectionState.when(
        initial: () => const Center(
          child: Text('No detection data'),
        ),
        loading: () => const LoadingIndicator(),
        success: (response) {
          if (response.detections.isEmpty) {
            return ErrorView(
              message: 'No objects detected in the photo.\n\nTry:\n'
                  '• Better lighting\n'
                  '• Clearer focus\n'
                  '• Different angle',
              onRetry: () => Navigator.of(context).pop(),
            );
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Summary card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Found ${response.detections.length} object(s)',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Ensemble Mode: ${response.ensembleMode}',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      Text(
                        'Processing Time: ${response.processingTimeMs}ms',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      Text(
                        'Providers Used: ${response.ensembleMetrics.providersUsed}',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      Text(
                        'Average Confidence: ${(response.ensembleMetrics.averageConfidence * 100).toStringAsFixed(1)}%',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // Detection list
              ...response.detections.map((detection) {
                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: Colors.green,
                      child: Text(
                        '${(detection.confidence * 100).toStringAsFixed(0)}%',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    title: Text(
                      detection.label,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Provider Agreement: ${detection.ensembleDetails.providerAgreement}/4',
                        ),
                        Text(
                          'Consensus: ${detection.ensembleDetails.labelConsensus}',
                        ),
                      ],
                    ),
                    trailing: const Icon(Icons.check_circle, color: Colors.green),
                  ),
                );
              }),

              const SizedBox(height: 24),

              // Action buttons
              ElevatedButton(
                onPressed: () {
                  ref.read(detectionNotifierProvider.notifier).reset();
                  ref.invalidate(inventoryItemsProvider);
                  // Pop back to camera, then pop back to main navigation (home)
                  Navigator.of(context).popUntil((route) => route.isFirst);
                },
                child: const Text('Done'),
              ),
            ],
          );
        },
        error: (failure) => ErrorView(
          message: failure.message,
          onRetry: () => Navigator.of(context).pop(),
        ),
      ),
    );
  }
}
