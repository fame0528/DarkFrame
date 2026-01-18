# DarkFrame

> 🎮 Persistent multiplayer tile-based strategy game with real-time combat, clan warfare, and economic systems

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.0-black.svg)](https://nextjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.10-green.svg)](https://www.mongodb.com/)
[![Test Coverage](https://img.shields.io/badge/Coverage-15%25-yellow.svg)](./docs/DEVELOPMENT.md)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Status:** ✅ Production-Ready | 99 Features Complete | GitHub Backup Established  
**Version:** 0.1.0 | **Last Updated:** January 18, 2026

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Quick Start](#-quick-start)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Development](#-development)
- [Game Mechanics](#-game-mechanics)
- [API Documentation](#-api-documentation)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [Documentation](#-documentation)

---

## 🎯 Overview

**DarkFrame** is a feature-rich persistent multiplayer strategy game combining:

- **150×150 tile-based map** (22,500 tiles) with 5 terrain types
- **Real-time WebSocket communication** via Socket.io for instant updates
- **Comprehensive clan system** with alliances, treasury, and shared bases
- **Advanced combat mechanics** with unit types, factories, and strategic warfare
- **Economic systems** including banking, auction house, and resource trading
- **Social features** with chat, friends, private messaging, and achievements
- **VIP/Premium systems** with subscription tiers and exclusive benefits
- **Admin dashboard** for game management and player moderation
- **Interactive tutorial** with 6-quest progression system

**3 Months of Development** | **99 Features Delivered** | **0 TypeScript Errors**

---

## ✨ Features

### 🎮 Core Gameplay
- ✅ **150×150 Persistent Map** - 22,500 tiles with 5 terrain types
- ✅ **9-Directional Movement** - QWEASDZXC keyboard controls with edge wrap
- ✅ **Resource System** - Metal & Energy gathering, storage, and trading
- ✅ **Base Management** - Upgradeable bases with 10 rank tiers
- ✅ **Factory System** - Sequential slot consumption, unit production
- ✅ **Auto-Farm** - Automated resource harvesting with real-time UI updates

### ⚔️ Combat & Strategy
- ✅ **Unit Combat** - Multiple unit types with attack/defense stats
- ✅ **Base Attacks** - Strategic warfare with defense systems
- ✅ **WMD System** - Devastating weapons for clan warfare
- ✅ **Battle Logs** - Comprehensive combat history and analytics
- ✅ **Bounty Board** - Player-vs-player contract system

### 👥 Social & Clans
- ✅ **Clan System** - Create/join clans with hierarchical roles
- ✅ **Clan Chat** - Real-time communication via WebSocket polling
- ✅ **Alliance System** - Multi-clan alliances and diplomacy
- ✅ **Friends System** - Add friends, online status, private messaging
- ✅ **Global Chat** - Community communication hub
- ✅ **Achievement System** - 40+ achievements with rewards

### 💰 Economy
- ✅ **Banking System** - Loans with interest, deposit/withdrawal
- ✅ **Auction House** - Player-to-player item trading
- ✅ **Resource Trading** - Metal/Energy market exchange
- ✅ **Premium Currency** - Diamonds for premium features

### 🎓 Player Experience
- ✅ **Interactive Tutorial** - 6-quest guided onboarding (react-joyride)
- ✅ **VIP System** - 3 subscription tiers with exclusive benefits
- ✅ **Leaderboards** - Rankings by score, clan, resources
- ✅ **Referral System** - Player acquisition with rewards

### 🛡️ Admin & Moderation
- ✅ **Admin Dashboard** - User management, game monitoring
- ✅ **Player Moderation** - Ban system, activity tracking
- ✅ **Game Statistics** - Analytics and performance metrics

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ (20+ recommended)
- **MongoDB Atlas** account or local MongoDB 6.0+
- **npm** or **pnpm** package manager
- **Git** for version control

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/fame0528/DarkFrame.git
   cd DarkFrame
   ```

2. **Install dependencies** (49 production + 17 dev packages):
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` with your credentials:
   ```env
   # Database
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/
   MONGODB_DB=darkframe
   
   # Authentication (NextAuth)
   NEXTAUTH_SECRET=your-secret-key-here
   NEXTAUTH_URL=http://localhost:3000
   
   # Stripe (optional for payments)
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   
   # Socket.io (optional, defaults to localhost)
   NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
   ```

4. **Initialize the database**:
   ```bash
   # Create map (22,500 tiles)
   npm run init-map
   
   # Create MongoDB indexes (performance)
   npm run create-indexes
   ```

5. **Start development servers**:
   ```bash
   # Option 1: Start both Next.js and Socket.io
   npm run dev
   
   # Option 2: Start separately
   npm run dev:next    # Next.js on :3000
   npm run dev:server  # Socket.io on :3001
   ```

6. **Open in browser**:
   ```
   http://localhost:3000
   ```

7. **Run tests** (optional):
   ```bash
   npm test              # Run all tests
   npm run test:watch    # Watch mode
   npm run test:coverage # Coverage report
   ```

---

## 🧪 Development

### Available Commands

```bash
# Development
npm run dev              # Start both Next.js + Socket.io servers
npm run dev:next         # Start Next.js only (port 3000)
npm run dev:server       # Start Socket.io only (port 3001)

# Building
npm run build            # Production build
npm start                # Start production server

# Te� Game Mechanics

### 🗺️ Map System
- **150×150 Grid** - 22,500 persistent tiles
- **5 Terrain Types** - Metal (20%), Energy (20%), Cave (10%), Factory (10%), Wasteland (40%)
- **Edge Wrap-Around** - Seamless navigation (position 151 → 1)
- **9-Directional Movement** - QWEASDZXC keyboard controls

### ⚔️ Combat System
- **Unit Types** - Multiple units with unique attack/defense stats
- **Base Attacks** - Strategic warfare targeting player bases
- **Defense Systems** - Base upgrades reduce incoming damage
- **Battle Logs** - Comprehensive combat history with analytics
- **Sequential Factory Slots** - Units produced across multiple factories in order

### 💰 Economy & Resources
- **Metal & Energy** - Primary resources gathered from terrain
- **Banking** - Deposit, withdraw, loans with interest rates
- **Auction House** - Player-to-player trading with bidding system
- **Resource Trading** - Market exchange of Metal/Energy
- **Premium Currency** - Diamonds for VIP features and accelerators

### 👥 Clan & Social
- **Clan Creation** - Form clans with customizable names and tags
- **Hierarchy** - Leader, Officers, Members with different permissions
- **Alliance System** - Multi-clan alliances and diplomacy
- **Clan Chat** - Real-time communication via HTTP polling
- **Treasury** - Shared clan resources and funding
- **Friends** - Add friends, view online status, send private messages

### 🏆 Progression
- **Experience System** - Level up through actions
- **Achievements** - 40+ achievements with resource rewards
- **Leaderboards** - Rankings by score, resources, clan power
- **VIP Tiers** - 3 subscription levels (Basic, Premium, Elite)
- **Referral System** - Recruit players and earn bonuses

### 📊 Terrain Distribution

| Terrain Type | Count | Percentage | Purpose |
|--------------|-------|------------|---------|
| **Metal** | 4,500 | 20% | Metal resource gathering |
| **Energy** | 4,500 | 20% | Energy resource gathering |
| **Cave** | 2,250 | 10% | Exploration and discoveries |
| **Factory** | 2,250 | 10% | Unit production slots |
| **Wasteland** | 9,000 | 40% | Default terrain, base placement |

**Total**: 22,500 tiles (150×150 grid)

### 🎯 Movement Controls

```
Q  W  E     [NW] [N]  [NE]
A  S  D  =  [W]  [⟳]  [E]
Z  X  C     [SW] [S]  [SE]
```

**Edge Wrap-Around**: Moving beyond edge wraps to opposite side (151 → 1, 0 → 150)` or `npm run test:watch`
5. **Check types**: `npx tsc --noEmit` (ensure 0 errors)
6. **Commit changes**: Follow conventional commits

### Environment Setup

**Required `.env.local` variables:**
```env
MONGODB_URI=             # MongoDB connection string (required)
MONGODB_DB=darkframe     # Database name (required)
NEXTAUTH_SECRET=         # Random 32-char string (required)
NEXTAUTH_URL=            # App URL (required for NextAuth)
```

**Optional variables:**
```env
STRIPE_SECRET_KEY=       # For payment processing
STRIPE_PUBLISHABLE_KEY=  # For Stripe client
STRIPE_WEBHOOK_SECRET=   # For webhook verification
NEXT_PUBLIC_SOCKET_URL=  # Socket.io server URL
```

### Key Development Files

- **`/dev/QUICK_START.md`** - Session recovery and current status
- **`/dev/roadmap.md`** - Strategic feature roadmap
- **`/docs/DEVELOPMENT.md`** - Comprehensive development guide
- **`/docs/ARCHITECTURE.md`** - System architecture overview
- **`/docs/API.md`** - API endpoint documentation

---

## 🎯 Movement Controls

### Keyboard Navigation (QWEASDZXC)

```
Q  W  E     [NW] [N]  [NE]
A  S  D  =  [W]  [⟳]  [E]
Z  X  C     [SW] [S]  [SE]
```

- **Q**: Northwest
- **W**: North
- **E**: Northeast
- **A**: West
- **S**: Refresh (stay in place)
- **D**: East
- **Z**: Southwest
- **X**: South
- **C**: Southeast

### Edge Wrap-Around
Moving beyond the map edge wraps to the opposite side:
- Position 151 → Position 1
- Position 0 → Position 150

---

## 🏗️ Project Structure

```
DarkFrame/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes (40+ endpoints)
│   │   ├── auth/                 # Authentication endpoints
│   │   ├── player/               # Player management
│   │   ├── clan/                 # Clan operations
│   │   ├── chat/                 # Chat system (HTTP polling)
│   │   ├── attack/               # Combat mechanics
│   │   ├── factory/              # Factory management
│   │   ├── auction/              # Auction house
│   │   ├── bank/                 # Banking system
│   │   ├── admin/                # Admin operations
│   │   └── stripe/               # Payment webhooks
│   ├── game/                     # Game pages
│   ├── clan/                     # Clan pages
│   ├── profile/                  # Player profiles
│   ├── shop/                     # Premium shop
│   ├── admin/                    # Admin dashboard
│   └── layout.tsx                # Root layout
│
├── components/                   # React Components (80+ files)
│   ├── AlliancePanel.tsx         # Clan alliances
│   ├── AuctionHousePanel.tsx     # Trading system
│   ├── BankPanel.tsx             # Banking UI
│   ├── ClanChatPanel.tsx         # Clan communication
│   ├── FactoryManagementPanel.tsx # Unit production
│   ├── TutorialSystem.tsx        # Interactive tutorial
│   └── ...                       # 70+ more components
│
├── lib/                          # Business Logic (40+ services)
│   ├── db/                       # Database layer
│   │   ├── mongodb.ts            # Connection pool
│   │   └── models/               # Mongoose schemas
│   ├── services/                 # Service modules
│   │   ├── playerService.ts      # Player operations
│   │   ├── clanService.ts        # Clan logic
│   │   ├── combatService.ts      # Combat resolution
│   │   ├── chatService.ts        # Chat management
│   │   └── ...                   # 35+ more services
│   ├── middleware/               # Auth & validation
│   └── utils/                    # Shared utilities
│
├── types/                        # TypeScript Definitions
│   ├── game.ts                   # Core game types
│   ├── clan.ts                   # Clan types
│   ├── auth.ts                   # Auth types
│   └── ...                       # 15+ type files
│
├── context/                      # React Context
│   ├── PlayerContext.tsx         # Player state
│   ├── ClanContext.tsx           # Clan state
│   └── SocketContext.tsx         # WebSocket connection
│
├── hooks/                        # Custom React Hooks
│   ├── usePlayer.ts              # Player data
│   ├── useClan.ts                # Clan data
│   └── useSocket.ts              # Socket.io client
│
├── server.ts                     # Socket.io WebSocket Server
├── scripts/                      # Utility Scripts
│   ├── initializeMap.ts          # Map generation (22,500 tiles)
│   ├── createIndexes.ts          # MongoDB indexes
│   └── reset-tutorial.js         # Tutorial reset
│
├── public/                       # Static Assets
│   └── assets/                   # Game assets
│       ├── bases/                # Base images (10 ranks)
│       ├── factories/            # Factory images (10 levels)
│       ├── tiles/                # Terrain images
│       └── units/                # Unit images
│
├── docs/                         # Documentation (12 files)
│   ├── ARCHITECTURE.md           # System architecture
│   ├── DEVELOPMENT.md            # Development guide
│   ├── API.md                    # API documentation
│   └── ...                       # 9 more docs
│
├── dev/                          # Development Tracking (ECHO System)
│   ├── completed.md              # Features completed (99 archived)
│   ├── prDocumentation

### Authentication Endpoints
- **POST** `/api/auth/register` - Create new player account
- **POST** `/api/auth/login` - Player login with credentials
- **GET** `/api/auth/session` - Get current session data

### Player Endpoints
- **GET** `/api/player?username={name}` - Get player data
- **POST** `/api/player/build-unit` - Build combat units
- **POST** `/api/player/upgrade-base` - Upgrade player base
- **GET** `/api/player/stats` - Get player statistics
- **POST** `/api/player/auto-farm` - Manage auto-farm system

### Movement & Map
- **POST** `/api/move` - Move player in direction (QWEASDZXC)
- **GET** `/api/tile?x={x}&y={y}` - Get tile data by coordinates
- **GET** `/api/map/nearby` - Get surrounding tiles

### Clan Endpoints
- **POST** `/api/clan/create` - Create new clan
- **POST** `/api/clan/join` - Join existing clan
- **POST** `/api/clan/leave` - Leave current clan
- **GET** `/api/clan/{clanName}` - Get clan data
- **POST** `/api/clan/invite` - Invite player to clan
- **POST** `/api/clan/kick` - Remove member from clan
- **POST** `/api/clan/promote` - Promote member rank
- **POST** `/api/clan/alliance` - Manage clan alliances

### Chat & Social
- **GET** `/api/chat/messages` - Get chat messages (HTTP polling)
- **POST** `/api/chat/send` - Send chat message
- **GET** `/api/chat/clan` - Get clan chat messages
- **POST** `/api/friends/add` - Send friend request
- **POST** `/api/friends/accept` - Accept friend request
- **GET** `/api/friends/list` - Get friends list
- **POST** `/api/messages/send` - Send private message

### Combat & Warfare
- **POST** `/api/attack/unit` - Attack another player's units
- **POST** `/api/attack/base` - Attack player base
- **POST** `/api/attack/factory` - Attack factory for takeover
- **GET** `/api/battle-log` - Get battle history
- **POST** `/api/wmd/launch` - Launch WMD attack

### Economy
- **POST** `/api/bank/deposit` - Deposit resources to bank
- **POST** `/api/bank/withdraw` - Withdraw from bank
- **POST** `/api/bank/loan` - Request bank loan
- **GET** `/api/auction/listings` - Get auction house listings
- **POST** `/api/auction/create` - Create auction listing
- **POST** `/api/auction/bid` - Place bid on listing
- **GET** `/api/shop/items` - Get premium shop items

### Admin Endpoints
- **GET** `/api/admin/users` - List all users (admin only)
- **POST** `/api/admin/ban` - Ban user (admin only)
- **GET** `/api/admin/stats` - Get game statistics (admin only)

### Stripe Payments
- **POST** `/api/stripe/create-checkout` - Create payment session
- **POST** `/api/stripe/webhook` - Handle Stripe webhooks
- **GET** `/api/stripe/prices` - Get VIP subscription prices

**Full API Documentation**: See [/docs/API.md](./docs/API.md)*React Testing Library 16.3.0** - Component testing
- **mongodb-memory-server 10.2.3** - In-memory MongoDB for tests
- **ESLint 9** - Code linting
- **TypeScript** - Strict type checking

### Utilities
- **bad-words 4.1.0** - Profanity filtering for chat
- **date-fns 4.1.0** - Date manipulation
- **sharp 0.33.5** - Image optimization

**Total Dependencies:** 49 production + 17 dev = 66 packages

---

## 🎨 Adding Tile Images

1. Place your terrain images in `/public/assets/tiles/`
2. Organize by terrain type:
   ```
   tiles/
   ├── metal/metal.png
   ├── energy/energy.png
   ├── cave/cave.png
   ├── factory/factory.png
   └── wasteland/wasteland.png
   ```
3. Recommended size: **512×512 pixels**
4. Format: PNG (with transparency) or JPG

---

## 📡 API Endpoints

### POST `/api/register`
Register new player and spawn on random Wasteland tile.

**Request**:
```json
{
  "username": "Commander42"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "player": { ... },
    "currentTile": { ... }
  }
}
```
🧪 Testing

### Test Coverage
- **Current Coverage**: 15%
- **Target Coverage**: 60%
- **Test Framework**: Vitest 4.0.2 with React Testing Library

### Running Tests

```bash
# Run all tests
npm test

# Watch mode (TDD)
npm run test:watch

# Coverage report
npm run test:coverage

# UI mode (visual test runner)
npm run test:ui
```

### Test Suites
- **API Tests** - Endpoint testing with mocked MongoDB
- **Component Tests** - React component unit tests
- **Integration Tests** - Service layer integration tests
- **E2E Tests** - (Planned) Full user flow testing

### Test Files
```
__tests__/
├── api/
│   ├── player.test.ts      # Player API tests
│   ├── clan.test.ts        # Clan API tests
│   └── auth.test.ts        # Auth API tests
└── components/
    ├── BankPanel.test.tsx  # Bank component tests
    └── ClanChat.test.tsx   # Chat component tests
```

---

## 🚀 Deployment

### Production Build

```bash
# Build optimized production bundle
npm run build

# Start production server
npm start
```

### Environment Variables (Production)

```env
# Database
MONGODB_URI=mongodb+srv://prod-user:password@cluster.mongodb.net/
MONGODB_DB=darkframe-prod

# Authentication
NEXTAUTH_SECRET=<secure-random-32-char-string>
NEXTAUTH_URL=https://your-domain.com

# Stripe (Production)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Socket.io
NEXT_PUBLIC_SOCKET_URL=https://your-domain.com
```

### Deployment Platforms

**Recommended Platforms:**
- **Vercel** - Automatic Next.js deployment with Edge Functions
- **Railway** - Full-stack deployment with MongoDB hosting
- **AWS** - EC2 + MongoDB Atlas for enterprise scale
- **DigitalOcean** - Droplet deployment with managed databases

### Pre-Deployment Checklist

- [ ] TypeScript compilation: `npx tsc --noEmit` (0 errors)
- [ ] Tests passing: `npm test` (all green)
- [ ] Environment variables configured
- [ ] MongoDB indexes created: `npm run create-indexes`
- [ ] Map initialized: `npm run init-map`
- [ ] Stripe webhooks configured (if using payments)
- [ ] Socket.io server URL updated
- [ ] Rate limiting configured for APIs
- [ ] CORS settings verified
- [ ] Error monitoring setup (Sentry, LogRocket, etc.)

---

## 📚 Documentation

### Core Documentation
- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - System architecture and design patterns
- **[DEVELOPMENT.md](./docs/DEVELOPMENT.md)** - Development workflow and guidelines
- **[API.md](./docs/API.md)** - Complete API endpoint reference
- **[SETUP.md](./docs/SETUP.md)** - Detailed setup instructions

### Feature Documentation
- **[REFERRAL_SYSTEM_GUIDE.md](./docs/REFERRAL_SYSTEM_GUIDE.md)** - Referral system implementation
- **[CHAT_WINDOW_FIX.md](./docs/CHAT_WINDOW_FIX.md)** - Chat system technical details

### Project Management
- **[ROADMAP.md](./dev/roadmap.md)** - Strategic feature roadmap
- **[CHANGELOG.md](./docs/CHANGELOG.md)** - Version history and updates
- **[BUG_RESOLUTION_GUIDE.md](./docs/BUG_RESOLUTION_GUIDE.md)** - Common issues and fixes

### Development Tracking (ECHO System)
- **[/dev/QUICK_START.md](./dev/QUICK_START.md)** - Session recovery and current status
- **[/dev/completed.md](./dev/completed.md)** - Completed features (99 archived)
- **[/dev/progress.md](./dev/progress.md)** - Active development work
- **[/dev/planned.md](./dev/planned.md)** - Feature backlog and planning

---

## 🤝 Contributing

### Development Status
**Status**: ✅ Production-Ready | 99 Features Complete | Baseline Reset January 18, 2026

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**: Follow code quality standards
4. **Run tests**: `npm test` (ensure all pass)
5. **Check types**: `npx tsc --noEmit` (0 errors required)
6. **Commit changes**: Use conventional commits
7. **Push to branch**: `git push origin feature/amazing-feature`
8. **Open a Pull Request**

### Code Quality Standards

- **TypeScript**: Strict mode, 0 compilation errors
- **Testing**: Maintain or improve 15% coverage
- **Documentation**: JSDoc comments for all functions
- **Formatting**: Follow existing code style
- **Performance**: No N+1 queries, optimize loops
- **Security**: Validate all inputs, sanitize outputs

### Priority Areas for Contribution

1. **Increase Test Coverage** - Currently 15%, target 60%
2. **Sprint 2 Testing** - Social features need comprehensive tests
3. **Performance Optimization** - Database query optimization
4. **Documentation** - Expand API and feature docs
5. **Accessibility** - WCAG 2.1 AA compliance

---

## 📊 Project Statistics

- **Total Features**: 99 completed (3 months development)
- **Lines of Code**: 488 files, 106,255+ insertions
- **TypeScript Errors**: 0 (strict mode enabled)
- **Test Coverage**: 15% (target: 60%)
- **ECHO Compliance**: 85% (18/26 barrel exports)
- **API Endpoints**: 40+ RESTful endpoints
- **Components**: 80+ React components
- **Services**: 40+ service modules
- **Dependencies**: 49 production + 17 dev = 66 packages

### Development Timeline
- **Sprint 1**: Interactive Tutorial System (Oct 25-26, 2025)
- **Sprint 2**: Social & Communication System (Oct 26, 2025)
- **Sprint 3**: ECHO Architecture Compliance (Oct 26, 2025)
- **Baseline Reset**: January 18, 2026
- **GitHub Backup**: January 18, 2026 (415 MB repository)

---

## 🐛 Troubleshooting

### Common Issues

**Map Not Initializing**
```bash
# Verify MongoDB connection
npx tsx scripts/initializeMap.ts

# Check .env.local has correct MONGODB_URI
```

**Port Already in Use**
```bash
# Kill process on port 3000
npx kill-port 3000

# Or change port in package.json
"dev": "next dev -p 3001"
```

**TypeScript Errors**
```bash
# Check for type errors
npx tsc --noEmit

# Rebuild if needed
npm run build
```

**Socket.io Connection Failed**
```bash
# Ensure Socket.io server is running
npm run dev:server

# Check NEXT_PUBLIC_SOCKET_URL in .env.local
```

**MongoDB Connection Timeout**
```bash
# Verify IP whitelist in MongoDB Atlas
# Check network/firewall settings
# Verify connection string format
```

**Build Failures**
```bash
# Clear Next.js cache
rm -rf .next

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## 📞 Support & Contact

- **GitHub Issues**: Report bugs and feature requests
- **GitHub Discussions**: Community discussions and Q&A
- **Documentation**: Check `/docs` folder for guides

---

## 📝 License

MIT License - See [LICENSE](./LICENSE) file for details

---

## 🙏 Acknowledgments

- **Next.js Team** - Amazing React framework
- **Vercel** - Deployment platform
- **MongoDB** - Database solution
- **Socket.io** - Real-time communication
- **Stripe** - Payment processing
- **Open Source Community** - All the amazing libraries

---

## 🎯 Next Steps

**High Priority Options:**

1. **Sprint 2 Testing** - Social features 75% code-complete, needs testing (3-4h)
2. **Increase Test Coverage** - From 15% to 60% target (8-10h)
3. **Production Infrastructure** - Monitoring, CI/CD, performance (8-12h)
4. **ECHO Architecture Migration** - Complete barrel exports (4-5h)

**See**: [/dev/planned.md](./dev/planned.md) for detailed feature backlog

---

<div align="center">

**Built with ❤️ using Next.js, TypeScript, MongoDB, and Socket.io**

⭐ Star this repo if you find it useful!

[Report Bug](https://github.com/fame0528/DarkFrame/issues) · [Request Feature](https://github.com/fame0528/DarkFrame/issues) · [Documentation](./docs)

</div>
