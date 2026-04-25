# RAAISE Dashboard — 3D Map (Avatars + Room) Development Plan

This document describes how to replace the current **2D user circles + 2D floorplan** with a **3D visualization** (avatars + room) in the existing stack.

---

## Context (current stack)

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind
- **Data**: MySQL via Next.js API routes
- **Polling**: Map component re-evaluates status every 1 second (not 5s — status is derived client-side from `TIMESTAMP` age)
- **Key file**: `raaise-dashboard-wording-updated/src/components/Map.tsx`
- **Primary API**: `GET /api/users` returning `USERID`, `TIMESTAMP`, `PREDICTED_LOCATION`, `IS_REGISTERED`, `ACCESS_LEVEL`
- **Floorplan image**: already exists at `public/layout_map.png` — no need to copy or rename it

---

## What the current map looks like (confirmed from screenshot)

- Background is the floorplan image stretched to fill a `1500px × 600px` div
- Each user/intruder is a small **dot + text label** (`"Intruder"`, `"User-1"`, etc.) placed at `%` coordinates
- The facility has two visual zones:
  - **Left / outdoor zone**: open area, road-like passages, a large purple building footprint (A00 area)
  - **Right / indoor zone**: rooms and corridors with labeled areas (A01–A17, C01–C06, P-codes)
- At any moment, ~20–30 entities are visible simultaneously (well within budget for non-instanced meshes)
- Labels matter — users are currently identified by floating text and need to remain readable in 3D

---

## Exact location codes to support

Extracted directly from `Map.tsx` (`getPositionForUserLocation`):

```
A01–A17
P01, P15, P24, P33, P43, P45, P53, P56, P63, P64, P74, P84, P94
C01–C06
```

Fallback position for unknown codes: `{ x: 2, y: 30 }` (far left, mid-height).

---

## Exact coordinate map (2D → 3D seed values)

These are the existing `%` positions from `Map.tsx`. Use them as the starting seed for the `default-layout.json` config — they will need minor visual tuning once the 3D ground plane is live.

### User positions (% of container)
```
A01:(10,75)  A02:(30,75)  A03:(55,75)  A04:(61,72)  A05:(71,86)
A06:(82,82)  A07:(90,62)  A08:(92,30)  A09:(92,10)  A10:(55,45)
A11:(65,45)  A12:(80,55)  A13:(78,28)  A14:(70,28)  A15:(60,25)
A16:(55,23)  A17:(40,25)
P01:(10,60)  P15:(63,64)  P24:(83.5,55) P33:(80,11)  P43:(72,11)
P45:(64,76)  P53:(64,11)  P56:(70,94)  P63:(57,10)  P64:(83,68)
P74:(86,58)  P84:(86,43)  P94:(86,13)
C01:(19.5,25) C02:(28,8)  C03:(65,8)   C04:(85,35)  C05:(68,65)  C06:(63,90)
```

### 2D → 3D conversion formula
The ground plane world size needs to be decided (e.g. 20 units × 8 units to match the 1500×600 aspect ratio ≈ 2.5:1). Then:
```
worldX = (percentX / 100) * planeWidth  - (planeWidth / 2)
worldZ = (percentY / 100) * planeHeight - (planeHeight / 2)
worldY = 0  (standing on the ground plane)
```

---

## Exact color/status logic to preserve in 3D

### User avatar colors
| Condition | Active color | Inactive color |
|---|---|---|
| Registered + authorized | Blue | Light blue |
| Registered + unauthorized | Pink | Light pink |
| Unregistered (intruder) | Red | Light red |
| Offline | Gray | Gray |

### Status thresholds (from `Map.tsx`)
- **Users**: Active ≤ 60s, Inactive ≤ 120s, Offline > 120s
- **Sensors**: Active ≤ 20s, Inactive ≤ 30s, Offline > 30s

### Authorization logic
Authorization is checked per-user by comparing `ACCESS_LEVEL` (int) against the `SECURITY_LEVEL` of the sensor in the user's predicted location. P-codes map to A-areas first via:
```
P12→A01, P51→A05, P45→A04, P15→A11, P64→A06,
P74→A07, P33→A13, P43→A14, P53→A15, P63→A16, P01→A01
```

### Other display rules (must carry over)
- **Dedup by USERID**: only the latest entry per USERID is shown (list is reversed before rendering)
- **Intruder dedup**: only one intruder dot per location (first one wins after dedup)
- **PS-prefix users filtered**: users whose `USERID` contains `"PS"` and whose `PREDICTED_LOCATION` is in `activeAreas` are excluded from the map
- **Multiple users at same location**: current 2D approach stacks them with `+4%` y-offset per user. In 3D, spread them in a small circle around the location point instead.

---

## Recommended MVP approach (Hybrid 3D Room) — "The Textured Stage"

No change to the overall strategy. Confirmed feasible given what's in the codebase:

- **Ground**: `layout_map.png` as a texture on a Three.js `PlaneGeometry` — file already in `public/`
- **Room depth**: Extruded 2D polygon walls from a JSON config (data-driven)
- **Users**: Tesla-style abstract humanoids (capsule body + sphere head), billboarded or oriented top-down
- **Motion**: Delta-time lerp between poll intervals (frame-rate independent)

### Why this still works
- The coordinate system is already percentage-based — straightforward linear mapping to world units
- ~20–30 simultaneous avatars is well under the instancing threshold; start with plain `Mesh`
- The floorplan image aspect ratio is ~2.5:1, so a `20 × 8` world plane (or `25 × 10`) is a natural fit
- No GLTF assets needed for MVP — capsule + sphere is achievable with built-in Three.js geometry

---

## Important implementation notes (from code review)

- **Client-only**: Use `dynamic(..., { ssr: false })` for the `<Canvas>` wrapper — R3F will break on SSR
- **Lerp timing**: Use `delta`-based exponential smoothing in `useFrame`, not a fixed `0.1` factor
- **Labels**: Billboard `<Text>` from `@react-three/drei` above each avatar — important for readability (confirmed from screenshot)
- **Camera**: Start with a slight isometric angle (~45° tilt, top-down-ish). Pure top-down loses the 3D depth; too much angle makes the floorplan unreadable. Add `OrbitControls` behind a `?debug=true` URL flag for tuning.
- **Offline users**: Current code keeps offline users in state but the 3D scene should fade them (reduce opacity or remove) rather than pile them up
- **Sensor icons**: Sensors are currently shown as colored squares (toggled by "Show Sensors" button). These can stay 2D (HTML overlay) or be added as flat 3D markers — low priority for MVP.

---

## Development phases

### Phase 0 — Align on inputs/outputs ✅ COMPLETE
- Target app: `raaise-dashboard-wording-updated/` ✅
- All location codes documented above ✅
- Coordinate map extracted from code ✅
- Color/status logic documented above ✅

---

### Phase 1 — Add the 3D "stage" (floorplan as ground)

- Add deps: `three`, `@react-three/fiber`, `@react-three/drei`
- Add `src/components/3d/Scene.tsx` — `<Canvas>` with camera + lights
- Add `src/components/3d/Ground.tsx` — `PlaneGeometry` with `layout_map.png` texture
- Confirm world plane size (suggested: `20 × 8` units)
- Add `OrbitControls` behind `?debug` flag for camera tuning

**You need to confirm**: desired camera angle — slight isometric (recommended) or pure top-down?

**Deliverable**: 3D canvas visually matching the existing floorplan placement.

---

### Phase 2 — Coordinate mapping (location code → Vector3)

- Create `src/lib/coordMapper.ts`
- Create `src/config/layouts/default-layout.json` using the coordinate table above as seed values
- Validate by eye — expect minor tuning needed on ~5–10 codes

**Deliverable**: users appear at correct spots in 3D, matching the old 2D map.

---

### Phase 3 — Avatars (stylized humanoids) + smooth motion

- Implement `src/components/3d/Avatar.tsx`
  - Capsule body + sphere head (Three.js built-ins, no GLTF)
  - Color derived from `IS_REGISTERED` + `authorized` + `status` (see color table above)
  - Billboarded `<Text>` label above avatar ("User-X", "Intruder", "Unauthorized-User")
  - Delta-time lerp toward target position in `useFrame`
- Handle same-location collision: spread avatars in a small circle (radius ~0.3 world units) rather than stacking vertically

**You need to confirm**: do you want USERID shown above authorized users, or just "User-X"? (Currently it's `User-{USERID}`.)

**Deliverable**: moving avatars that update cleanly every poll interval without popping.

---

### Phase 4 — 3D room depth (extruded walls)

- Add `src/components/3d/Walls.tsx`
- Define room boundaries as 2D polygons in `default-layout.json`, extrude to low walls (~0.3 world units tall)
- Keep walls subtle: low height, slight emissive edge, no heavy shadows

**You need to provide**: zone boundary polygons, or confirm we trace them from the floorplan image by eye.

**Priority note from screenshot**: the indoor rooms on the right side of the map (A10–A17, corridors) are the most important to wall. The open outdoor/left area (A00 zone) needs minimal or no walls.

**Deliverable**: 3D room feel, data-driven, editable per layout JSON.

---

### Phase 5 — Performance hardening (only if needed)

Trigger: noticeable frame drops with current user count.

- Switch avatars to `InstancedMesh` (body instances + head instances)
- Clamp device pixel ratio, reduce shadows, add frustum culling
- LOD strategy if GLTF avatars are added later

---

## Suggested directory layout

```
src/
  components/
    3d/
      Scene.tsx        // Canvas + camera + lights
      Ground.tsx       // Floorplan textured plane
      Avatar.tsx       // User avatar + label + smoothing
      Walls.tsx        // Extruded room boundaries
  config/
    layouts/
      default-layout.json   // coordinates + wall polygons
  lib/
    coordMapper.ts     // location code → Vector3
  hooks/
    useUserPolling.ts  // polling + state normalization (extract from Map.tsx)
public/
  layout_map.png       // already exists — use as ground texture
```

---

## Definition of "Done" (MVP)

- Floorplan shown as a 3D ground plane (correct aspect ratio, no stretching)
- Users render as 3D avatars at correct positions with correct colors
- Avatar labels ("Intruder", "User-X", "Unauthorized-User") visible and readable
- Updates every poll interval with smooth motion (no popping)
- Basic 3D walls for indoor rooms, driven by JSON config
- "Show Sensors" toggle still works (can remain as HTML overlay for MVP)
- No facility-specific hardcoding beyond swapping `default-layout.json`
