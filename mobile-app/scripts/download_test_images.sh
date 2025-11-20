#!/bin/bash

# Create test images directory if it doesn't exist
mkdir -p test_images

# Download sample images for testing
curl -o test_images/coffee.jpg https://images.unsplash.com/photo-1495474475677-df3a49a015d3?w=800&q=80
curl -o test_images/laptop.jpg https://images.unsplash.com/photo-1496181133205-80b16596e4e3?w=800&q=80
curl -o test_images/books.jpg https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=800&q=80
curl -o test_images/plant.jpg https://images.unsplash.com/photo-1485955900956-50d97f4b9ac7?w=800&q=80
curl -o test_images/chair.jpg https://images.unsplash.com/photo-1503602642458-232111445657?w=800&q=80

echo "✅ Downloaded test images to test_images/ directory"
