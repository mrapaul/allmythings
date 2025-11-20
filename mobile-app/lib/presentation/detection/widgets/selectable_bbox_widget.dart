import 'package:flutter/material.dart';

class SelectableBboxWidget extends StatelessWidget {
  const SelectableBboxWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: Colors.red, width: 2),
      ),
    );
  }
}
