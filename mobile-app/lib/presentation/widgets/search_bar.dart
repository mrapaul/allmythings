import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class SearchBarWidget extends ConsumerStatefulWidget {
  const SearchBarWidget({
    super.key,
    this.initialQuery,
    this.onQueryChanged,
    this.onFilterPressed,
    this.filterLabel,
  });
  final String? initialQuery;
  final ValueChanged<String>? onQueryChanged;
  final VoidCallback? onFilterPressed;
  final String? filterLabel;

  @override
  ConsumerState<SearchBarWidget> createState() => _SearchBarWidgetState();
}

class _SearchBarWidgetState extends ConsumerState<SearchBarWidget> {
  late final TextEditingController _controller;
  final _focusNode = FocusNode();
  bool _showClearButton = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialQuery);
    _showClearButton = widget.initialQuery?.isNotEmpty ?? false;

    _controller.addListener(() {
      setState(() {
        _showClearButton = _controller.text.isNotEmpty;
      });
      widget.onQueryChanged?.call(_controller.text);
    });
  }

  @override
  void didUpdateWidget(SearchBarWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialQuery != oldWidget.initialQuery) {
      _controller.text = widget.initialQuery ?? '';
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _controller,
              focusNode: _focusNode,
              decoration: InputDecoration(
                hintText: 'Search items...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _buildSuffixIcon(),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: Theme.of(context).cardColor,
                contentPadding: const EdgeInsets.symmetric(),
              ),
              onSubmitted: (value) {
                // Close keyboard on submit
                _focusNode.unfocus();
              },
            ),
          ),
          if (widget.onFilterPressed != null) ...[
            const SizedBox(width: 8),
            _buildFilterButton(),
          ],
        ],
      ),
    );
  }

  Widget? _buildSuffixIcon() {
    if (!_showClearButton) return null;

    return IconButton(
      icon: const Icon(Icons.clear, size: 20),
      onPressed: () {
        _controller.clear();
        widget.onQueryChanged?.call('');
      },
    );
  }

  Widget _buildFilterButton() {
    return Container(
      decoration: BoxDecoration(
        color: widget.filterLabel != null
            ? Theme.of(
                context,
              ).colorScheme.primary.withAlpha((255 * 0.1).round())
            : Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: IconButton(
        icon: Stack(
          children: [
            const Icon(Icons.filter_list),
            if (widget.filterLabel != null)
              Positioned(
                right: 0,
                top: 0,
                child: Container(
                  padding: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(
                    color: Colors.red,
                    shape: BoxShape.circle,
                  ),
                  constraints: const BoxConstraints(
                    minWidth: 8,
                    minHeight: 8,
                  ),
                ),
              ),
          ],
        ),
        onPressed: widget.onFilterPressed,
        tooltip: 'Filter',
      ),
    );
  }
}
