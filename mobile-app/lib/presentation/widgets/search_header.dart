import 'package:all_my_things/presentation/theme/app_colors.dart';
import 'package:all_my_things/presentation/theme/app_typography.dart';
import 'package:flutter/material.dart';

/// Always-visible pill-shaped search bar. Magnifier inside the field,
/// clear-X appears when there's text. Mirrors design's SearchHeader.tsx.
class SearchHeader extends StatelessWidget {
  const SearchHeader({
    super.key,
    required this.controller,
    required this.onChanged,
    this.focusNode,
    this.placeholder = 'Search items, rooms, categories…',
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final FocusNode? focusNode;
  final String placeholder;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;

    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: p.card,
        border: Border.all(color: p.border),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        children: [
          Icon(Icons.search, size: 16, color: p.mutedForeground),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: controller,
              focusNode: focusNode,
              onChanged: onChanged,
              textInputAction: TextInputAction.search,
              cursorColor: p.primary,
              style: AppTypography.inter(
                size: 14,
                weight: FontWeight.w500,
                color: p.foreground,
                letterSpacing: 0.1,
              ),
              decoration: InputDecoration(
                hintText: placeholder,
                hintStyle: AppTypography.inter(
                  size: 14,
                  weight: FontWeight.w400,
                  color: p.mutedForeground,
                ),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                isCollapsed: true,
                contentPadding: EdgeInsets.zero,
                filled: false,
              ),
            ),
          ),
          AnimatedBuilder(
            animation: controller,
            builder: (_, __) {
              if (controller.text.isEmpty) return const SizedBox.shrink();
              return GestureDetector(
                onTap: () {
                  controller.clear();
                  onChanged('');
                },
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: p.muted,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.close, size: 12, color: p.mutedForeground),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
