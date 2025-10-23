PS D:\dev\DarkFrame> npm run dev

> darkframe@0.1.0 dev
> tsx -r dotenv/config server.js dotenv_config_path=.env.local

[Server] 🔄 Preparing Next.js application...
[Server] ✅ Next.js application ready
[Server] 🔄 Initializing Socket.io...
[Socket.io] Initializing server...
[Socket.io] Server initialized successfully
[Server] ✅ Socket.io initialized and ready

╔════════════════════════════════════════════════════════╗
║  🚀 DarkFrame Server Ready (TypeScript)                ║
║                                                        ║
║  🌐 HTTP:      http://localhost:3000                      ║
║  🔌 WebSocket: ws://localhost:3000/api/socketio          ║
║  📦 Mode:      Development                          ║
║  🔧 Runtime:   tsx (TypeScript execution)            ║
╚════════════════════════════════════════════════════════╝
    
 ○ Compiling / ...
 ✓ Compiled / in 4.7s (692 modules)
 GET / 200 in 5211ms
 ✓ Compiled in 476ms (318 modules)
[Socket.io] Authentication failed: Invalid or expired authentication token
 ○ Compiling /api/auth/session ...
<w> [webpack.cache.PackFileCacheStrategy] Caching failed for pack: Error: Unable to snapshot resolve dependencies
<w> [webpack.cache.PackFileCacheStrategy] Caching failed for pack: Error: Unable to snapshot resolve dependencies
 ✓ Compiled /api/auth/session in 3.2s (756 modules)
🔍 Session validated { username: 'FAME' }
 GET /api/auth/session 200 in 3299ms
 ✓ Compiled /api/player in 349ms (769 modules)
 GET /api/player?username=FAME 200 in 914ms
 ✓ Compiled /api/tile in 237ms (773 modules)
 GET /api/tile?x=1&y=1 200 in 314ms
 ○ Compiling /middleware ...
 ✓ Compiled /middleware in 611ms (167 modules)
🔍 Authenticated user accessing route { path: '/game', username: 'FAME' }
 ○ Compiling /game ...
 ✓ Compiled /game in 4.1s (3448 modules)
 GET /game 200 in 4386ms
 ○ Compiling /api/combat/logs ...
 ✓ Compiled /api/combat/logs in 1785ms (3466 modules)
🔄 Building image manifest...
📁 Found 1 image(s) in metal: [ 'metal.jpg' ]
📁 Found 1 image(s) in energy: [ 'energy.jpg' ]
📁 Found 1 image(s) in cave: [ 'cave.jpg' ]
📁 Found 4 image(s) in forest: [ 'forest_1.jpg', 'forest_2.jpg', 'forest_3.jpg', 'forest_4.jpg' ]
📁 No images found in factory
📁 Found 4 image(s) in wasteland: [
  'wasteland_1.jpg',
  'wasteland_2.jpg',
  'wasteland_3.jpg',
  'wasteland_4.jpg'
]
📁 Found 3 image(s) in banks: [ 'energy-bank.jpg', 'metal-bank.jpg', 'exchange_bank.jpg' ]
📁 Found 1 image(s) in shrine: [ 'shrine-base.jpg' ]
📁 Found 1 image(s) in auction: [ 'auction.jpg' ]
📁 Found 10 image(s) in bases: [
  '10.jpg', '7.jpg',
  '6.jpg',  '1.jpg',
  '4.jpg',  '2.jpg',
  '8.jpg',  '9.jpg',
  '3.jpg',  '5.jpg'
]
✅ Image manifest built: 10 terrain types
 GET /api/assets/images 200 in 1922ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 1947ms
 GET /api/player/inventory 401 in 1955ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 1993ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 49ms
 GET /api/player/inventory 401 in 63ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 102ms
<w> [webpack.cache.PackFileCacheStrategy] Caching failed for pack: Error: Unable to snapshot resolve dependencies
 ○ Compiling /api/move ...
 ✓ Compiled /api/move in 577ms (3471 modules)
 GET /api/tile?x=2&y=1 200 in 382ms
 GET /api/tile?x=1&y=1 200 in 670ms
 GET /api/tile?x=2&y=1 200 in 56ms
🚶 Moving FAME from (1, 1) to (2, 1) [E]
✅ Updated FAME position to (2, 1)
📊 Activity logged: FAME - move
 POST /api/move 200 in 1213ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 63ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 71ms
🚶 Moving FAME from (2, 1) to (3, 1) [E]
✅ Updated FAME position to (3, 1)
 GET /api/tile?x=3&y=1 200 in 51ms
📊 Activity logged: FAME - move
 GET /api/tile?x=3&y=1 200 in 53ms
 POST /api/move 200 in 332ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 63ms
🚶 Moving FAME from (3, 1) to (4, 1) [E]
✅ Updated FAME position to (4, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=4&y=1 200 in 51ms
 POST /api/move 200 in 297ms
 GET /api/tile?x=4&y=1 200 in 56ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 98ms
 ○ Compiling /api/harvest ...
 ✓ Compiled /api/harvest in 568ms (3478 modules)
 GET /api/combat/logs?username=FAME&summary=true 200 in 630ms
📊 Activity logged: FAME - cave_explore
 POST /api/harvest 200 in 1162ms
🚶 Moving FAME from (4, 1) to (5, 1) [E]
✅ Updated FAME position to (5, 1)
 GET /api/tile?x=5&y=1 200 in 74ms
📊 Activity logged: FAME - move
 GET /api/tile?x=5&y=1 200 in 66ms
 POST /api/move 200 in 370ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 43ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 101ms
✅ Player FAME harvested 882 Energy at (5, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 763ms
🚶 Moving FAME from (5, 1) to (6, 1) [E]
✅ Updated FAME position to (6, 1)
 GET /api/tile?x=6&y=1 200 in 53ms
📊 Activity logged: FAME - move
 GET /api/tile?x=6&y=1 200 in 52ms
 POST /api/move 200 in 322ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 29ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 93ms
✅ Player FAME harvested 705 Energy at (6, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 695ms
🚶 Moving FAME from (6, 1) to (7, 1) [E]
✅ Updated FAME position to (7, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=7&y=1 200 in 53ms
 GET /api/tile?x=7&y=1 200 in 51ms
 POST /api/move 200 in 322ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 31ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 96ms
📊 Activity logged: FAME - cave_explore
 POST /api/harvest 200 in 509ms
🚶 Moving FAME from (7, 1) to (8, 1) [E]
✅ Updated FAME position to (8, 1)
 GET /api/tile?x=8&y=1 200 in 51ms
📊 Activity logged: FAME - move
 GET /api/tile?x=8&y=1 200 in 56ms
 POST /api/move 200 in 323ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 46ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 108ms
✅ Player FAME harvested 906 Metal at (8, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 707ms
🚶 Moving FAME from (8, 1) to (9, 1) [E]
✅ Updated FAME position to (9, 1)
 GET /api/tile?x=9&y=1 200 in 54ms
📊 Activity logged: FAME - move
 GET /api/tile?x=9&y=1 200 in 55ms
 POST /api/move 200 in 324ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 33ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 94ms
✅ Player FAME harvested 976 Energy at (9, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 696ms
🚶 Moving FAME from (9, 1) to (10, 1) [E]
✅ Updated FAME position to (10, 1)
 GET /api/tile?x=10&y=1 200 in 51ms
📊 Activity logged: FAME - move
 GET /api/tile?x=10&y=1 200 in 52ms
 POST /api/move 200 in 325ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 90ms
✅ Player FAME harvested 1004 Metal at (10, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 714ms
🚶 Moving FAME from (10, 1) to (11, 1) [E]
✅ Updated FAME position to (11, 1)
 GET /api/tile?x=11&y=1 200 in 51ms
📊 Activity logged: FAME - move
 GET /api/tile?x=11&y=1 200 in 63ms
 POST /api/move 200 in 325ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 39ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 65ms
🚶 Moving FAME from (11, 1) to (12, 1) [E]
✅ Updated FAME position to (12, 1)
 GET /api/tile?x=12&y=1 200 in 51ms
📊 Activity logged: FAME - move
 GET /api/tile?x=12&y=1 200 in 53ms
 POST /api/move 200 in 325ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 92ms
✅ Player FAME harvested 1124 Energy at (12, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 693ms
🚶 Moving FAME from (12, 1) to (13, 1) [E]
✅ Updated FAME position to (13, 1)
 GET /api/tile?x=13&y=1 200 in 51ms
📊 Activity logged: FAME - move
 GET /api/tile?x=13&y=1 200 in 56ms
 POST /api/move 200 in 328ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 37ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 64ms
🚶 Moving FAME from (13, 1) to (14, 1) [E]
✅ Updated FAME position to (14, 1)
 GET /api/tile?x=14&y=1 200 in 52ms
📊 Activity logged: FAME - move
 GET /api/tile?x=14&y=1 200 in 51ms
 POST /api/move 200 in 335ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 38ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 65ms
🚶 Moving FAME from (14, 1) to (15, 1) [E]
✅ Updated FAME position to (15, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=15&y=1 200 in 51ms
 POST /api/move 200 in 295ms
 GET /api/tile?x=15&y=1 200 in 53ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 39ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 95ms
🚶 Moving FAME from (15, 1) to (16, 1) [E]
✅ Updated FAME position to (16, 1)
 GET /api/tile?x=16&y=1 200 in 54ms
📊 Activity logged: FAME - move
 GET /api/tile?x=16&y=1 200 in 51ms
 POST /api/move 200 in 326ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 63ms
🚶 Moving FAME from (16, 1) to (17, 1) [E]
✅ Updated FAME position to (17, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=17&y=1 200 in 51ms
 POST /api/move 200 in 303ms
 GET /api/tile?x=17&y=1 200 in 52ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 44ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 91ms
✅ Player FAME harvested 670 Metal at (17, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 749ms
🚶 Moving FAME from (17, 1) to (18, 1) [E]
✅ Updated FAME position to (18, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=18&y=1 200 in 52ms
 GET /api/tile?x=18&y=1 200 in 54ms
 POST /api/move 200 in 323ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 63ms
🚶 Moving FAME from (18, 1) to (19, 1) [E]
✅ Updated FAME position to (19, 1)
 GET /api/tile?x=19&y=1 200 in 52ms
📊 Activity logged: FAME - move
 GET /api/tile?x=19&y=1 200 in 51ms
 POST /api/move 200 in 323ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 31ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 95ms
✅ Player FAME harvested 800 Metal at (19, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 704ms
🚶 Moving FAME from (19, 1) to (20, 1) [E]
✅ Updated FAME position to (20, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=20&y=1 200 in 53ms
 GET /api/tile?x=20&y=1 200 in 52ms
 POST /api/move 200 in 327ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 30ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 92ms
✅ Player FAME harvested 703 Energy at (20, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 696ms
🚶 Moving FAME from (20, 1) to (21, 1) [E]
✅ Updated FAME position to (21, 1)
 GET /api/tile?x=21&y=1 200 in 51ms
📊 Activity logged: FAME - move
 POST /api/move 200 in 344ms
 ○ Compiling /api/factory/status ...
 ✓ Compiled /api/factory/status in 795ms (3482 modules)
 GET /api/combat/logs?username=FAME&summary=true 200 in 763ms
 GET /api/tile?x=21&y=1 200 in 878ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 819ms
 GET /api/factory/status?x=21&y=1 200 in 936ms
 GET /api/factory/status?x=21&y=1 200 in 57ms
 GET /api/factory/status?x=21&y=1 200 in 52ms
🚶 Moving FAME from (21, 1) to (22, 1) [E]
✅ Updated FAME position to (22, 1)
 GET /api/tile?x=22&y=1 200 in 51ms
📊 Activity logged: FAME - move
 GET /api/tile?x=22&y=1 200 in 59ms
 POST /api/move 200 in 344ms
 GET /api/factory/status?x=22&y=1 200 in 98ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 44ms
 GET /api/factory/status?x=22&y=1 200 in 62ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 92ms
 GET /api/factory/status?x=22&y=1 200 in 53ms
🚶 Moving FAME from (22, 1) to (23, 1) [E]
✅ Updated FAME position to (23, 1)
 GET /api/tile?x=23&y=1 200 in 51ms
📊 Activity logged: FAME - move
 GET /api/tile?x=23&y=1 200 in 52ms
 POST /api/move 200 in 321ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 38ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 64ms
🚶 Moving FAME from (23, 1) to (24, 1) [E]
✅ Updated FAME position to (24, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=24&y=1 200 in 51ms
 POST /api/move 200 in 298ms
 GET /api/tile?x=24&y=1 200 in 54ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 44ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 93ms
📊 Activity logged: FAME - cave_explore
 POST /api/harvest 200 in 526ms
🚶 Moving FAME from (24, 1) to (25, 1) [E]
✅ Updated FAME position to (25, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=25&y=1 200 in 51ms
 GET /api/tile?x=25&y=1 200 in 53ms
 POST /api/move 200 in 325ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 38ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 99ms
✅ Player FAME harvested 1047 Metal at (25, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 699ms
🚶 Moving FAME from (25, 1) to (26, 1) [E]
✅ Updated FAME position to (26, 1)
 GET /api/tile?x=26&y=1 200 in 51ms
📊 Activity logged: FAME - move
 GET /api/tile?x=26&y=1 200 in 51ms
 POST /api/move 200 in 334ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 66ms
✅ Player FAME harvested 964 Energy at (26, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 724ms
🚶 Moving FAME from (26, 1) to (27, 1) [E]
✅ Updated FAME position to (27, 1)
 GET /api/tile?x=27&y=1 200 in 53ms
📊 Activity logged: FAME - move
 GET /api/tile?x=27&y=1 200 in 51ms
 POST /api/move 200 in 323ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 39ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 65ms
🚶 Moving FAME from (27, 1) to (28, 1) [E]
✅ Updated FAME position to (28, 1)
 GET /api/tile?x=28&y=1 200 in 52ms
📊 Activity logged: FAME - move
 GET /api/tile?x=28&y=1 200 in 63ms
 POST /api/move 200 in 325ms
 GET /api/factory/status?x=28&y=1 200 in 106ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 38ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 63ms
 GET /api/factory/status?x=28&y=1 200 in 55ms
 GET /api/factory/status?x=28&y=1 200 in 52ms
🚶 Moving FAME from (28, 1) to (29, 1) [E]
✅ Updated FAME position to (29, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=29&y=1 200 in 52ms
 GET /api/tile?x=29&y=1 200 in 52ms
 POST /api/move 200 in 322ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 44ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 106ms
✅ Player FAME harvested 1110 Energy at (29, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 709ms
🚶 Moving FAME from (29, 1) to (30, 1) [E]
✅ Updated FAME position to (30, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=30&y=1 200 in 51ms
 GET /api/tile?x=30&y=1 200 in 52ms
 POST /api/move 200 in 323ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 99ms
✅ Player FAME harvested 785 Metal at (30, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 706ms
 GET /api/tile?x=31&y=1 200 in 277ms
 GET /api/tile?x=31&y=1 200 in 203ms
🚶 Moving FAME from (30, 1) to (31, 1) [E]
✅ Updated FAME position to (31, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=32&y=1 200 in 60ms
 GET /api/tile?x=32&y=1 200 in 51ms
 POST /api/move 200 in 1527ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 32ms
 POST /api/harvest 400 in 88ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 94ms
 GET /api/tile?x=33&y=1 200 in 202ms
 GET /api/tile?x=33&y=1 200 in 158ms
🚶 Moving FAME from (31, 1) to (32, 1) [E]
✅ Updated FAME position to (32, 1)
📊 Activity logged: FAME - move
 POST /api/move 200 in 870ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 38ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 63ms
🚶 Moving FAME from (32, 1) to (33, 1) [E]
✅ Updated FAME position to (33, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=34&y=1 200 in 53ms
 GET /api/tile?x=34&y=1 200 in 51ms
 POST /api/move 200 in 323ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 32ms
 POST /api/harvest 400 in 316ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 320ms
🚶 Moving FAME from (33, 1) to (34, 1) [E]
✅ Updated FAME position to (34, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=35&y=1 200 in 51ms
 GET /api/tile?x=35&y=1 200 in 56ms
 POST /api/move 200 in 359ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 38ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 86ms
📊 Activity logged: FAME - cave_explore
 POST /api/harvest 200 in 1186ms
 GET /api/tile?x=36&y=1 200 in 118ms
🚶 Moving FAME from (34, 1) to (35, 1) [E]
 GET /api/tile?x=36&y=1 200 in 116ms
✅ Updated FAME position to (35, 1)
📊 Activity logged: FAME - move
 POST /api/move 200 in 820ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 106ms
✅ Player FAME harvested 871 Metal at (35, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 1565ms
🚶 Moving FAME from (35, 1) to (36, 1) [E]
 GET /api/tile?x=37&y=1 200 in 78ms
✅ Updated FAME position to (36, 1)
 GET /api/tile?x=37&y=1 200 in 83ms
📊 Activity logged: FAME - move
 POST /api/move 200 in 568ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 37ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 98ms
✅ Player FAME harvested 1179 Energy at (36, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 1801ms
 GET /api/tile?x=38&y=1 200 in 133ms
🚶 Moving FAME from (36, 1) to (37, 1) [E]
 GET /api/tile?x=38&y=1 200 in 127ms
✅ Updated FAME position to (37, 1)
📊 Activity logged: FAME - move
 POST /api/move 200 in 1030ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 37ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 122ms
✅ Player FAME harvested 1043 Metal at (37, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 1925ms
🚶 Moving FAME from (37, 1) to (38, 1) [E]
 GET /api/tile?x=39&y=1 200 in 76ms
✅ Updated FAME position to (38, 1)
 GET /api/tile?x=39&y=1 200 in 74ms
📊 Activity logged: FAME - move
 POST /api/move 200 in 566ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 89ms
✅ Player FAME harvested 977 Metal at (38, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 1504ms
🚶 Moving FAME from (38, 1) to (39, 1) [E]
 GET /api/tile?x=40&y=1 200 in 83ms
✅ Updated FAME position to (39, 1)
 GET /api/tile?x=40&y=1 200 in 86ms
📊 Activity logged: FAME - move
 POST /api/move 200 in 609ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 37ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 98ms
📊 Activity logged: FAME - cave_explore
 POST /api/harvest 200 in 1117ms
🚶 Moving FAME from (39, 1) to (40, 1) [E]
 GET /api/tile?x=41&y=1 200 in 91ms
✅ Updated FAME position to (40, 1)
 GET /api/tile?x=41&y=1 200 in 85ms
📊 Activity logged: FAME - move
 POST /api/move 200 in 665ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 109ms
✅ Player FAME harvested 780 Energy at (40, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 1844ms
 GET /api/tile?x=42&y=1 200 in 96ms
🚶 Moving FAME from (40, 1) to (41, 1) [E]
 GET /api/tile?x=42&y=1 200 in 102ms
✅ Updated FAME position to (41, 1)
📊 Activity logged: FAME - move
 POST /api/move 200 in 764ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 35ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 98ms
✅ Player FAME harvested 1185 Energy at (41, 1)
📊 Activity logged: FAME - harvest
 POST /api/harvest 200 in 1701ms
 GET /api/tile?x=43&y=1 200 in 131ms
🚶 Moving FAME from (41, 1) to (42, 1) [E]
 GET /api/tile?x=43&y=1 200 in 149ms
✅ Updated FAME position to (42, 1)
 GET /api/factory/status?x=43&y=1 200 in 241ms
📊 Activity logged: FAME - move
 GET /api/factory/status?x=43&y=1 200 in 143ms
 POST /api/move 200 in 857ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 71ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 152ms
🚶 Moving FAME from (42, 1) to (43, 1) [E]
 GET /api/tile?x=44&y=1 200 in 139ms
✅ Updated FAME position to (43, 1)
 GET /api/tile?x=44&y=1 200 in 133ms
📊 Activity logged: FAME - move
 POST /api/move 200 in 846ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 84ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 173ms
 GET /api/factory/status?x=43&y=1 200 in 194ms
 GET /api/factory/status?x=43&y=1 200 in 155ms
 GET /api/tile?x=45&y=1 200 in 158ms
🚶 Moving FAME from (43, 1) to (44, 1) [E]
✅ Updated FAME position to (44, 1)
 GET /api/tile?x=45&y=1 200 in 173ms
📊 Activity logged: FAME - move
 POST /api/move 200 in 1035ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 79ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 190ms
 GET /api/tile?x=46&y=1 200 in 141ms
🚶 Moving FAME from (44, 1) to (45, 1) [E]
 GET /api/tile?x=46&y=1 200 in 163ms
✅ Updated FAME position to (45, 1)
 GET /api/factory/status?x=46&y=1 200 in 274ms
<w> [webpack.cache.PackFileCacheStrategy] Caching failed for pack: Error: Unable to snapshot resolve dependencies
 GET /api/factory/status?x=46&y=1 200 in 184ms
📊 Activity logged: FAME - move
<w> [webpack.cache.PackFileCacheStrategy] Caching failed for pack: Error: Unable to snapshot resolve dependencies
 POST /api/move 200 in 1037ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 138ms
 GET /api/tile?x=47&y=1 200 in 137ms
 GET /api/tile?x=47&y=1 200 in 133ms
 POST /api/harvest 400 in 256ms
🚶 Moving FAME from (45, 1) to (46, 1) [E]
✅ Updated FAME position to (46, 1)
 GET /api/tile?x=48&y=1 200 in 70ms
 GET /api/tile?x=48&y=1 200 in 73ms
📊 Activity logged: FAME - move
 POST /api/move 200 in 483ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 45ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 94ms
 GET /api/factory/status?x=46&y=1 200 in 106ms
 GET /api/factory/status?x=46&y=1 200 in 85ms
 GET /api/tile?x=49&y=1 200 in 96ms
🚶 Moving FAME from (46, 1) to (47, 1) [E]
✅ Updated FAME position to (47, 1)
 GET /api/tile?x=49&y=1 200 in 97ms
📊 Activity logged: FAME - move
 POST /api/move 200 in 714ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 38ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 115ms
🚶 Moving FAME from (47, 1) to (48, 1) [E]
 GET /api/tile?x=50&y=1 200 in 115ms
✅ Updated FAME position to (48, 1)
 GET /api/tile?x=50&y=1 200 in 113ms
📊 Activity logged: FAME - move
 POST /api/move 200 in 809ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 37ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 138ms
 GET /api/tile?x=51&y=1 200 in 135ms
🚶 Moving FAME from (48, 1) to (49, 1) [E]
 GET /api/tile?x=51&y=1 200 in 139ms
✅ Updated FAME position to (49, 1)
📊 Activity logged: FAME - move
 POST /api/move 200 in 982ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 157ms
 GET /api/tile?x=52&y=1 200 in 152ms
 GET /api/tile?x=52&y=1 200 in 110ms
🚶 Moving FAME from (49, 1) to (50, 1) [E]
✅ Updated FAME position to (50, 1)
📊 Activity logged: FAME - move
 GET /api/tile?x=53&y=1 200 in 124ms
 GET /api/tile?x=53&y=1 200 in 147ms
 POST /api/move 200 in 554ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 37ms
 GET /api/factory/status?x=53&y=1 200 in 268ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 125ms
 GET /api/factory/status?x=53&y=1 200 in 106ms
 GET /api/tile?x=54&y=1 200 in 87ms
🚶 Moving FAME from (50, 1) to (51, 1) [E]
 GET /api/tile?x=54&y=1 200 in 89ms
✅ Updated FAME position to (51, 1)
📊 Activity logged: FAME - move
 POST /api/harvest 400 in 240ms
 POST /api/move 200 in 672ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 105ms
 GET /api/tile?x=55&y=1 200 in 91ms
🚶 Moving FAME from (51, 1) to (52, 1) [E]
✅ Updated FAME position to (52, 1)
 GET /api/tile?x=55&y=1 200 in 95ms
📊 Activity logged: FAME - move
 POST /api/harvest 400 in 253ms
 POST /api/move 200 in 700ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 37ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 115ms
 GET /api/tile?x=56&y=1 200 in 90ms
🚶 Moving FAME from (52, 1) to (53, 1) [E]
✅ Updated FAME position to (53, 1)
 GET /api/tile?x=56&y=1 200 in 101ms
 GET /api/factory/status?x=56&y=1 200 in 175ms
📊 Activity logged: FAME - move
 GET /api/factory/status?x=56&y=1 200 in 93ms
 POST /api/move 200 in 666ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 46ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 115ms
 GET /api/factory/status?x=53&y=1 200 in 128ms
 GET /api/factory/status?x=53&y=1 200 in 101ms
 GET /api/tile?x=57&y=1 200 in 104ms
🚶 Moving FAME from (53, 1) to (54, 1) [E]
 GET /api/tile?x=57&y=1 200 in 108ms
✅ Updated FAME position to (54, 1)
📊 Activity logged: FAME - move
 POST /api/move 200 in 867ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 36ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 117ms

[Server] 🛑 SIGINT received, shutting down gracefully...
PS D:\dev\DarkFrame>  GET /api/tile?x=58&y=1 200 in 98ms
🚶 Moving FAME from (54, 1) to (55, 1) [E]
 GET /api/tile?x=58&y=1 200 in 95ms
✅ Updated FAME position to (55, 1)
📊 Activity logged: FAME - move
 POST /api/move 200 in 781ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 28ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 118ms
🚶 Moving FAME from (55, 1) to (56, 1) [E]
 GET /api/tile?x=59&y=1 200 in 82ms
✅ Updated FAME position to (56, 1)
 GET /api/tile?x=59&y=1 200 in 81ms
📊 Activity logged: FAME - move
 POST /api/move 200 in 615ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 29ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 71ms
 GET /api/factory/status?x=56&y=1 200 in 63ms
 GET /api/factory/status?x=56&y=1 200 in 65ms
🚶 Moving FAME from (56, 1) to (57, 1) [E]
                     ^C
PS D:\dev\DarkFrame> ✅ Updated FAME position to (57, 1)
 GET /api/tile?x=60&y=1 200 in 62ms
📊 Activity logged: FAME - move
 GET /api/tile?x=60&y=1 200 in 48ms
 POST /api/move 200 in 377ms
 GET /api/factory/status?x=60&y=1 200 in 81ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 26ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 61ms
 GET /api/factory/status?x=60&y=1 200 in 47ms
                     ^C
PS D:\dev\DarkFrame> 🚶 Moving FAME from (57, 1) to (58, 1) [E]
✅ Updated FAME position to (58, 1)
 GET /api/tile?x=61&y=1 200 in 56ms
📊 Activity logged: FAME - move
 GET /api/tile?x=61&y=1 200 in 60ms
 POST /api/move 200 in 372ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 70ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 15ms
 POST /api/harvest 400 in 155ms
🚶 Moving FAME from (58, 1) to (59, 1) [E]
 GET /api/tile?x=62&y=1 200 in 60ms
✅ Updated FAME position to (59, 1)
 GET /api/tile?x=62&y=1 200 in 63ms
📊 Activity logged: FAME - move
 POST /api/move 200 in 468ms
 POST /api/harvest 400 in 160ms
 GET /api/combat/logs?username=FAME&summary=true 200 in 17ms
 GET /api/bot-scanner?username=FAME&action=status 200 in 68ms
                     ^C
PS D:\dev\DarkFrame> ^C
PS D:\dev\DarkFrame> ^C
PS D:\dev\DarkFrame> 🚶 Moving FAME from (59, 1) to (60, 1) [E]
 GET /api/tile?x=63&y=1 200 in 80ms
✅ Updated FAME position to (60, 1)
 GET /api/tile?x=63&y=1 200 in 62ms
[Server] ⚠️  Forced shutdown after timeout
                     ^C
PS D:\dev\DarkFrame> ^C
PS D:\dev\DarkFrame> 