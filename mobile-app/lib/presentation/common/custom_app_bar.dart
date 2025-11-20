import 'package:all_my_things/presentation/theme/app_theme.dart';
import 'package:flutter/material.dart';

class CustomAppBar extends StatelessWidget implements PreferredSizeWidget {
  const CustomAppBar({
    super.key,
    this.title,
    this.titleWidget, // Added titleWidget
    this.actions,
    this.leading,
    this.centerTitle = false,
    this.backgroundColor,
    this.foregroundColor,
  });
  final String? title;
  final Widget? titleWidget; // Added titleWidget
  final List<Widget>? actions;
  final Widget? leading;
  final bool centerTitle;
  final Color? backgroundColor;
  final Color? foregroundColor;

  @override
  Widget build(BuildContext context) {
    return AppBar(
      title:
          titleWidget ??
          (title != null ? Text(title!) : null), // Use titleWidget if provided
      actions: actions,
      leading: leading,
      centerTitle: centerTitle,
      backgroundColor: backgroundColor ?? Colors.white,
      foregroundColor: foregroundColor ?? AppTheme.primaryBlack,
      elevation: 0,
      scrolledUnderElevation: 0,
    );
  }

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);
}
