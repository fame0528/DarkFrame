# DarkFrame

> Tile-based online strategy game built with Next.js and MongoDB

---

## 🎮 Game Overview

DarkFrame is a persistent multiplayer strategy game featuring:
- **150×150 static tile-based map** (22,500 tiles)
- **5 terrain types** with specific distributions
- **9-directional movement** with edge wrap-around
- **Resource gathering** (Metal & Energy)
- **Base management** and exploration

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ installed
- **MongoDB Atlas** account (or local MongoDB instance)
- **npm** or **pnpm** package manager

### Installation

1. **Clone/Navigate to project**:
   ```bash
   cd darkframe
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   - Copy `.env.example` to `.env.local`
   - Add your MongoDB connection string:
     ```
     MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
     MONGODB_DB=darkframe
     ```

4. **Initialize the game map**:
   ```bash
   npx tsx scripts/initializeMap.ts
   ```
   
   This creates 22,500 tiles with exact terrain distribution. Safe to run multiple times (idempotent).

5. **Start development server**:
   ```bash
   npm run dev
   ```

6. **Open in browser**:
   ```
   http://localhost:3000
   ```

---

## 📊 Terrain Distribution

| Terrain Type | Count | Percentage |
|--------------|-------|------------|
| **Metal** | 4,500 | 20% |
| **Energy** | 4,500 | 20% |
| **Cave** | 2,250 | 10% |
| **Factory** | 2,250 | 10% |
| **Wasteland** | 9,000 | 40% |

**Total**: 22,500 tiles (150×150 grid)

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
darkframe/
├── app/
│   ├── api/              # API routes
│   │   ├── register/     # Player registration
│   │   ├── move/         # Movement endpoint
│   │   ├── player/       # Player data
│   │   └── tile/         # Tile data
│   ├── register/         # Registration page
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Main game page
├── components/           # React components
├── lib/                  # Business logic
│   ├── mongodb.ts        # Database connection
│   ├── mapGeneration.ts  # Map generation
│   ├── playerService.ts  # Player operations
│   └── movementService.ts # Movement logic
├── types/                # TypeScript definitions
├── utils/                # Utility functions
├── public/assets/tiles/  # Tile images
├── dev/                  # Development tracking
└── scripts/              # Utility scripts
```

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Database**: MongoDB Atlas
- **Runtime**: Node.js

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

### POST `/api/move`
Move player in specified direction.

**Request**:
```json
{
  "username": "Commander42",
  "direction": "N"
}
```

### GET `/api/player?username=Commander42`
Get player data.

### GET `/api/tile?x=75&y=100`
Get tile data by coordinates.

---

## 🧪 Development

### Run Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
npm start
```

### Reinitialize Map
```bash
npx tsx scripts/initializeMap.ts
```

---

## 📋 Phase 1 Features

- ✅ Static 150×150 map generation
- ✅ MongoDB persistence
- ✅ Player registration and spawning
- ✅ 9-direction movement with wrap-around
- ✅ Tile-by-tile navigation
- ✅ Resource tracking (Metal, Energy)
- ⏳ UI Components (in progress)

---

## 🗺️ Roadmap

### Phase 2: Resource Gathering
- Resource collection mechanics
- Inventory management
- Base storage

### Phase 3: Combat & Factories
- Factory attack system
- Unit production
- Combat resolution

### Phase 4: Advanced Features
- Cave exploration
- Player rankings
- Battle logs
- Enhanced UI/UX

---

## ⚙️ Configuration

### Environment Variables

Create `.env.local` file:

```env
# MongoDB Atlas Connection
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=darkframe
```

**⚠️ Never commit `.env.local` to version control!**

---

## 🐛 Troubleshooting

### Map Not Initializing
```bash
# Check MongoDB connection
npx tsx scripts/initializeMap.ts

# Verify MONGODB_URI in .env.local
```

### Port Already in Use
```bash
# Change port in package.json dev script:
"dev": "next dev -p 3001"
```

### Type Errors
```bash
# Rebuild TypeScript
npm run build
```

---

## 📝 License

MIT License - See LICENSE file for details

---

## 🤝 Contributing

Phase 1 is MVP - contributions welcome for Phase 2+!

---

**Built with ❤️ using Next.js, TypeScript, and MongoDB**
