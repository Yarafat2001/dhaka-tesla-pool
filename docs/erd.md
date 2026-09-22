# Entity-Relationship Diagram

```mermaid
erDiagram
    User ||--o{ RideRequest : "makes (as passenger)"
    User ||--o| Tesla : "owns (as driver)"
    User ||--o{ StatusHistory : "changes status as"
    Tesla ||--o{ Pool : "runs"
    Pool ||--o{ RideRequest : "contains"
    Zone ||--o{ RideRequest : "is pickup for"
    Zone ||--o{ RideRequest : "is dropoff for"
    Zone ||--o{ ZoneDistance : "from"
    Zone ||--o{ ZoneDistance : "to"
    RideRequest ||--o{ StatusHistory : "has history"
    RideRequest ||--o| Payment : "is paid via"

    User {
        string id PK
        string name
        string phone UK
        string passwordHash
        enum role "PASSENGER | DRIVER"
        int walletBalancePoisha
    }

    Zone {
        string id PK
        string name UK
        float lat
        float lng
    }

    ZoneDistance {
        string id PK
        string fromZoneId FK
        string toZoneId FK
        float distanceKm
    }

    Tesla {
        string id PK
        string driverId FK "unique - 1:1 with User"
        string name
        string plate UK
        int capacity
        bool isOnline
    }

    Pool {
        string id PK
        string teslaId FK
        enum status "FORMING|ACTIVE|COMPLETED|CANCELLED"
        int seatsUsed
    }

    RideRequest {
        string id PK
        string passengerId FK
        string pickupZoneId FK
        string dropoffZoneId FK
        int seats
        enum status
        string poolId FK "nullable - null while unmatched"
        int estimatedFarePoisha
        int finalFarePoisha "nullable until COMPLETED"
    }

    StatusHistory {
        string id PK
        string rideRequestId FK
        enum fromStatus "nullable"
        enum toStatus
        string changedById FK "nullable"
    }

    Payment {
        string id PK
        string rideRequestId FK UK "1:1 with RideRequest"
        enum method "CASH|TESLAPAY"
        int amountPoisha
        enum status "PENDING|PAID|FAILED"
    }
```

## Key modeling decisions

- **Pool as the unit of a physical trip, not RideRequest.** A solo ride is
  just a Pool with one RideRequest. This avoids a separate "Ride" entity
  duplicating what Pool already represents, and makes "multiple requests
  may share one Tesla" (Section 3) a natural consequence of the schema
  rather than a special case.
- **`RideRequest.poolId` is nullable.** A request starts life possibly
  unmatched (no online/available Tesla yet) and gets a `poolId` once
  matched - this models the `waiting -> matched` step in the brief's
  passenger status list directly in the data, not just in application code.
- **`Pool.seatsUsed` is a denormalized counter**, not derived by counting
  `RideRequest` rows on every read. It's updated inside the same
  transaction that adds/removes a request specifically so it can be the
  target of the atomic conditional `UPDATE` that prevents overbooking (see
  `docs/concurrency.md`). The trade-off: it can only be trusted because
  every write path that touches it goes through `rideService`/
  `driverService` - there is no other way to add a `RideRequest` to a
  `Pool`.
- **`StatusHistory` is append-only and never updated**, satisfying "hold
  onto enough history to explain exactly what happened" (Section 2)
  without needing a separate audit-log table or triggers.
- **`Tesla` is a separate table from `User`** (1:1) rather than columns on
  `User`, since capacity/plate/online-status are vehicle attributes; this
  leaves room for a driver eventually owning >1 vehicle without a schema
  change to `User`.
- **Money is `Int` (poisha) everywhere**, never `Decimal`/`Float` - see
  `docs/fare-model.md`.
