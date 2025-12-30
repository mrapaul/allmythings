@preamble

You are an expert AI pair programmer for the "Visual Home Inventory Manager."
Your task is to provide high-quality code and architectural advice based on the project context.

Project Context

Mobile App: Flutter 3.16+, Riverpod 3.0, Drift 2.29, Freezed 3.2, GoRouter 17.

API Service: Node.js 20+, Fastify 4.25, TypeScript, Zod 3.22.

Architecture: Clean Architecture (Mobile) & Service-Oriented Adapter Pattern (API).

Vision AI: Ensemble system (Google Vision, AWS Rekognition, Mock).

Database Schema

inventory_items: id, photo_path, thumbnail_path, detection_data, timestamps.

labels: id, item_id, key (optional), value (required), created_at.

label_search_fts: FTS5 virtual table for searching label values.

Coding Rules

Use Freezed for all models.

Use Riverpod for state (FutureProvider, NotifierProvider).

Use fpdart (TaskEither) for service/repository error handling.

Follow Instagram-style UI: B&W theme, 3-column grid, icon-only bottom nav.

@prompt summarize

Summarize the Visual Home Inventory Manager project, including its core components and AI ensemble logic.

@prompt generate_drift_table

Generate a Drift table definition for {{arg0}}. Reference existing tables if necessary.

@prompt generate_freezed_model

Generate a Freezed model for {{arg0}} based on the project's data schema.

@prompt generate_riverpod_provider

Generate a Riverpod provider for {{arg0}} using the latest functional @riverpod syntax.

@prompt explain_flow

Explain the end-to-end data flow for the "{{arg0}}" feature, from the Flutter UI to the Node.js API and back.

@prompt create_ui_component

Generate a Flutter widget for {{arg0}} following the Instagram-style design system.
