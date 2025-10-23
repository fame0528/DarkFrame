# DarkFrame - Issues & Technical Debt

> Bugs, blockers, and technical debt tracking

---

## 🐛 Active Issues

_No active issues at this time_

---

## ✅ Resolved Issues

### [RESOLVED] Edge Runtime Middleware Compatibility (FID-20251017-005)
**Date:** 2025-10-17  
**Severity:** 🔴 Critical - Server startup failure  

**Problem:**
- Next.js middleware crashed on startup with `Cannot read properties of undefined (reading 'modules')`
- Error caused by `jsonwebtoken` library importing native Node.js modules (bcrypt via node-gyp-build)
- Edge Runtime does not support native modules, only pure JavaScript
- Blocked all authentication and access to protected `/game` route

**Root Cause:**
- `lib/authMiddleware.ts` used `jsonwebtoken` for JWT verification
- `jsonwebtoken` has transitive dependency on `node-gyp-build` which requires native modules
- Next.js middleware runs in Edge Runtime by default (lightweight, no Node.js internals)

**Solution:**
- Migrated `lib/authMiddleware.ts` from `jsonwebtoken` to `jose` library
- `jose` is pure JavaScript, built specifically for Edge Runtime and Web Crypto API
- Updated `verifyToken()` function from synchronous to async (jose requirement)
- Kept `lib/authService.ts` unchanged (API routes use Node.js runtime)

**Files Changed:**
- `lib/authMiddleware.ts` - Replaced jsonwebtoken with jose
- `package.json` - Added jose dependency

**Testing:**
- ✅ Server starts without Edge Runtime errors
- ✅ No compilation errors in TypeScript
- ✅ Middleware compiles successfully
- ✅ Ready for end-to-end authentication testing

**Lessons Learned:**
- Always use Edge Runtime-compatible libraries for Next.js middleware
- `jose` is the recommended JWT library for Edge environments
- Native Node.js modules (bcrypt, crypto, fs) cannot be used in middleware
- API routes run in Node.js runtime and can use any library

---

## ⚠️ Known Limitations

### Phase 1 Constraints
- No authentication system (username-only registration)
- No session management (localStorage only)
- Manual testing only (no automated tests)
- Basic error handling (to be enhanced)

---

## 🔧 Technical Debt

_No technical debt tracked yet_

---

## 💡 Future Improvements

- Add proper authentication (JWT tokens)
- Implement comprehensive error handling
- Add input validation middleware
- Set up automated testing
- Add rate limiting to API routes
- Implement caching for tile data

---

**Last Updated:** 2025-10-16 01:35
