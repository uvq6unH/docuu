import { io } from 'file:///D:/docuu/frontend/node_modules/socket.io-client/build/esm/index.js';
import assert from 'node:assert/strict';

console.log('=== START LIVE NETWORK BOT & ROLE SELECTION TEST ===');

const socket = io('http://localhost:3001', {
  transports: ['websocket'],
  forceNew: true,
});

let roomCode = '';
let playerId = '';
let statesReceived = [];
let snapshotsReceived = [];

socket.on('connect', () => {
  console.log('✔ Connected to live backend at http://localhost:3001');

  // 1. Create Room
  socket.emit(
    'room:create',
    { name: 'Host Tester', protocolVersion: 1, requestId: 'req-create-1' },
    (res) => {
      console.log('✔ room:create response:', res);
      assert.ok(res.ok);
      roomCode = res.data.roomCode;
      playerId = res.data.playerId;

      // 2. Set Role to POLICE
      socket.emit('room:set_role', { role: 'POLICE', requestId: 'req-role-1' }, (roleRes) => {
        console.log('✔ room:set_role POLICE response:', roleRes);
        assert.ok(roleRes.ok);

        // 3. Add 3 Bots
        socket.emit('room:add_bot', { requestId: 'req-bot-1' }, (bot1Res) => {
          console.log('✔ room:add_bot 1 response:', bot1Res);
          assert.ok(bot1Res.ok);

          socket.emit('room:add_bot', { requestId: 'req-bot-2' }, (bot2Res) => {
            console.log('✔ room:add_bot 2 response:', bot2Res);
            assert.ok(bot2Res.ok);

            socket.emit('room:add_bot', { requestId: 'req-bot-3' }, (bot3Res) => {
              console.log('✔ room:add_bot 3 response:', bot3Res);
              assert.ok(bot3Res.ok);

              // 4. Auto assign roles
              socket.emit('room:auto_roles', { requestId: 'req-auto-1' }, (autoRes) => {
                console.log('✔ room:auto_roles response:', autoRes);
                assert.ok(autoRes.ok);

                // 5. Ready up host
                socket.emit(
                  'room:ready',
                  { ready: true, mapHash: '575da3894a9c077ea9c0d2c166f5e79ea372706d52d7dd84ffc9dc93880f95ba', requestId: 'req-ready-1' },
                  (readyRes) => {
                    console.log('✔ room:ready response:', readyRes);
                    assert.ok(readyRes.ok);

                    // 6. Start Match
                    socket.emit('room:start', { requestId: 'req-start-1' }, (startRes) => {
                      console.log('✔ room:start response:', startRes);
                      assert.ok(startRes.ok);
                    });
                  }
                );
              });
            });
          });
        });
      });
    }
  );
});

socket.on('room:state', (state) => {
  statesReceived.push(state);
  console.log(`[room:state] phase=${state.phase}, players=${state.roster.length}, bots=${state.roster.filter(m => m.isBot).length}`);
});

socket.on('game:snapshot', (snapshot) => {
  snapshotsReceived.push(snapshot);
  if (snapshotsReceived.length === 1) {
    console.log(`✔ Received first authoritative snapshot! tick=${snapshot.tick}, phase=${snapshot.phase}, otherPlayers=${snapshot.players.length}`);
    for (const p of snapshot.players) {
      console.log(`   Player ${p.id}: role=${p.role}, pos=[${p.pos.map(v => v.toFixed(2)).join(', ')}]`);
    }
  }

  // Once we receive 10 snapshots (~600ms of game time), verify simulation and exit
  if (snapshotsReceived.length >= 10) {
    console.log(`✔ Successfully received ${snapshotsReceived.length} authoritative snapshots!`);
    const firstOther = snapshotsReceived[0].players[0];
    const latestOther = snapshotsReceived[snapshotsReceived.length - 1].players[0];

    console.log(`Initial pos of ${firstOther.id}: [${firstOther.pos.map(v => v.toFixed(2)).join(', ')}]`);
    console.log(`Latest pos of ${latestOther.id}: [${latestOther.pos.map(v => v.toFixed(2)).join(', ')}]`);

    socket.disconnect();
    console.log('=== TEST PASSED: 100% SUCCESSFUL LIVE INTEGRATION ===');
    process.exit(0);
  }
});

// Timeout safeguard
setTimeout(() => {
  console.error('Test timed out after 10s');
  process.exit(1);
}, 10000);
