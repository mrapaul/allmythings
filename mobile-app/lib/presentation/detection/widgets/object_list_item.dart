import 'package:flutter/material.dart';

class ObjectListItem extends StatelessWidget {
  const ObjectListItem({super.key});

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: ListTile(
        title: Text('Object Label'),
        subtitle: Text('Confidence: 99%'),
      ),
    );
  }
}
