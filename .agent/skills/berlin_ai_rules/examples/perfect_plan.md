# Example: The Perfect Peer-Planner Execution

This example demonstrates how an agent follows the Berlin Rules for planning and implementation of a new feature.

## 1. The Request
"Add a new geofence validation layer to the `CoordinateTransform` service."

## 2. Silent Planning Phase (Internal)
*Agent identifies existing services:*
- Check `Microservices_Catalog.md` -> Found `escacs-spatial-service` with geofencing.
- Decision: Do NOT implement from scratch. Use `escacs-spatial-service`.

## 3. Synthesized Plan Output
### 📋 Feature Plan: Geofence Validation
- **Architectural Match**: Using `escacs-spatial-service` via its verified gRPC port.
- **Implementation Strategy**:
    1. Update `CoordinateTransform` to accept a `IGeofenceProvider`.
    2. Implement `SpatialServiceAdapter` in `infrastructure/`.
    3. Inject via `application/CoordinateOrchestrator`.
- **Testing Strategy**:
    1. Write `CoordinateTransform.spec.ts` defining boundary edge cases.
    2. Write E2E test in `MapValidation.spec.ts`.
- **Key Risks**: 
    - Latency in spatial lookups for high-frequency samples.
    - Potential for WebGL context loss during heavy spatial computations.

## 4. ATDD Phase
*Agent writes the spec first:*
```typescript
it('should reject coordinates outside of the active catchment geofence', async () => {
    const transform = new CoordinateTransform(mockSpatialService);
    const result = transform.process({ lat: 52.5, lng: 13.4 }); // Outside Berlin
    expect(result.valid).toBe(false);
});
```

## 5. Implementation & Verification
*Agent implements logic and verifies with tests.*

## 6. Documentation
- Update `Microservices_Catalog.md` marking the geofence integration as `✅ Stable`.
- Run `./sync-registry.sh`.
