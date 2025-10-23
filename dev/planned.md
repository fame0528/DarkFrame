# DarkFrame - Planned Features

> Future enhancements and potential features

**Last Updated:** 2025-10-22  
**Current Status:** WMD Phase 1 Complete | Ready for Phase 2  
**Next Priority:** WMD Phase 2 - API Routes & Database Integration

---

## 🎯 PRIORITIZATION CRITERIA

**When selecting next features:**
1. **User Experience Impact** - Does it improve gameplay significantly?
2. **Technical Complexity** - Resource investment vs value delivered
3. **Dependencies** - Prerequisites and blockers
4. **Business Value** - Engagement, retention, monetization potential
5. **Technical Debt** - Code quality, maintainability, scalability

---

## 🔥 **IMMEDIATE PRIORITIES** (Next Development Phase)

### [FID-20251022-WMD-PHASE2] WMD API Routes & Database Integration
**Status:** 📋 PLANNED **Priority:** 🔴 HIGH **Complexity:** 4/5  
**Estimate:** 10-14 hours  
**Dependencies:** ✅ WMD Phase 1 Foundation COMPLETE  

**Description:**
Build complete API route layer for WMD system. Implement all CRUD operations for research, missiles, defense, intelligence, and voting. Connect services to MongoDB collections with proper authentication and error handling.

**API Routes to Create (~20 routes):**

**Research System (4 routes):**
- `POST /api/wmd/research/start` - Start researching a tech
- `GET /api/wmd/research/status` - Get player research status
- `GET /api/wmd/research/available` - List available techs
- `GET /api/wmd/research/tree` - Get full tech tree

**Missile System (6 routes):**
- `POST /api/wmd/missiles/create` - Create new missile
- `POST /api/wmd/missiles/[id]/assemble` - Add component to missile
- `POST /api/wmd/missiles/[id]/launch` - Launch missile at target
- `GET /api/wmd/missiles` - List player's missiles
- `GET /api/wmd/missiles/[id]` - Get missile details
- `DELETE /api/wmd/missiles/[id]` - Dismantle missile

**Defense System (5 routes):**
- `POST /api/wmd/defense/deploy` - Deploy defense battery
- `POST /api/wmd/defense/[id]/repair` - Repair battery
- `POST /api/wmd/defense/[id]/resupply` - Resupply ammunition
- `GET /api/wmd/defense` - List player's batteries
- `DELETE /api/wmd/defense/[id]` - Dismantle battery

**Intelligence System (6 routes):**
- `POST /api/wmd/intelligence/recruit` - Recruit new spy
- `POST /api/wmd/intelligence/[id]/train` - Train spy
- `POST /api/wmd/intelligence/missions/start` - Start spy mission
- `GET /api/wmd/intelligence/spies` - List player's spies
- `GET /api/wmd/intelligence/missions` - List active missions
- `POST /api/wmd/intelligence/counter-intel` - Run counter-intel sweep

**Voting System (4 routes):**
- `POST /api/wmd/voting/create` - Create clan vote for missile launch
- `POST /api/wmd/voting/[id]/vote` - Cast vote
- `POST /api/wmd/voting/[id]/veto` - Leader veto
- `GET /api/wmd/voting` - Get clan's active votes

**Notifications (1 route):**
- `GET /api/wmd/notifications` - Get player's WMD notifications

**Acceptance Criteria:**
- ✅ All 20+ API routes implemented
- ✅ Proper JWT authentication on all routes
- ✅ MongoDB integration using existing connection
- ✅ Comprehensive error handling with user-friendly messages
- ✅ Input validation and sanitization
- ✅ Clan treasury integration for costs
- ✅ Transaction logging for auditing
- ✅ TypeScript 0 errors
- ✅ JSDoc documentation on all endpoints

**Integration Points:**
- Existing MongoDB connection (`lib/mongodb.ts`)
- Existing auth middleware (`middleware.ts`)
- WMD services (`lib/wmd/*`)
- WMD database schemas (`lib/db/schemas/wmd.schema.ts`)

---

### [FID-20251022-WMD-PHASE3] WMD Frontend Integration
**Status:** 📋 PLANNED **Priority:** 🔴 HIGH **Complexity:** 3/5  
**Estimate:** 8-12 hours  
**Dependencies:** ⏳ WMD Phase 2 API Routes  

**Description:**
Connect WMD UI components to API routes. Implement data fetching, form submissions, real-time updates, and error handling. Make WMD system fully functional from player perspective.

**Tasks:**
1. **Research Panel Integration** (2-3 hours)
   - Fetch tech tree data from API
   - Display player's current research status
   - Implement "Start Research" with RP spending
   - Real-time progress tracking
   - Tech unlock celebrations

2. **Missile Panel Integration** (2-3 hours)
   - Fetch player's missiles
   - Implement component assembly UI
   - Launch modal with targeting
   - Flight tracking display
   - Impact notifications

3. **Defense Panel Integration** (1-2 hours)
   - Fetch player's batteries
   - Deploy battery interface
   - Repair/resupply actions
   - Defense grid status visualization

4. **Intelligence Panel Integration** (2-3 hours)
   - Spy recruitment flow
   - Mission planning interface
   - Active mission tracking
   - Intelligence reports display
   - Counter-intel results

5. **Voting Panel Integration** (1-2 hours)
   - Clan vote creation
   - Voting interface
   - Real-time vote counting
   - Veto handling

6. **WebSocket Integration** (1-2 hours)
   - Real-time WMD event notifications
   - Missile launch alerts
   - Interception notifications
   - Sabotage reports

**Acceptance Criteria:**
- ✅ All panels connected to API routes
- ✅ Loading states and error handling
- ✅ Real-time updates via WebSocket
- ✅ Form validation and user feedback
- ✅ Success/error toast notifications
- ✅ Responsive mobile design
- ✅ TypeScript 0 errors

---

## 🚀 **HIGH PRIORITY FEATURES**

### Payment Integration (VIP Subscriptions)
**Status:** 📋 PLANNED **Priority:** HIGH **Complexity:** 3/5  
**Estimate:** 4-6 hours  
**Dependencies:** ✅ VIP System Complete  

**Description:**
Integrate Stripe payment processing for VIP subscriptions. Enable automated VIP activation, renewal handling, and expiration management.

**Tasks:**
- Stripe account setup and API key configuration
- Payment flow implementation (/checkout, /success, /cancel routes)
- Webhook handling for subscription events
- Automated VIP grant on successful payment
- Renewal handling and email notifications
- Expiration automation (cron job or webhook-based)
- Payment history tracking

**Acceptance Criteria:**
- ✅ Players can purchase VIP subscriptions via Stripe
- ✅ VIP automatically activated on payment
- ✅ Subscription renewals handled automatically
- ✅ Expiration automation working
- ✅ Secure payment processing (PCI compliant)
- ✅ Email receipts and confirmations
- ✅ Admin visibility into payment status

---

### Admin Authentication System
**Status:** 📋 PLANNED **Priority:** HIGH **Complexity:** 2/5  
**Estimate:** 2-3 hours  

**Description:**
Secure admin routes with proper authentication. Implement role-based access control to protect admin-only functionality.

**Tasks:**
- Add `isAdmin` flag to Player schema
- Create admin role checking middleware
- Protect all `/api/admin/*` routes
- Admin login flow (or flag existing accounts)
- Audit logging for admin actions

---

### Flag System - Full Implementation
**Status:** 📋 PLANNED **Priority:** MEDIUM **Complexity:** 5/5  
**Estimate:** 30-40 hours (reduced from original 46-68 hours)  
**Dependencies:** ✅ RP Economy Complete, ✅ Flag Tracker Complete  

**Description:**
Complete flag territory control system. Players can place flags (4 tiers) for resource bonuses and territorial control. Includes flag attack/defense mechanics, hold duration tracking, and leaderboards.

**Phases:**
1. **Flag Database Schema** (3-4 hours)
   - Flags collection (placement, owner, tier, position, HP, hold duration)
   - Flag attack history
   - Territory bonuses

2. **Flag Placement & Management** (6-8 hours)
   - Place flag API (RP costs: 500/1.5k/5k/15k)
   - Upgrade flag tier
   - Remove/relocate flag
   - Flag status checking

3. **Attack & Defense System** (8-10 hours)
   - Attack flag mechanics
   - Defense calculations
   - HP system with regeneration
   - Capture mechanics
   - Victory/defeat handling

4. **Territory Bonuses** (4-6 hours)
   - Resource generation bonuses
   - Territory radius calculations
   - Bonus stacking rules
   - Bonus UI indicators

5. **Flag Leaderboards** (3-4 hours)
   - Longest hold duration
   - Most flags captured
   - Territory controlled
   - Flag tier distribution

6. **UI Polish & Testing** (6-8 hours)
   - Flag placement UI
   - Battle animations
   - Real-time updates via WebSocket
   - Mobile responsiveness

**Note:** Flag Tracker Panel already complete - can be reused for this system.

---

## 📋 **MEDIUM PRIORITY FEATURES**

### Guild Wars / Territory Control
**Status:** 📋 PLANNED **Priority:** MEDIUM **Complexity:** 5/5  
**Estimate:** 20-30 hours  
**Dependencies:** Flag System  

**Description:**
Clan vs clan territory warfare. Clans can declare war, attack enemy territories, and compete for map control.

---

### PvP Matchmaking System
**Status:** 📋 PLANNED **Priority:** MEDIUM **Complexity:** 4/5  
**Estimate:** 12-16 hours  

**Description:**
Fair matchmaking for PvP battles based on power level, rank, and activity. Includes queue system, match history, and ranking.

---

### Crafting & Item System
**Status:** 📋 PLANNED **Priority:** MEDIUM **Complexity:** 4/5  
**Estimate:** 16-20 hours  

**Description:**
Item crafting system allowing players to combine resources and materials into equipment, consumables, and upgrades.

---

### Global Events System
**Status:** 📋 PLANNED **Priority:** MEDIUM **Complexity:** 3/5  
**Estimate:** 10-14 hours  

**Description:**
Scheduled global events (boss raids, resource bonanzas, PvP tournaments) with special rewards and leaderboards.

---

## 💡 **LOW PRIORITY / FUTURE IDEAS**

### Advanced Analytics Dashboard
**Complexity:** 3/5 | **Estimate:** 8-12 hours  
Player behavior analytics, retention metrics, economy monitoring, and performance dashboards for admins.

---

### Email Notification System
**Complexity:** 2/5 | **Estimate:** 6-8 hours  
Email notifications for important events (attacks, VIP expiration, clan invites, achievement unlocks).

---

### Mobile App (React Native)
**Complexity:** 5/5 | **Estimate:** 100+ hours  
Native mobile applications for iOS and Android with push notifications and offline support.

---

### Social Features
**Complexity:** 4/5 | **Estimate:** 20-30 hours  
Friend system, direct messaging, player profiles, social feed, and gifting.

---

### Advanced Tutorial System
**Complexity:** 3/5 | **Estimate:** 12-16 hours  
Interactive tutorial with progressive unlocks, tooltips, and guided first-session experience.

---

### Seasonal Content
**Complexity:** 4/5 | **Estimate:** 15-20 hours per season  
Seasonal themes, limited-time events, exclusive cosmetics, and seasonal leaderboards.

---

## 🔧 **TECHNICAL DEBT & IMPROVEMENTS**

### Performance Optimization
- Database query optimization and indexing
- Redis caching for frequently accessed data
- Image optimization and lazy loading
- Bundle size reduction
- API response time improvements

### Testing Infrastructure
- Unit tests for critical services
- Integration tests for API routes
- E2E tests for key user flows
- Performance testing and benchmarking
- Security penetration testing

### Code Quality
- ESLint rule enforcement
- Prettier code formatting
- TypeScript strict mode
- Documentation improvements
- Refactor legacy code patterns

---

**Last Updated:** 2025-10-22  
**Next Review:** When WMD Phase 2 begins
