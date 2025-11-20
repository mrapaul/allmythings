# Entity Relationship Diagram - Visual Home Inventory Manager

## Overview

This document contains the Entity-Relationship Diagram (ERD) for the Visual Home Inventory Manager database schema, showing entities, relationships, and key attributes.

---

## Complete ERD (High-Level)

```mermaid
erDiagram
    USERS ||--o{ INVENTORY_ITEMS : owns
    USERS ||--o{ TAGS : creates
    USERS ||--o{ LOCATIONS : defines
    USERS ||--o{ DETECTION_SESSIONS : initiates
    USERS ||--o{ SYNC_QUEUE : has
    USERS ||--|| USER_PREFERENCES : has

    INVENTORY_ITEMS ||--o{ ITEM_LABELS : has
    INVENTORY_ITEMS ||--o{ ITEM_TAGS : has
    INVENTORY_ITEMS }o--|| LOCATIONS : "located in"
    INVENTORY_ITEMS }o--|| LABELS : "primary label"
    INVENTORY_ITEMS ||--o{ ITEM_IMAGES : has
    INVENTORY_ITEMS }o--|| DETECTION_SESSIONS : "detected by"

    LABELS ||--o{ ITEM_LABELS : "applied to"
    LABELS ||--o{ LABELS : "parent of"

    TAGS ||--o{ ITEM_TAGS : "tagged on"

    LOCATIONS ||--o{ LOCATIONS : "contains"

    ITEM_IMAGES ||--|| IMAGE_METADATA : has
    ITEM_IMAGES ||--o{ DETECTION_SESSIONS : "analyzed in"

    DETECTION_SESSIONS ||--o{ DETECTION_RESULTS : produces
    DETECTION_RESULTS ||--|| BOUNDING_BOXES : has

    USERS {
        uuid id PK
        string email UK
        string auth_provider_id UK
        string display_name
        timestamp created_at
        timestamp last_synced_at
    }

    INVENTORY_ITEMS {
        uuid id PK
        uuid user_id FK
        string title
        text description
        uuid primary_label_id FK
        uuid location_id FK
        integer quantity
        bigint estimated_value_cents
        date purchase_date
        date warranty_expiry_date
        timestamp created_at
        timestamp deleted_at
        integer version
    }

    LABELS {
        uuid id PK
        string name
        string normalized_name UK
        uuid parent_label_id FK
        integer level
        string path
        enum label_type
        string category
        integer usage_count
        decimal avg_confidence_score
    }

    TAGS {
        uuid id PK
        uuid user_id FK
        string name
        string normalized_name UK
        string color
        integer usage_count
    }

    LOCATIONS {
        uuid id PK
        uuid user_id FK
        string name
        uuid parent_location_id FK
        integer level
        string path UK
        enum location_type
        integer item_count
    }

    ITEM_LABELS {
        uuid id PK
        uuid item_id FK
        uuid label_id FK
        enum source
        decimal confidence_score
        boolean is_primary
    }

    ITEM_TAGS {
        uuid id PK
        uuid item_id FK
        uuid tag_id FK
    }

    ITEM_IMAGES {
        uuid id PK
        uuid item_id FK
        string storage_key
        string storage_url
        integer width
        integer height
        bigint file_size_bytes
        timestamp captured_at
        boolean is_primary
        enum upload_status
    }

    IMAGE_METADATA {
        uuid id PK
        uuid image_id FK
        string camera_make
        string camera_model
        jsonb exif_data
        decimal gps_latitude
        decimal gps_longitude
    }

    DETECTION_SESSIONS {
        uuid id PK
        uuid user_id FK
        uuid image_id FK
        array providers_used
        enum fusion_strategy
        enum status
        integer total_detections
        decimal avg_confidence
        decimal provider_agreement_score
        integer processing_time_ms
    }

    DETECTION_RESULTS {
        uuid id PK
        uuid detection_session_id FK
        enum provider
        string detected_label
        string normalized_label
        decimal confidence_score
        boolean has_bounding_box
        boolean is_selected
        jsonb provider_metadata
    }

    BOUNDING_BOXES {
        uuid id PK
        uuid detection_result_id FK
        decimal x_min
        decimal y_min
        decimal x_max
        decimal y_max
        decimal width
        decimal height
        decimal area
    }

    SYNC_QUEUE {
        uuid id PK
        uuid user_id FK
        enum entity_type
        uuid entity_id
        enum operation
        jsonb payload
        enum status
        integer priority
        bigserial sequence_number
    }

    USER_PREFERENCES {
        uuid id PK
        uuid user_id FK UK
        jsonb preferences
    }
```

---

## Core Inventory ERD (Detailed)

```mermaid
erDiagram
    INVENTORY_ITEMS ||--o{ ITEM_LABELS : "has many"
    INVENTORY_ITEMS ||--o{ ITEM_TAGS : "has many"
    INVENTORY_ITEMS }o--|| LOCATIONS : "belongs to"
    INVENTORY_ITEMS ||--o{ ITEM_IMAGES : "has many"

    LABELS ||--o{ ITEM_LABELS : "used in"
    LABELS }o--|| LABELS : "parent of"

    TAGS ||--o{ ITEM_TAGS : "used in"

    INVENTORY_ITEMS {
        uuid id "Primary Key"
        uuid user_id "Foreign Key → users"
        string title "NOT NULL"
        text description
        text notes
        uuid primary_label_id "Foreign Key → labels"
        uuid location_id "Foreign Key → locations"
        integer quantity "DEFAULT 1"
        bigint estimated_value_cents
        date purchase_date
        date warranty_expiry_date
        string serial_number
        string model_number
        string manufacturer
        uuid detection_session_id "Foreign Key → detection_sessions"
        uuid primary_image_id "Foreign Key → item_images"
        timestamp created_at "NOT NULL, DEFAULT NOW()"
        timestamp updated_at "NOT NULL, DEFAULT NOW()"
        timestamp deleted_at "Soft delete"
        timestamp synced_at
        enum sync_status "DEFAULT pending"
        integer version "Optimistic locking"
    }

    LABELS {
        uuid id "Primary Key"
        string name "NOT NULL"
        string normalized_name "NOT NULL"
        uuid parent_label_id "Foreign Key → labels (self)"
        integer level "Hierarchy depth, DEFAULT 0"
        string path "Materialized path"
        enum label_type "ai | user | system"
        string category "Top-level category"
        string icon
        string color
        integer usage_count "Denormalized, DEFAULT 0"
        enum ai_provider "google_vision | aws_rekognition"
        decimal avg_confidence_score "0-1 range"
        timestamp created_at
        timestamp updated_at
    }

    TAGS {
        uuid id "Primary Key"
        uuid user_id "Foreign Key → users"
        string name "NOT NULL"
        string normalized_name "NOT NULL"
        string color "Hex color code"
        string icon
        integer usage_count "Denormalized, DEFAULT 0"
        timestamp created_at
        timestamp updated_at
    }

    LOCATIONS {
        uuid id "Primary Key"
        uuid user_id "Foreign Key → users"
        string name "NOT NULL"
        uuid parent_location_id "Foreign Key → locations (self)"
        integer level "Hierarchy depth"
        string path "Materialized path, UNIQUE"
        enum location_type "home | floor | room | area | storage | outdoor"
        text description
        string icon
        integer item_count "Denormalized counter"
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    ITEM_LABELS {
        uuid id "Primary Key"
        uuid item_id "Foreign Key → inventory_items"
        uuid label_id "Foreign Key → labels"
        enum source "ai_detected | user_added | user_edited"
        decimal confidence_score "0-1 range, for AI labels"
        uuid detection_result_id "Foreign Key → detection_results"
        boolean is_primary "Only one per item"
        timestamp created_at
    }

    ITEM_TAGS {
        uuid id "Primary Key"
        uuid item_id "Foreign Key → inventory_items"
        uuid tag_id "Foreign Key → tags"
        timestamp created_at
    }

    ITEM_IMAGES {
        uuid id "Primary Key"
        uuid item_id "Foreign Key → inventory_items"
        string storage_provider "s3 | gcs | azure_blob"
        string storage_bucket
        string storage_key "Object key in bucket"
        string storage_url "Full URL"
        string thumbnail_storage_key
        string thumbnail_url
        integer width "Image width in pixels"
        integer height "Image height in pixels"
        bigint file_size_bytes
        string mime_type "DEFAULT image/jpeg"
        string content_hash "SHA256 for deduplication"
        timestamp captured_at "When photo was taken"
        boolean is_primary "Featured image"
        integer display_order "Sort order"
        enum upload_status "pending | uploading | uploaded | failed"
        timestamp created_at
        timestamp deleted_at
    }
```

---

## Detection & AI Processing ERD

```mermaid
erDiagram
    DETECTION_SESSIONS ||--o{ DETECTION_RESULTS : produces
    DETECTION_RESULTS ||--|| BOUNDING_BOXES : has
    ITEM_IMAGES ||--o{ DETECTION_SESSIONS : "analyzed in"

    DETECTION_SESSIONS {
        uuid id "Primary Key"
        uuid user_id "Foreign Key → users"
        uuid image_id "Foreign Key → item_images"
        timestamp requested_at "NOT NULL"
        timestamp completed_at
        array providers_used "e.g., {google_vision, aws_rekognition}"
        enum fusion_strategy "weighted_confidence | unanimous | majority_vote"
        enum status "pending | processing | completed | failed | partial"
        text error_message
        integer total_detections "Total labels detected"
        decimal avg_confidence "Average confidence across all results"
        decimal provider_agreement_score "0-1, how much providers agreed"
        integer processing_time_ms "API response time"
        string api_version
        string client_version
        inet request_ip "Client IP address"
        timestamp created_at
    }

    DETECTION_RESULTS {
        uuid id "Primary Key"
        uuid detection_session_id "Foreign Key → detection_sessions"
        enum provider "google_vision | aws_rekognition | azure_cv | mock"
        string provider_request_id "External tracking ID"
        string detected_label "Raw label from provider"
        string normalized_label "Sanitized for matching"
        decimal confidence_score "0-1 range, NOT NULL"
        boolean has_bounding_box "Whether spatial data exists"
        jsonb provider_metadata "Additional provider-specific data"
        string locale "Language/locale of detection"
        boolean is_selected "Chosen by ensemble fusion"
        decimal fusion_weight "Weight given in fusion algorithm"
        timestamp created_at
    }

    BOUNDING_BOXES {
        uuid id "Primary Key"
        uuid detection_result_id "Foreign Key → detection_results"
        decimal x_min "Normalized 0-1 range"
        decimal y_min "Normalized 0-1 range"
        decimal x_max "Normalized 0-1 range"
        decimal y_max "Normalized 0-1 range"
        decimal width "Normalized 0-1 range"
        decimal height "Normalized 0-1 range"
        decimal area "Normalized 0-1 range"
        decimal confidence "Bounding box confidence"
        timestamp created_at
    }

    ITEM_IMAGES {
        uuid id "Primary Key"
        uuid item_id "Foreign Key"
        string storage_url
        timestamp captured_at
    }
```

---

## Synchronization & Offline Support ERD

```mermaid
erDiagram
    USERS ||--o{ SYNC_QUEUE : has
    USERS ||--o{ SYNC_CONFLICTS : has

    SYNC_QUEUE {
        uuid id "Primary Key"
        uuid user_id "Foreign Key → users"
        enum entity_type "inventory_item | label | tag | location | item_image"
        uuid entity_id "ID of entity being synced"
        enum operation "create | update | delete"
        jsonb payload "Snapshot of entity data"
        enum status "pending | syncing | completed | failed | conflict"
        integer retry_count "Number of retry attempts"
        text last_error "Error message from last failure"
        integer priority "Higher priority syncs first"
        bigserial sequence_number "Ensures ordered sync"
        uuid depends_on_id "Foreign Key → sync_queue (dependency)"
        timestamp created_at
        timestamp scheduled_at "When to attempt sync"
        timestamp synced_at "When sync completed"
    }

    SYNC_CONFLICTS {
        uuid id "Primary Key"
        uuid user_id "Foreign Key → users"
        enum entity_type "Type of entity in conflict"
        uuid entity_id "ID of conflicted entity"
        jsonb local_version "Local state"
        jsonb remote_version "Remote state"
        timestamp local_timestamp
        timestamp remote_timestamp
        enum resolution_strategy "use_local | use_remote | merge | manual"
        timestamp resolved_at
        jsonb resolved_version "Final resolved state"
        timestamp created_at
    }

    USERS {
        uuid id "Primary Key"
        string email
    }
```

---

## Hierarchical Data Structure (Locations)

```mermaid
graph TD
    A[Home<br/>path: /home<br/>level: 0] --> B[First Floor<br/>path: /home/first-floor<br/>level: 1]
    A --> C[Second Floor<br/>path: /home/second-floor<br/>level: 1]
    A --> D[Garage<br/>path: /home/garage<br/>level: 1]

    B --> E[Living Room<br/>path: /home/first-floor/living-room<br/>level: 2]
    B --> F[Kitchen<br/>path: /home/first-floor/kitchen<br/>level: 2]

    E --> G[TV Stand<br/>path: /home/first-floor/living-room/tv-stand<br/>level: 3]
    E --> H[Bookshelf<br/>path: /home/first-floor/living-room/bookshelf<br/>level: 3]

    C --> I[Master Bedroom<br/>path: /home/second-floor/master-bedroom<br/>level: 2]
    I --> J[Closet<br/>path: /home/second-floor/master-bedroom/closet<br/>level: 3]

    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#fff4e1
    style D fill:#fff4e1
    style E fill:#f0ffe1
    style F fill:#f0ffe1
    style I fill:#f0ffe1
    style G fill:#ffe1f5
    style H fill:#ffe1f5
    style J fill:#ffe1f5
```

**Query Example**:
```sql
-- Get all items in "Living Room" and its sub-locations
SELECT i.*
FROM inventory_items i
JOIN locations l ON i.location_id = l.id
WHERE l.path LIKE '/home/first-floor/living-room%';
```

---

## Label Hierarchy Example (Taxonomy)

```mermaid
graph TD
    A[All Labels<br/>path: /<br/>level: 0] --> B[Furniture<br/>path: /furniture<br/>level: 1]
    A --> C[Electronics<br/>path: /electronics<br/>level: 1]
    A --> D[Clothing<br/>path: /clothing<br/>level: 1]

    B --> E[Seating<br/>path: /furniture/seating<br/>level: 2]
    B --> F[Storage<br/>path: /furniture/storage<br/>level: 2]

    E --> G[Chair<br/>path: /furniture/seating/chair<br/>level: 3]
    E --> H[Sofa<br/>path: /furniture/seating/sofa<br/>level: 3]

    F --> I[Bookshelf<br/>path: /furniture/storage/bookshelf<br/>level: 3]
    F --> J[Dresser<br/>path: /furniture/storage/dresser<br/>level: 3]

    C --> K[Computers<br/>path: /electronics/computers<br/>level: 2]
    C --> L[Audio<br/>path: /electronics/audio<br/>level: 2]

    K --> M[Laptop<br/>path: /electronics/computers/laptop<br/>level: 3]
    L --> N[Headphones<br/>path: /electronics/audio/headphones<br/>level: 3]

    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#fff4e1
    style D fill:#fff4e1
    style E fill:#f0ffe1
    style F fill:#f0ffe1
    style K fill:#f0ffe1
    style L fill:#f0ffe1
    style G fill:#ffe1f5
    style H fill:#ffe1f5
    style I fill:#ffe1f5
    style J fill:#ffe1f5
    style M fill:#ffe1f5
    style N fill:#ffe1f5
```

---

## Data Flow Diagram

```mermaid
flowchart TD
    A[User Captures Photo] --> B[Save to Local DB]
    B --> C{Online?}

    C -->|Yes| D[Upload to API]
    C -->|No| E[Queue for Sync]

    D --> F[Call Vision Providers]
    F --> G[Google Vision API]
    F --> H[AWS Rekognition API]

    G --> I[Ensemble Fusion]
    H --> I

    I --> J[Select Best Labels]
    J --> K[Save Detection Results]

    K --> L[Return to Mobile App]
    L --> M[Display Results]
    M --> N{User Accepts?}

    N -->|Yes| O[Create Inventory Item]
    N -->|No| P[User Edits Labels]

    O --> Q[Save Item + Labels]
    P --> Q

    Q --> R[Sync to Backend]
    R --> S[PostgreSQL Database]

    E --> T[Wait for Connection]
    T --> D

    style A fill:#e1f5ff
    style D fill:#fff4e1
    style F fill:#f0ffe1
    style I fill:#ffe1f5
    style O fill:#e1ffe1
    style S fill:#ffe1e1
```

---

## Cardinality Summary

| Relationship | Cardinality | Description |
|--------------|-------------|-------------|
| Users → Inventory Items | 1:M | User owns many items |
| Items → Labels | M:M | Item can have multiple labels |
| Items → Tags | M:M | Item can have multiple tags |
| Items → Location | M:1 | Item belongs to one location |
| Items → Images | 1:M | Item has multiple photos |
| Images → Detection Sessions | 1:M | Image analyzed multiple times |
| Session → Results | 1:M | Session produces many results |
| Result → Bounding Box | 1:1 | Result has optional bbox |
| Labels → Labels | 1:M | Parent-child hierarchy |
| Locations → Locations | 1:M | Parent-child hierarchy |

---

## Index Coverage Visualization

```mermaid
graph LR
    A[Query: User's Items] --> B[idx_inventory_items_user_id]
    A --> C[idx_inventory_items_created_at]

    D[Query: Search] --> E[idx_inventory_items_search_vector]
    D --> F[idx_inventory_items_title_trgm]

    G[Query: Filter by Label] --> H[idx_item_labels_item_id]
    G --> I[idx_item_labels_label_id]

    J[Query: Location Hierarchy] --> K[idx_locations_path]
    J --> L[idx_inventory_items_location_id]

    M[Query: Sync Queue] --> N[idx_sync_queue_status_priority]

    style B fill:#e1ffe1
    style C fill:#e1ffe1
    style E fill:#e1ffe1
    style F fill:#e1ffe1
    style H fill:#e1ffe1
    style I fill:#e1ffe1
    style K fill:#e1ffe1
    style L fill:#e1ffe1
    style N fill:#e1ffe1
```

---

## Normalization Analysis

### Fully Normalized (3NF)

- **inventory_items**: No repeating groups, atomic values
- **labels**: Normalized taxonomy, no duplication
- **tags**: Unique per user, normalized

### Selective Denormalization (Performance)

| Field | Denormalized In | Reason |
|-------|----------------|--------|
| `usage_count` | labels, tags | Avoid COUNT(*) queries for sorting |
| `item_count` | locations | Dashboard performance |
| `avg_confidence` | detection_sessions | Avoid aggregation on read |
| `total_items` | users | Dashboard statistics |
| `search_vector` | inventory_items (PG) | Full-text search performance |

**Trade-off**: Faster reads, slightly more complex writes (managed via triggers)

---

## Constraint Summary

### Primary Keys
- All tables use `uuid` (mobile) or `UUID` (backend) primary keys
- UUIDs enable distributed ID generation (no central sequence)

### Foreign Keys
- All relationships enforced via foreign key constraints
- `ON DELETE CASCADE` for owned entities (items → images)
- `ON DELETE SET NULL` for optional references (items → labels)

### Unique Constraints
- `users.email` - One account per email
- `tags(user_id, normalized_name)` - Unique tag names per user
- `locations(user_id, path)` - Unique location paths per user
- `item_labels(item_id, label_id)` - No duplicate labels on item

### Check Constraints
- `inventory_items.quantity > 0` - Must have at least 1
- `confidence_score BETWEEN 0 AND 1` - Valid confidence range
- `x_min, y_min, x_max, y_max BETWEEN 0 AND 1` - Normalized coordinates

---

## Legend

```mermaid
graph LR
    A[Entity] -->|One-to-Many| B[Related Entity]
    C[Entity] -->|Many-to-Many| D[Related Entity]
    E[Entity] -.->|Optional| F[Related Entity]

    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#f0ffe1
    style D fill:#ffe1f5
    style E fill:#e1ffe1
    style F fill:#ffe1e1
```

**Notation**:
- `||--o{` - One-to-Many (1:M)
- `}o--||` - Many-to-One (M:1)
- `||--||` - One-to-One (1:1)
- `}o--o{` - Many-to-Many (M:M)

---

This ERD provides a complete visual representation of the database architecture for the Visual Home Inventory Manager application.
