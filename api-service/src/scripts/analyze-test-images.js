"use strict";
/**
 * Analyze test images with different vision providers
 * Compares accuracy, object detection counts, and confidence scores
 * across Mock, Google Vision, and AWS Rekognition providers
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const fs_2 = require("fs");
const ANALYSIS_OUTPUT_DIR = path_1.default.join(process.cwd(), 'analysis_results');
const TEST_IMAGES_DIR = path_1.default.join(path_1.default.dirname(process.cwd()), 'test_images');
/**
 * Parse image path to extract category
 */
function getCategoryFromPath(imagePath) {
    const parts = imagePath.split(path_1.default.sep);
    return parts[parts.length - 2] || 'unknown';
}
/**
 * Simulate analysis with different providers
 * In production, this would call actual provider adapters
 */
async function analyzeWithProvider(imagePath, provider) {
    const startTime = Date.now();
    try {
        // Simulate different provider behaviors
        const simulatedResults = {
            mock: [
                { object: 'couch', confidence: 0.95 },
                { object: 'coffee table', confidence: 0.88 },
                { object: 'lamp', confidence: 0.82 },
                { object: 'wall', confidence: 0.99 },
                { object: 'floor', confidence: 0.97 },
            ],
            google: [
                { object: 'furniture', confidence: 0.92 },
                { object: 'sofa', confidence: 0.89 },
                { object: 'table', confidence: 0.85 },
                { object: 'lamp', confidence: 0.81 },
                { object: 'ceiling', confidence: 0.79 },
                { object: 'wall', confidence: 0.98 },
            ],
            aws: [
                { object: 'couch', confidence: 0.91 },
                { object: 'coffee table', confidence: 0.87 },
                { object: 'reading lamp', confidence: 0.80 },
                { object: 'hardwood floor', confidence: 0.96 },
                { object: 'wall decoration', confidence: 0.75 },
            ],
        };
        const detections = simulatedResults[provider] || [];
        const executionTime = Date.now() - startTime;
        return {
            objectCount: detections.length,
            detections,
            executionTime,
        };
    }
    catch (error) {
        return {
            objectCount: 0,
            detections: [],
            executionTime: Date.now() - startTime,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
/**
 * Analyze a single image with all providers
 */
async function analyzeImage(imagePath) {
    const fileName = path_1.default.basename(imagePath);
    const category = getCategoryFromPath(imagePath);
    const timestamp = new Date().toISOString();
    const providers = ['mock', 'google', 'aws'];
    const results = {};
    // Analyze with each provider
    for (const provider of providers) {
        const result = await analyzeWithProvider(imagePath, provider);
        results[provider] = result;
    }
    // Calculate comparison metrics
    const objectCounts = providers
        .map((p) => results[p].objectCount)
        .filter((count) => count > 0);
    const avgObjectCount = objectCounts.length > 0
        ? objectCounts.reduce((a, b) => a + b, 0) / objectCounts.length
        : 0;
    const maxObjectCount = Math.max(...objectCounts, 0);
    const minObjectCount = objectCounts.length > 0 ? Math.min(...objectCounts) : 0;
    // Calculate consistency (standard deviation)
    let consistency = 100;
    if (objectCounts.length > 1) {
        const variance = objectCounts.reduce((sum, count) => {
            return sum + Math.pow(count - avgObjectCount, 2);
        }, 0) / objectCounts.length;
        const stdDev = Math.sqrt(variance);
        consistency = Math.max(0, 100 - stdDev * 10);
    }
    return {
        imagePath,
        fileName,
        category,
        timestamp,
        providers: results,
        comparison: {
            avgObjectCount,
            maxObjectCount,
            minObjectCount,
            consistency: Math.round(consistency),
        },
    };
}
/**
 * Analyze all images in test directory
 */
async function analyzeAllImages() {
    const results = [];
    if (!fs_1.default.existsSync(TEST_IMAGES_DIR)) {
        console.log(`Test images directory not found: ${TEST_IMAGES_DIR}`);
        return results;
    }
    // Find all image files recursively
    const imageFiles = [];
    function findImages(dir) {
        const files = fs_1.default.readdirSync(dir);
        for (const file of files) {
            const fullPath = path_1.default.join(dir, file);
            const stat = fs_1.default.statSync(fullPath);
            if (stat.isDirectory()) {
                findImages(fullPath);
            }
            else if (/\.(jpg|jpeg|png)$/i.test(file)) {
                imageFiles.push(fullPath);
            }
        }
    }
    findImages(TEST_IMAGES_DIR);
    console.log(`Found ${imageFiles.length} images. Analyzing...`);
    // Analyze each image
    for (const imagePath of imageFiles) {
        console.log(`Analyzing: ${path_1.default.relative(TEST_IMAGES_DIR, imagePath)}`);
        const result = await analyzeImage(imagePath);
        results.push(result);
    }
    return results;
}
/**
 * Generate summary statistics
 */
function generateSummary(results) {
    const providers = ['mock', 'google', 'aws'];
    const stats = {
        totalImages: results.length,
        categoryCounts: {},
        providerStats: {},
        bestProvider: '',
        recommendations: [],
    };
    // Count by category
    for (const result of results) {
        stats.categoryCounts[result.category] =
            (stats.categoryCounts[result.category] || 0) + 1;
    }
    // Calculate provider statistics
    for (const provider of providers) {
        const detections = results.flatMap((r) => r.providers[provider].detections);
        const avgObjectCount = results.reduce((sum, r) => sum + r.providers[provider].objectCount, 0) / results.length;
        const avgConfidence = detections.length > 0
            ? detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length
            : 0;
        const totalExecutionTime = results.reduce((sum, r) => sum + r.providers[provider].executionTime, 0);
        stats.providerStats[provider] = {
            avgObjectCount,
            totalDetections: detections.length,
            avgConfidence,
            totalExecutionTime,
        };
    }
    // Determine best provider
    const providerScores = providers.map((provider) => {
        const stats_p = stats.providerStats[provider];
        // Score: higher object count + higher confidence - execution time penalty
        const score = stats_p.avgObjectCount * 10 +
            stats_p.avgConfidence * 100 -
            stats_p.totalExecutionTime / 1000;
        return { provider, score };
    });
    const bestProvider = providerScores.reduce((best, current) => current.score > best.score ? current : best);
    stats.bestProvider = bestProvider.provider;
    // Generate recommendations
    stats.recommendations = [
        `Best performing provider: ${stats.bestProvider.toUpperCase()}`,
        `Average objects detected: ${Object.values(stats.providerStats)
            .map((p) => p.avgObjectCount)
            .reduce((a, b) => a + b) / providers.length}`,
        `Consider using ${stats.bestProvider} as primary provider for initial detection`,
        'Implement ensemble detection combining all three providers for improved accuracy',
        'Add provider-specific tuning parameters based on room type',
    ];
    return stats;
}
/**
 * Save results to JSON file
 */
function saveResults(results, summary) {
    // Create output directory
    if (!fs_1.default.existsSync(ANALYSIS_OUTPUT_DIR)) {
        fs_1.default.mkdirSync(ANALYSIS_OUTPUT_DIR, { recursive: true });
    }
    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-');
    // Save detailed results
    const detailedFile = path_1.default.join(ANALYSIS_OUTPUT_DIR, `detailed_analysis_${timestamp}.json`);
    (0, fs_2.writeFileSync)(detailedFile, JSON.stringify(results, null, 2));
    console.log(`Detailed results saved: ${detailedFile}`);
    // Save summary
    const summaryFile = path_1.default.join(ANALYSIS_OUTPUT_DIR, `summary_${timestamp}.json`);
    (0, fs_2.writeFileSync)(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`Summary saved: ${summaryFile}`);
    // Generate report
    const report = generateReport(results, summary);
    const reportFile = path_1.default.join(ANALYSIS_OUTPUT_DIR, `report_${timestamp}.txt`);
    (0, fs_2.writeFileSync)(reportFile, report);
    console.log(`Report saved: ${reportFile}`);
}
/**
 * Generate human-readable report
 */
function generateReport(results, summary) {
    let report = '='.repeat(70) + '\n';
    report += 'VISION PROVIDER ANALYSIS REPORT\n';
    report += 'Generated: ' + new Date().toISOString() + '\n';
    report += '='.repeat(70) + '\n\n';
    // Summary section
    report += 'SUMMARY STATISTICS\n';
    report += '-'.repeat(70) + '\n';
    report += `Total Images Analyzed: ${summary.totalImages}\n`;
    report += `Best Provider: ${summary.bestProvider.toUpperCase()}\n\n`;
    // Category breakdown
    report += 'Images by Category:\n';
    for (const [category, count] of Object.entries(summary.categoryCounts)) {
        report += `  ${category}: ${count}\n`;
    }
    report += '\n';
    // Provider statistics
    report += 'PROVIDER STATISTICS\n';
    report += '-'.repeat(70) + '\n';
    for (const [provider, stats] of Object.entries(summary.providerStats)) {
        report += `\n${provider.toUpperCase()}:\n`;
        report += `  Avg Objects Detected: ${stats.avgObjectCount.toFixed(2)}\n`;
        report += `  Total Detections: ${stats.totalDetections}\n`;
        report += `  Avg Confidence: ${(stats.avgConfidence * 100).toFixed(1)}%\n`;
        report += `  Total Execution Time: ${(stats.totalExecutionTime / 1000).toFixed(2)}s\n`;
    }
    // Recommendations
    report += '\n' + 'RECOMMENDATIONS\n';
    report += '-'.repeat(70) + '\n';
    for (const rec of summary.recommendations) {
        report += `• ${rec}\n`;
    }
    report += '\n' + '='.repeat(70) + '\n';
    return report;
}
/**
 * Main execution
 */
async function main() {
    try {
        console.log('Starting image analysis...\n');
        const results = await analyzeAllImages();
        if (results.length === 0) {
            console.log('No images found to analyze. Run download_test_images.py first.');
            return;
        }
        const summary = generateSummary(results);
        saveResults(results, summary);
        console.log('\n' + '='.repeat(70));
        console.log('Analysis Complete!');
        console.log('='.repeat(70));
        console.log(`\nAnalyzed ${results.length} images across ${Object.keys(summary.categoryCounts).length} categories`);
        console.log(`Best provider: ${summary.bestProvider.toUpperCase()}`);
        console.log(`\nResults saved to: ${ANALYSIS_OUTPUT_DIR}\n`);
    }
    catch (error) {
        console.error('Error during analysis:', error);
        process.exit(1);
    }
}
main();
