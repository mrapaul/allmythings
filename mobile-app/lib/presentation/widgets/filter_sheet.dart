import 'package:all_my_things/domain/models/sort_option.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class FilterSheet extends ConsumerWidget {
  const FilterSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sortOption = ref.watch(sortOptionProvider);

    return DraggableScrollableSheet(
      minChildSize: 0.3,
      maxChildSize: 0.8,
      expand: false,
      builder: (context, scrollController) {
        return SingleChildScrollView(
          controller: scrollController,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Sort By',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 16),
                RadioListTile<SortOption>.adaptive(
                  title: const Text('Name'),
                  value: SortOption.name,
                  groupValue: sortOption,
                  onChanged: (value) {
                    ref.read(sortOptionProvider.notifier).state = value;
                  },
                ),
                RadioListTile<SortOption>.adaptive(
                  title: const Text('Date'),
                  value: SortOption.date,
                  groupValue: sortOption,
                  onChanged: (value) {
                    ref.read(sortOptionProvider.notifier).state = value;
                  },
                ),
                RadioListTile<SortOption>.adaptive(
                  title: const Text('Category'),
                  value: SortOption.category,
                  groupValue: sortOption,
                  onChanged: (value) {
                    ref.read(sortOptionProvider.notifier).state = value;
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

final sortOptionProvider = StateProvider<SortOption>((ref) => SortOption.date);
