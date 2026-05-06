import 'package:flutter/widgets.dart';

/// Pinterest-style masonry: distributes items into the shortest column,
/// using each item's aspect-ratio (height / width) so wide objects get
/// wide tiles and tall objects get tall tiles. Falls back to 1:1.
///
/// API mirrors design's MasonryGrid.tsx — caller supplies a list, the grid
/// computes column buckets, and `tileBuilder` renders each tile inside a
/// SizedBox of the right aspect.
class MasonryGrid<T> extends StatelessWidget {
  const MasonryGrid({
    super.key,
    required this.items,
    required this.columns,
    required this.gap,
    required this.aspectRatioFor,
    required this.tileBuilder,
  });

  final List<T> items;
  final int columns;
  final double gap;

  /// Returns height/width ratio for the given item. Will be clamped to
  /// [0.7, 1.55] to keep tiles from being absurdly tall or wide.
  final double Function(T item) aspectRatioFor;

  final Widget Function(BuildContext context, T item, int index) tileBuilder;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty || columns < 1) return const SizedBox.shrink();

    final buckets = List<List<_Cell<T>>>.generate(columns, (_) => []);
    final heights = List<double>.filled(columns, 0);

    for (var i = 0; i < items.length; i++) {
      final item = items[i];
      final raw = aspectRatioFor(item);
      final ratio = raw.isNaN || raw <= 0
          ? 1.0
          : raw.clamp(0.7, 1.55).toDouble();
      var bestCol = 0;
      var bestH = heights[0];
      for (var c = 1; c < columns; c++) {
        if (heights[c] < bestH) {
          bestH = heights[c];
          bestCol = c;
        }
      }
      buckets[bestCol].add(_Cell(item: item, index: i, ratio: ratio));
      heights[bestCol] += ratio + 0.1;
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var ci = 0; ci < columns; ci++) ...[
          if (ci > 0) SizedBox(width: gap),
          Expanded(
            child: Column(
              children: [
                for (var ri = 0; ri < buckets[ci].length; ri++) ...[
                  if (ri > 0) SizedBox(height: gap),
                  AspectRatio(
                    aspectRatio: 1 / buckets[ci][ri].ratio,
                    child: tileBuilder(
                      context,
                      buckets[ci][ri].item,
                      buckets[ci][ri].index,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

@immutable
class _Cell<T> {
  const _Cell({required this.item, required this.index, required this.ratio});
  final T item;
  final int index;
  final double ratio;
}
