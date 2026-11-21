@echo off
chcp 65001 >nul
title Kich hoat tang toc GPU Microsoft Edge
cls
echo ================================================================
echo   DANG KICH HOAT TANG TOC DO HOA GPU CHO MICROSOFT EDGE...
echo ================================================================
echo.

node scripts/enable-edge-gpu.mjs

echo.
pause
