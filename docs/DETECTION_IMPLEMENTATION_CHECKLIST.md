# Detection Architecture - Implementation Checklist

**Project**: Visual Home Inventory Manager
**Goal**: Improve detection accuracy from 20% to 95%+
**Timeline**: 4 weeks

---

## Pre-Implementation Setup

### Environment Setup
- [ ] Get API keys
  - [ ] Anthropic API key (Claude Vision) - https://console.anthropic.com/
  - [ ] OpenAI API key (GPT-4o Vision) - https://platform.openai.com/
  - [ ] API4AI API key (Furniture API) - https://api4.ai/
- [ ] Update `.env` file with new keys
- [ ] Verify existing providers are working (YOLO, Gemini, Google Vision)
- [ ] Install new dependencies: `npm install @anthropic-ai/sdk openai sharp`

### Database Setup
- [ ] Review database schema in `DETECTION_ARCHITECTURE_DESIGN.md` Section 1
- [ ] Create migration files in `/api-service/migrations/`
- [ ] Run migrations on development database
- [ ] Verify tables created: `detection_corrections`, `detection_cache`, `provider_performance`

### Code Structure Setup
- [ ] Create `/api-service/src/types/` directory
- [ ] Create `/api-service/src/services/` (already exists, review)
- [ ] Create `/api-service/src/adapters/` (already exists, review)
- [ ] Plan test structure in `/api-service/tests/`

---

## Phase 1: Quick Wins (Week 1)

**Goal**: Improve recall from 20% to 60%

### Task 1.1: Upgrade Gemini Prompt (1 day)
- [x] Update model to `gemini-2.5-pro-preview` (already done)
- [ ] Review and improve systematic detection prompt
- [ ] Add grid-based scanning instructions
- [ ] Test with IKEA room images
- [ ] Measure detection improvement

**Files to modify**:
- `/api-service/src/adapters/gemini-vision.adapter.ts`

**Expected result**: 20% → 35% recall

### Task 1.2: Create Claude Vision Adapter (1 day)
- [ ] Create `/api-service/src/adapters/claude-vision.adapter.ts`
- [ ] Implement `ProviderAdapter` interface
- [ ] Use `claude-sonnet-4-20250514` model
- [ ] Implement systematic detection prompt
- [ ] Add circuit breaker pattern
- [ ] Write unit tests

**Files to create**:
- `/api-service/src/adapters/claude-vision.adapter.ts`
- `/api-service/tests/unit/claude-vision.adapter.test.ts`

**Expected result**: 35% → 55% recall (with ensemble)

### Task 1.3: Integrate Claude into VisionOrchestrator (0.5 day)
- [ ] Add Claude provider in `initializeProviders()`
- [ ] Set provider weight to 0.95
- [ ] Test provider health check
- [ ] Verify ensemble fusion works

**Files to modify**:
- `/api-service/src/services/vision-orchestrator.service.ts`
- `/api-service/src/services/ensemble-fusion.service.ts`

### Task 1.4: Implement Detection Caching (1.5 days)
- [ ] Create `/api-service/src/services/detection-cache.service.ts`
- [ ] Implement SHA-256 hash computation
- [ ] Implement in-memory cache with TTL
- [ ] Add cache hit/miss logging
- [ ] Write unit tests
- [ ] Integrate into detect route

**Files to create**:
- `/api-service/src/services/detection-cache.service.ts`
- `/api-service/tests/unit/detection-cache.service.test.ts`

**Files to modify**:
- `/api-service/src/routes/detect.route.ts`

**Expected result**: 55% recall, 50%+ cache hit rate, $0.01/image cost

### Task 1.5: Update Provider Weights (0.5 day)
- [ ] Update weights in `ensemble-fusion.service.ts`
  - YOLO-World: 1.0
  - Claude: 0.95 (NEW)
  - Gemini: 0.7 (DOWNGRADE from 0.8)
  - Others: as documented
- [ ] Test ensemble with new weights
- [ ] Measure accuracy improvement

**Files to modify**:
- `/api-service/src/services/ensemble-fusion.service.ts`

**Expected result**: 55% → 60% recall

### Week 1 Testing & Validation
- [ ] Run unit tests: `npm test`
- [ ] Test with IKEA room images in `/test_images/ikea_rooms/`
- [ ] Measure detection recall, precision, processing time
- [ ] Document results

**Success Criteria**:
- [ ] Detection recall ≥ 60%
- [ ] Cache hit rate ≥ 50%
- [ ] API response time < 3s
- [ ] All tests passing

---

## Phase 2: User Feedback Loop (Week 2)

**Goal**: Improve recall from 60% to 80% through corrections

### Task 2.1: Create Corrections Database (0.5 day)
- [ ] Create migration `001_create_detection_corrections.sql`
- [ ] Add indexes for common queries
- [ ] Run migration on dev database
- [ ] Verify table structure

**Files to create**:
- `/api-service/migrations/001_create_detection_corrections.sql`

### Task 2.2: Create Corrections Types (0.5 day)
- [ ] Create `/api-service/src/types/corrections.types.ts`
- [ ] Define TypeScript interfaces:
  - `CorrectionType` enum
  - `UserConfidence` enum
  - `CorrectionStatus` enum
  - `DetectionCorrection` interface
  - `SubmitCorrectionRequest` interface
  - `CorrectionStatistics` interface
- [ ] Add Zod schemas for validation

**Files to create**:
- `/api-service/src/types/corrections.types.ts`

### Task 2.3: Enhance CorrectionsService (1 day)
- [ ] Review existing `/api-service/src/services/corrections.service.ts`
- [ ] Add database integration (replace file-based storage)
- [ ] Implement correction CRUD operations
- [ ] Add statistics calculation
- [ ] Write unit tests

**Files to modify**:
- `/api-service/src/services/corrections.service.ts`

**Files to create**:
- `/api-service/tests/unit/corrections.service.test.ts`

### Task 2.4: Create CorrectionsLearningService (1 day)
- [ ] Create `/api-service/src/services/corrections-learning.service.ts`
- [ ] Implement `applyCorrections()` method
- [ ] Handle ADD corrections (missing objects)
- [ ] Handle REMOVE corrections (false positives)
- [ ] Handle MODIFY corrections (wrong labels/boxes)
- [ ] Write unit tests

**Files to create**:
- `/api-service/src/services/corrections-learning.service.ts`
- `/api-service/tests/unit/corrections-learning.service.test.ts`

### Task 2.5: Create Corrections API Routes (1 day)
- [ ] Review existing `/api-service/src/routes/corrections.routes.ts`
- [ ] Implement POST `/v1/corrections` endpoint
- [ ] Implement GET `/v1/corrections/:imageHash` endpoint
- [ ] Implement GET `/v1/corrections/stats` endpoint
- [ ] Implement POST `/v1/corrections/export` endpoint
- [ ] Add request validation (Zod schemas)
- [ ] Write integration tests

**Files to modify**:
- `/api-service/src/routes/corrections.routes.ts`

**Files to create**:
- `/api-service/tests/integration/corrections.integration.test.ts`

### Task 2.6: Integrate Corrections in Detection Flow (1 day)
- [ ] Update `/api-service/src/routes/detect.route.ts`
- [ ] Add `enableCorrections` query parameter
- [ ] Apply corrections after ensemble fusion
- [ ] Invalidate cache when correction submitted
- [ ] Add `correctionsApplied` to response
- [ ] Test end-to-end flow

**Files to modify**:
- `/api-service/src/routes/detect.route.ts`

### Task 2.7: Mobile App Corrections UI (1 day)
- [ ] Add "Report Issue" button on detection results screen
- [ ] Create correction submission modal
- [ ] Implement ADD missing object (tap to draw box)
- [ ] Implement REMOVE false positive (tap object)
- [ ] Implement MODIFY label (edit label)
- [ ] Send correction to API

**Files to modify**:
- `/mobile-app/lib/presentation/screens/detection_results_screen.dart`

**Files to create**:
- `/mobile-app/lib/presentation/widgets/correction_modal.dart`

### Week 2 Testing & Validation
- [ ] Submit test corrections via API
- [ ] Verify corrections applied on next detection
- [ ] Test mobile app correction flow
- [ ] Measure detection improvement

**Success Criteria**:
- [ ] Detection recall ≥ 80%
- [ ] Corrections API functional
- [ ] Users can submit corrections from mobile app
- [ ] Corrections automatically applied

---

## Phase 3: Advanced Pipeline (Week 3)

**Goal**: Improve recall from 80% to 95%

### Task 3.1: Create Detection Types (0.5 day)
- [ ] Create `/api-service/src/types/detection.types.ts`
- [ ] Define `DetectionMode` enum
- [ ] Define `ImageRegion` interface
- [ ] Define `HybridDetectionResult` interface
- [ ] Define `ObjectProperties` interface
- [ ] Add Zod schemas

**Files to create**:
- `/api-service/src/types/detection.types.ts`

### Task 3.2: Create RegionScannerService (2 days)
- [ ] Create `/api-service/src/services/region-scanner.service.ts`
- [ ] Define default 5 overlapping regions
- [ ] Implement image cropping with Sharp
- [ ] Implement region scanning (parallel or sequential)
- [ ] Implement coordinate transformation
- [ ] Implement NMS-based de-duplication
- [ ] Write unit tests

**Files to create**:
- `/api-service/src/services/region-scanner.service.ts`
- `/api-service/tests/unit/region-scanner.service.test.ts`

### Task 3.3: Create HybridDetectionService (2 days)
- [ ] Create `/api-service/src/services/hybrid-detection.service.ts`
- [ ] Implement Stage 1: YOLO bounding boxes
- [ ] Implement Stage 2: Crop each box with padding
- [ ] Implement Stage 3: LLM classification (parallel)
- [ ] Implement Stage 4: Merge results
- [ ] Extract properties from LLM response
- [ ] Write unit tests

**Files to create**:
- `/api-service/src/services/hybrid-detection.service.ts`
- `/api-service/tests/unit/hybrid-detection.service.test.ts`

### Task 3.4: Create OpenAI Vision Adapter (1 day)
- [ ] Create `/api-service/src/adapters/openai-vision.adapter.ts`
- [ ] Implement `ProviderAdapter` interface
- [ ] Use `gpt-4o` model
- [ ] Implement structured output with JSON mode
- [ ] Add circuit breaker
- [ ] Write unit tests

**Files to create**:
- `/api-service/src/adapters/openai-vision.adapter.ts`
- `/api-service/tests/unit/openai-vision.adapter.test.ts`

### Task 3.5: Create API4AI Furniture Adapter (1 day)
- [ ] Create `/api-service/src/adapters/api4ai-furniture.adapter.ts`
- [ ] Implement `ProviderAdapter` interface
- [ ] Use API4AI Furniture Recognition API
- [ ] Map furniture categories to canonical labels
- [ ] Add circuit breaker
- [ ] Write unit tests

**Files to create**:
- `/api-service/src/adapters/api4ai-furniture.adapter.ts`
- `/api-service/tests/unit/api4ai-furniture.adapter.test.ts`

### Task 3.6: Integrate New Providers (0.5 day)
- [ ] Add OpenAI provider to VisionOrchestrator
- [ ] Add API4AI provider to VisionOrchestrator
- [ ] Set provider weights (GPT-4o: 0.95, API4AI: 0.98)
- [ ] Test provider health checks

**Files to modify**:
- `/api-service/src/services/vision-orchestrator.service.ts`
- `/api-service/src/services/ensemble-fusion.service.ts`

### Task 3.7: Implement Detection Modes (1 day)
- [ ] Update `/api-service/src/routes/detect.route.ts`
- [ ] Add `mode` query parameter
- [ ] Implement Fast mode (YOLO only)
- [ ] Implement Standard mode (YOLO + GPT-4o)
- [ ] Implement Thorough mode (YOLO + Claude + API4AI)
- [ ] Implement Multi-Pass mode (Region scanning)
- [ ] Add mode-specific routing logic

**Files to modify**:
- `/api-service/src/routes/detect.route.ts`

### Week 3 Testing & Validation
- [ ] Test all detection modes with room images
- [ ] Benchmark processing time for each mode
- [ ] Measure recall/precision for each mode
- [ ] Test region scanning with dense scenes (20+ objects)
- [ ] Test hybrid detection pipeline

**Success Criteria**:
- [ ] Detection recall ≥ 95% (thorough/multi-pass mode)
- [ ] Detection recall ≥ 85% (standard mode)
- [ ] All modes functional
- [ ] Processing time acceptable (< 10s for thorough)

---

## Phase 4: Optimization & Production (Week 4)

**Goal**: Production-ready system with monitoring

### Task 4.1: Performance Optimization (1 day)
- [ ] Profile slow operations
- [ ] Optimize image processing (Sharp operations)
- [ ] Implement request-level caching for provider calls
- [ ] Add parallel execution where possible
- [ ] Reduce unnecessary database queries

### Task 4.2: Cost Optimization (1 day)
- [ ] Implement intelligent mode selection (auto-detect density)
- [ ] Add cost tracking per request
- [ ] Optimize cache TTL for best hit rate
- [ ] Add budget limits and alerts
- [ ] Document cost-saving best practices

### Task 4.3: Provider Performance Monitoring (1 day)
- [ ] Create migration `003_create_provider_performance.sql`
- [ ] Implement performance data collection
- [ ] Track latency, success rate, costs per provider
- [ ] Create performance dashboard endpoint
- [ ] Set up alerts for provider failures

**Files to create**:
- `/api-service/migrations/003_create_provider_performance.sql`
- `/api-service/src/services/provider-performance.service.ts`

### Task 4.4: Enhanced Error Handling (1 day)
- [ ] Add retry logic for transient failures
- [ ] Implement graceful degradation (fallback providers)
- [ ] Add detailed error logging
- [ ] Create error response standards
- [ ] Document error codes

### Task 4.5: API Documentation (1 day)
- [ ] Update OpenAPI spec with new endpoints
- [ ] Document detection modes
- [ ] Add request/response examples
- [ ] Create API usage guide
- [ ] Generate API docs (Swagger UI)

**Files to modify**:
- `/api-service/docs/openapi.yaml` (or create if doesn't exist)

### Task 4.6: Integration Testing (2 days)
- [ ] Create comprehensive integration test suite
- [ ] Test detection pipeline end-to-end
- [ ] Test corrections workflow
- [ ] Test caching behavior
- [ ] Test all detection modes
- [ ] Load testing (100+ concurrent requests)

**Files to create**:
- `/api-service/tests/integration/detection-pipeline.integration.test.ts`
- `/api-service/tests/integration/corrections-workflow.integration.test.ts`
- `/api-service/tests/load/detection-load.test.ts`

### Task 4.7: Mobile App Integration (1 day)
- [ ] Update API client with new endpoints
- [ ] Add detection mode selector in UI
- [ ] Display detection metadata (mode, cache hit, etc.)
- [ ] Implement corrections UI flow
- [ ] Test end-to-end on real devices

**Files to modify**:
- `/mobile-app/lib/data/remote/api_client.dart`
- `/mobile-app/lib/presentation/screens/detection_results_screen.dart`

### Week 4 Testing & Validation
- [ ] Run full test suite (unit + integration + load)
- [ ] Performance benchmarking
- [ ] Security audit (API keys, data privacy)
- [ ] Code review
- [ ] Documentation review

**Success Criteria**:
- [ ] All tests passing (100% critical paths)
- [ ] API response time < 2s (standard mode)
- [ ] Cost per image < $0.05 (with caching)
- [ ] Detection recall ≥ 95% (thorough mode)
- [ ] Cache hit rate ≥ 60%
- [ ] Zero critical security issues

---

## Production Deployment

### Pre-Deployment
- [ ] Review all environment variables
- [ ] Set up production database
- [ ] Run database migrations on production
- [ ] Configure monitoring (logs, metrics, alerts)
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Create backup strategy for corrections data

### Deployment Steps
- [ ] Deploy API service to production
- [ ] Verify health check endpoint
- [ ] Test detection endpoint with sample image
- [ ] Deploy mobile app update to stores
- [ ] Monitor error rates and performance

### Post-Deployment
- [ ] Monitor detection quality metrics
- [ ] Track API costs daily
- [ ] Review user-submitted corrections
- [ ] Iterate on provider weights based on real data
- [ ] Plan for model retraining (weekly/monthly)

---

## Ongoing Maintenance

### Daily
- [ ] Check provider health
- [ ] Monitor API costs
- [ ] Review error logs

### Weekly
- [ ] Review correction statistics
- [ ] Analyze top misclassifications
- [ ] Adjust provider weights if needed
- [ ] Export corrections for model training

### Monthly
- [ ] Retrain/fine-tune YOLO on user corrections
- [ ] Update prompts based on common errors
- [ ] Review and optimize costs
- [ ] Plan feature improvements

---

## Validation Metrics

Track these metrics weekly:

```typescript
interface WeeklyMetrics {
  // Detection Quality
  avgRecall: number;              // Target: 95%+
  avgPrecision: number;           // Target: 90%+
  avgProcessingTime: number;      // Target: < 2s (standard)

  // Cost Efficiency
  avgCostPerImage: number;        // Target: < $0.05
  cacheHitRate: number;           // Target: > 60%
  totalApiCost: number;           // Monitor trend

  // User Feedback
  totalCorrections: number;       // Monitor trend
  correctionsPerImage: number;    // Target: < 1
  addedObjects: number;           // Target: decrease
  removedObjects: number;         // Target: decrease

  // Provider Performance
  providerSuccessRates: {         // Target: > 95% each
    [provider: string]: number;
  };
  providerLatencies: {            // Target: < 2s each
    [provider: string]: number;
  };
}
```

---

## Risk Mitigation

### Risks & Mitigation Strategies

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Provider API outage | High | Medium | Implement fallback providers, circuit breakers |
| High API costs | Medium | Medium | Aggressive caching, mode selection, budget alerts |
| Poor detection quality | High | Low | Multiple providers, ensemble fusion, user corrections |
| Slow processing time | Medium | Medium | Parallel execution, caching, mode optimization |
| Data privacy concerns | High | Low | No image storage, hash-based caching, anonymized corrections |

---

## Success Checklist

### Week 1 ✅
- [ ] Claude Vision integrated
- [ ] Detection caching working
- [ ] Recall improved to 60%+
- [ ] Cache hit rate 50%+

### Week 2 ✅
- [ ] Corrections database operational
- [ ] Corrections API functional
- [ ] Mobile corrections UI working
- [ ] Recall improved to 80%+

### Week 3 ✅
- [ ] Region scanning implemented
- [ ] Hybrid detection working
- [ ] All new providers integrated
- [ ] Recall improved to 95%+

### Week 4 ✅
- [ ] Production deployment complete
- [ ] All tests passing
- [ ] Performance targets met
- [ ] Documentation complete

---

## Contact & Support

**Architecture Design**: See `DETECTION_ARCHITECTURE_DESIGN.md`
**Quick Reference**: See `DETECTION_ARCHITECTURE_QUICK_REFERENCE.md`
**Summary**: See `DETECTION_ARCHITECTURE_SUMMARY.md`

**Questions?** Contact Backend Architect (Claude Code)
