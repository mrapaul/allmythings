import 'package:all_my_things/domain/models/item.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

class ItemCard extends StatelessWidget {
  const ItemCard({
    required this.item,
    required this.onTap,
    super.key,
    this.width,
    this.height,
    this.borderRadius,
  });
  final Item item;
  final VoidCallback onTap;
  final double? width;
  final double? height;
  final BorderRadius? borderRadius;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.all(8),
      shape: RoundedRectangleBorder(
        borderRadius: borderRadius ?? BorderRadius.circular(12),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: borderRadius ?? BorderRadius.circular(12),
        child: Container(
          width: width,
          height: height,
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Image
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: item.imagePath.startsWith('http')
                      ? CachedNetworkImage(
                          imageUrl: item.imagePath,
                          fit: BoxFit.cover,
                          width: double.infinity,
                          placeholder: (context, url) => const Center(
                            child: CircularProgressIndicator(),
                          ),
                          errorWidget: (context, url, error) =>
                              const Icon(Icons.error),
                        )
                      : Image.asset(
                          item.imagePath,
                          fit: BoxFit.cover,
                          width: double.infinity,
                        ),
                ),
              ),
              const SizedBox(height: 8),

              // Title
              Text(
                item.name,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),

              // Description (if available)
              if (item.description?.isNotEmpty ?? false) ...[
                const SizedBox(height: 4),
                Text(
                  item.description!,
                  style: Theme.of(context).textTheme.bodySmall,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],

              // Labels (if any)
              if (item.labels.isNotEmpty) ...[
                const SizedBox(height: 4),
                Wrap(
                  spacing: 4,
                  children: item.labels
                      .map(
                        (label) => Chip(
                          label: Text(
                            label,
                            style: const TextStyle(fontSize: 10),
                          ),
                          padding: EdgeInsets.zero,
                          visualDensity: VisualDensity.compact,
                        ),
                      )
                      .toList(),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
