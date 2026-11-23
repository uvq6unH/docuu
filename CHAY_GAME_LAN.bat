@echo off
chcp 65001 > nul
title Folk Tag 3D - Server Launcher (FE + BE)
cd /d "%~dp0"

echo =============================================================================
echo               🎮  FOLK TAG 3D (ĐỒ CỨU) - KHỞI ĐỘNG CẢ FE & BE  🎮
echo =============================================================================
echo.

:: 1. Giải phóng cổng 3001 và 5173 nếu có tiến trình cũ chiếm dụng
echo [*] Kiem tra va giai phong cong mang neu bi chiem...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr LISTENING ^| findstr ":3001 :5173" 2^>nul') do (
    if not "%%a"=="0" (
        taskkill /PID %%a /T /F >nul 2>&1
    )
)

:: 2. Kiểm tra node_modules cơ bản
if not exist "packages\shared\node_modules\" (
    echo [*] Dang cai dat dependencies cho Shared...
    call npm --prefix packages/shared install
)
if not exist "backend\node_modules\" (
    echo [*] Dang cai dat dependencies cho Backend...
    call npm --prefix backend install
)
if not exist "frontend\node_modules\" (
    echo [*] Dang cai dat dependencies cho Frontend...
    call npm --prefix frontend install
)

:: 3. Kiểm tra và build packages/shared nếu chưa có
if not exist "packages\shared\dist\index.js" (
    echo [*] Dang build packages/shared...
    call npm --prefix packages/shared run build
)

:: 4. Kiểm tra và build backend/apps/server nếu chưa có
if not exist "backend\apps\server\dist\index.js" (
    echo [*] Dang build backend...
    call npm --prefix backend run build
)

:: 5. Khởi động cả FE và BE
echo [*] Dang khoi chay ca Frontend va Backend qua scripts/start-lan.mjs...
echo.
node scripts/start-lan.mjs

if %errorlevel% neq 0 (
    echo.
    echo [THONG BAO] Tien trinh da dung hoac gap su co.
    pause
)
