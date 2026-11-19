# Instructions for coding agents (Codex/AI)

Read README and docs/GAMEPLAY.md, docs/ARCHITECTURE.md, docs/NETWORK_PROTOCOL.md, docs/MAP_AND_ASSETS.md before editing; if files still at repository root use same names there. Consult BACKLOG and TESTING. The documents describe intended MVP, not an existing implementation.

- Implement one ticket at a time, ask before expanding scope or changing shared gameplay/network contracts. Preserve user changes. Do not silently replace Three.js with Unity or add a framework/database.
- Use TypeScript strict, shared pure simulation used by both server/client; only server owns game state. Never trust client coords, elapsed time, target, role, winner. Never expose hidden enemies outside defined range. Do not provide test bypass in production.
- Maintain 2 police/4 robbers, 80×80, 5min, head start, captain jail selection, 2s rescue/3s immunity, max one guard. All configurable numeric tunables in shared rules; tests cover boundary cases. If docs conflict, stop and propose correction.
- Keep assets visual-only; authoritative static colliders from shared map JSON. Do not modify built binary model files without request, use Blender source and GLB pipeline. Record license. Do not use copyrighted assets without permission.
- No account/shop/DB/ranking/mobile until MVP gate. Do not create an external repo, deploy, send messages or mutate remote resources without user request.
- Before change inspect current repo and existing scripts. Add test, run available typecheck/lint/test/build, report actual outputs or blockers. Avoid unrelated refactors. Do not fabricate successful verification.

## Suggested first prompt for A

Implement ticket F01 only: scaffold npm workspaces apps/client, apps/server, packages/shared with TypeScript strict and root scripts dev/lint/typecheck/test/build. Vite + Three.js, Node + Express/Socket.IO, test runner. Commit no secrets, include .env.example and CI. Inspect existing files first, preserve user work, describe actual commands run. Do not implement gameplay yet.

## Suggested first prompt for B

Implement F04/F05 after F01: Three.js WebGL canvas, ground 80×80, simple lights, FPS camera and pointer lock, WASD/input abstraction with mouse yaw/pitch, resize and blur cleanup. Keep movement placeholder until shared movement available. Provide debug scene and no asset downloads. Use protocol and map docs, do not edit server or shared types without agreement. Test browser and report actual results.
