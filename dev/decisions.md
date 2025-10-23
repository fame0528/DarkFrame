# DarkFrame - Technical Decisions

> Important architectural and technical decisions with rationale

---

## 📋 Decision Log

### [DEC-001] Use Lowercase Project Name "darkframe"
**Date:** 2025-10-16  
**Context:** npm naming restrictions prohibit capital letters in package names  
**Decision:** Use "darkframe" instead of "DarkFrame" for directory and package name  
**Rationale:** Compliance with npm standards, avoid build/deployment issues  
**Alternatives Considered:** None (npm requirement)  
**Status:** ✅ Implemented

---

### [DEC-002] React 18.3.1 vs React 19
**Date:** 2025-10-16  
**Context:** Next.js 15.0.2 has peer dependency conflict with React 19  
**Decision:** Use React 18.3.1 for compatibility  
**Rationale:** Ensure stable Next.js operation, avoid potential breaking changes  
**Alternatives Considered:** React 19 with --force flag (risky)  
**Status:** ✅ Implemented

---

### [DEC-003] Tailwind CSS for Styling
**Date:** 2025-10-16  
**Context:** Need styling solution for UI components  
**Decision:** Use Tailwind CSS 3.4.1  
**Rationale:** Utility-first approach, fast development, excellent Next.js integration, user reference shows similar UI patterns  
**Alternatives Considered:** CSS Modules only, Styled Components  
**Status:** ✅ Implemented

---

### [DEC-004] Single-Tile View vs Full Grid Render
**Date:** 2025-10-16  
**Context:** User provided reference screenshot showing single-tile focused view  
**Decision:** Render only current tile with navigation controls (not entire 150×150 grid)  
**Rationale:**  
- Better performance (load 1 tile vs 22,500)
- Matches user's reference UI
- Enables fog-of-war/discovery mechanics later
- Clearer visual focus for gameplay  
**Alternatives Considered:** Full grid minimap (rejected for Phase 1)  
**Status:** ✅ Implemented in design

---

### [DEC-005] MongoDB Atlas vs Local MongoDB
**Date:** 2025-10-16  
**Context:** Need database solution for persistent game state  
**Decision:** Use MongoDB Atlas (cloud-hosted)  
**Rationale:** User specified in requirements, no local setup required, production-ready  
**Alternatives Considered:** None (user requirement)  
**Status:** ✅ Implemented in configuration

---

### [DEC-006] 9-Direction Movement (QWEASDZXC)
**Date:** 2025-10-16  
**Context:** User specified keyboard layout for movement  
**Decision:** Implement QWEASDZXC keyboard mapping with center 'S' as refresh  
**Rationale:**  
- User requirement
- Ergonomic keyboard layout
- 8 directions + refresh action  
**Mapping:**
```
Q W E    [NW] [N]  [NE]
A S D =  [W]  [⟳]  [E]
Z X C    [SW] [S]  [SE]
```
**Alternatives Considered:** Arrow keys, WASD (rejected per user spec)  
**Status:** ✅ Implemented in design

---

### [DEC-007] Edge Wrap-Around (150→1)
**Date:** 2025-10-16  
**Context:** How to handle map boundaries at 150×150 grid  
**Decision:** Implement wrap-around on all edges (moving beyond 150 wraps to 1)  
**Rationale:** User requirement, creates seamless exploration experience  
**Implementation:** Modulo arithmetic for coordinate calculation  
**Alternatives Considered:** Hard boundaries (rejected per user spec)  
**Status:** ✅ Implemented in design

---

### [DEC-008] Image-Based Tiles (Not 3D)
**Date:** 2025-10-16  
**Context:** User reference screenshot appeared to show 3D rendering  
**Decision:** Use 2D image assets provided by user, not 3D rendering  
**Rationale:**  
- User clarified: "tile based, FLAT game"
- User will provide custom terrain images
- Simpler implementation
- Better performance  
**Alternatives Considered:** Three.js 3D rendering (rejected per user spec)  
**Status:** ✅ Implemented in design

---

### [DEC-009] No Mini-Map in Phase 1
**Date:** 2025-10-16  
**Context:** Should we include overview/mini-map?  
**Decision:** No mini-map, single-tile view only  
**Rationale:** User specified "players must discover the map" and "single tile view only"  
**Future Consideration:** Fog-of-war discovery system in later phase  
**Alternatives Considered:** Mini-map with fog (deferred to Phase 2+)  
**Status:** ✅ Implemented in design

---

### [DEC-010] React Context vs External State Library
**Date:** 2025-10-16  
**Context:** Need state management solution for game state  
**Decision:** Use React Context API (built-in)  
**Rationale:**  
- Sufficient for Phase 1 scope
- No external dependencies
- Simple implementation
- Can migrate to Redux/Zustand later if needed  
**Alternatives Considered:** Redux, Zustand, Jotai (unnecessary for Phase 1)  
**Status:** ✅ Implemented in design

---

### [DEC-011] Idempotent Map Generation
**Date:** 2025-10-16  
**Context:** How to ensure map doesn't regenerate on every restart  
**Decision:** Check for existing tiles before generation, skip if map exists  
**Rationale:**  
- User requirement: "static and consistent across restarts"
- Prevent data loss
- Safe initialization  
**Implementation:** Count tiles in DB, only generate if count === 0  
**Alternatives Considered:** Flag-based approach (more complex)  
**Status:** ✅ Implemented in design

---

### [DEC-012] Exact Terrain Distribution
**Date:** 2025-10-16  
**Context:** User specified exact tile counts per terrain type  
**Decision:** Use Fisher-Yates shuffle with pre-allocated array matching exact counts  
**Rationale:**  
- Guarantees exact distribution (no randomness in counts)
- User requirement: Metal: 4,500, Energy: 4,500, Cave: 2,250, Factory: 2,250, Wasteland: 9,000  
**Implementation:** Create array with exact counts, shuffle positions  
**Alternatives Considered:** Random assignment (rejected - wouldn't guarantee exact counts)  
**Status:** ✅ Implemented in design

---

### [DEC-013] jose Library for Edge Runtime JWT
**Date:** 2025-10-17  
**Context:** Next.js middleware crashed with `jsonwebtoken` due to native module dependencies (node-gyp-build → bcrypt)  
**Decision:** Use `jose` library for JWT operations in Edge Runtime middleware  
**Rationale:**  
- Edge Runtime cannot use native Node.js modules (bcrypt, crypto, fs)
- `jose` is pure JavaScript, built specifically for Edge/Web Crypto API
- `jose` is the recommended JWT library for Next.js middleware per official docs
- Async-first design is more secure and follows modern standards  
**Implementation:**  
- Middleware (`lib/authMiddleware.ts`): Uses `jose` for JWT verification
- API Routes (`lib/authService.ts`): Continues using `jsonwebtoken` + `bcrypt` (Node.js runtime)
- Both use same JWT_SECRET for token compatibility  
**Alternatives Considered:**  
1. Configure middleware to use Node.js runtime (rejected - performance overhead)
2. Find alternative auth method (rejected - JWT industry standard)  
**Migration Notes:** Changed `verifyToken()` from sync to async (jose requirement)  
**Status:** ✅ Implemented (FID-20251017-005)

---

### [DEC-014] Multiple Movement Control Schemes
**Date:** 2025-10-17  
**Context:** Improve accessibility and cater to different user preferences  
**Decision:** Support three complete keyboard control schemes for movement  
**Rationale:**  
- **QWEASDZXC:** Original grid layout (familiar to gamers)
- **Numpad 1-9:** Matches physical numpad grid (intuitive for number pad users)
- **Arrow Keys:** Cardinal directions only (beginner-friendly, standard navigation)  
**Implementation:**  
- Extended `KeyToDirection` Record in `types/game.types.ts`
- No code changes needed in event handling (already generic)
- All three schemes work simultaneously
- Total 26 key mappings (18 QWEASDZXC + 9 numpad + 4 arrows - 5 overlaps)  
**Alternatives Considered:**  
1. Single scheme only (rejected - limits accessibility)
2. Configurable bindings (rejected - unnecessary complexity for Phase 1)  
**Benefits:**  
- Zero performance impact (simple Record lookup)
- Improved accessibility (players use preferred input)
- No breaking changes (original keys preserved)  
**Status:** ✅ Implemented (FID-20251017-006)

---

**Last Updated:** 2025-10-17
