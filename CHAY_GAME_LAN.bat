@echo off
chcp 65001 > nul
title Folk Tag 3D - LAN Multiplayer Server
cd /d "%~dp0"

echo ==========================================================
echo    Dang khoi dong Folk Tag 3D qua mang LAN...
echo ==========================================================

node scripts/start-lan.mjs
pause
