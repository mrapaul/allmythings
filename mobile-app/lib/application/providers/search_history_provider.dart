import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

final searchHistoryProvider =
    StateNotifierProvider<SearchHistoryNotifier, List<String>>((ref) {
      return SearchHistoryNotifier();
    });

class SearchHistoryNotifier extends StateNotifier<List<String>> {
  SearchHistoryNotifier() : super([]) {
    _loadHistory();
  }

  static const _historyKey = 'search_history';

  Future<void> _loadHistory() async {
    final prefs = await SharedPreferences.getInstance();
    state = prefs.getStringList(_historyKey) ?? [];
  }

  Future<void> addSearchTerm(String term) async {
    final prefs = await SharedPreferences.getInstance();
    final history = [term, ...state.where((t) => t != term)].take(10).toList();
    await prefs.setStringList(_historyKey, history);
    state = history;
  }

  Future<void> removeSearchTerm(String term) async {
    final prefs = await SharedPreferences.getInstance();
    final history = state.where((t) => t != term).toList();
    await prefs.setStringList(_historyKey, history);
    state = history;
  }

  Future<void> clearHistory() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_historyKey);
    state = [];
  }
}
