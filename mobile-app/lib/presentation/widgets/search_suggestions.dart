import 'package:all_my_things/application/providers/search_history_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class SearchSuggestions extends ConsumerWidget {
  const SearchSuggestions({
    required this.controller,
    required this.onSuggestionSelected,
    super.key,
    this.showHistory = true,
    this.additionalSuggestions,
  });
  final TextEditingController controller;
  final ValueChanged<String> onSuggestionSelected;
  final bool showHistory;
  final List<String>? additionalSuggestions;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final searchHistory = ref.watch(searchHistoryProvider);

    final suggestions = _getSuggestions(searchHistory, controller.text);
    if (suggestions.isEmpty) return const SizedBox.shrink();

    return Material(
      elevation: 4,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        constraints: const BoxConstraints(maxHeight: 300),
        child: ListView.builder(
          padding: EdgeInsets.zero,
          shrinkWrap: true,
          itemCount: suggestions.length,
          itemBuilder: (context, index) {
            final suggestion = suggestions[index];
            final isHistory =
                showHistory &&
                searchHistory.take(5).any((item) => item == suggestion);

            return ListTile(
              leading: isHistory
                  ? const Icon(Icons.history, color: Colors.grey)
                  : const Icon(Icons.search, color: Colors.grey),
              title: Text(suggestion),
              onTap: () {
                controller.text = suggestion;
                onSuggestionSelected(suggestion);
              },
              trailing: isHistory
                  ? IconButton(
                      icon: const Icon(Icons.close, size: 16),
                      onPressed: () {
                        ref
                            .read(searchHistoryProvider.notifier)
                            .removeSearchTerm(suggestion);
                      },
                    )
                  : null,
            );
          },
        ),
      ),
    );
  }

  List<String> _getSuggestions(List<String> history, String query) {
    final suggestions = <String>{};

    // Add history suggestions
    if (showHistory) {
      suggestions.addAll(history.take(5));
    }

    // Add additional suggestions that match the query
    if (additionalSuggestions != null && query.isNotEmpty) {
      suggestions.addAll(
        additionalSuggestions!
            .where(
              (suggestion) =>
                  suggestion.toLowerCase().contains(query.toLowerCase()) &&
                  !suggestions.contains(suggestion),
            )
            .take(5),
      );
    }

    // Filter by query if provided
    if (query.isNotEmpty) {
      suggestions.removeWhere(
        (suggestion) => !suggestion.toLowerCase().contains(query.toLowerCase()),
      );
    }

    return suggestions.toList();
  }
}
