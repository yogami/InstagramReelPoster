# Clean Architecture & DDD Documentation

## Layer Boundaries

The Instagram Reel Poster follows Clean Architecture principles with the following layers:

### Domain Layer (`src/domain/`)
- **Entities**: `ReelJob`, `Segment`, `Track`, `ReelManifest`
- **Ports**: Interfaces for external dependencies (`ILLMClient`, `ITTSClient`, etc.)
- **Services**: Pure domain logic (`DurationCalculator`)

### Application Layer (`src/application/`)
- **Orchestrators**: Coordinate use cases (`ReelOrchestrator`)
- **Selectors**: Pick from multiple sources (`MusicSelector`)
- **Managers**: State management (`JobManager`)

### Infrastructure Layer (`src/infrastructure/`)
- **Clients**: External API integrations (LLM, TTS, Image, Storage)
- **Renderers**: Video rendering implementations (FFmpeg, Shotstack)

### Presentation Layer (`src/presentation/`)
- **Routes**: HTTP endpoints (`reelRoutes`, `jobRoutes`)
- **App**: Express application setup

---

## DDD Bounded Contexts

### 1. Content Context
**Purpose**: Manages content generation and transformation

**Aggregates**:
- `ReelPlan` - The blueprint for a reel
- `SegmentContent` - Commentary, image prompts, captions

**Services**:
- `ILLMClient` - Natural language processing
- `ITranscriptionClient` - Speech-to-text

**Events**:
- `ContentGenerated`
- `CommentaryAdjusted`

---

### 2. Media Context
**Purpose**: Handles audio/visual asset creation and storage

**Aggregates**:
- `Segment` - A single visual+audio unit
- `Track` - Music track metadata

**Services**:
- `ITTSClient` - Text-to-speech synthesis
- `IImageClient` - Image generation
- `IStorageClient` - Asset storage

**Events**:
- `VoiceoverSynthesized`
- `ImageGenerated`
- `AssetUploaded`

---

### 3. Orchestration Context
**Purpose**: Coordinates the full reel generation workflow

**Aggregates**:
- `ReelJob` - Job state and lifecycle
- `ReelManifest` - Final composition specification

**Services**:
- `ReelOrchestrator` - Workflow coordination
- `JobManager` - Job state management
- `MusicSelector` - Music source selection

**Events**:
- `JobStarted`
- `JobCompleted`
- `JobFailed`

---

### 4. Notification Context
**Purpose**: Handles external notifications and callbacks

**Services**:
- `INotificationClient` - Telegram bot integration
- Webhook callbacks (Make.com)

**Events**:
- `CallbackSent`
- `UserNotified`

---

## Dependency Rules

1. **Domain → Nothing**
   - Domain entities have no external dependencies
   - Ports define interfaces, not implementations

2. **Application → Domain**
   - Application services use domain entities
   - Application orchestrates via domain ports

3. **Infrastructure → Application, Domain**
   - Infrastructure implements domain ports
   - Infrastructure can use application types

4. **Presentation → Application, Domain**
   - Presentation creates infrastructure and wires to application
   - HTTP handlers call application services

---

## Future Microservices Decomposition

When ready to split into microservices, each bounded context becomes a candidate:

| Context | Service | API |
|---------|---------|-----|
| Content | `content-service` | gRPC: `GenerateContent`, `AdjustCommentary` |
| Media | `media-service` | gRPC: `SynthesizeAudio`, `GenerateImage` |
| Orchestration | `orchestrator-service` | REST: `/jobs/*`, gRPC: `ProcessJob` |
| Notification | `notification-service` | gRPC: `SendCallback`, `NotifyUser` |

Communication patterns:
- **Synchronous**: gRPC for real-time operations
- **Asynchronous**: Message queue (Redis/RabbitMQ) for long-running tasks
- **Events**: Pub/Sub for decoupled notifications
