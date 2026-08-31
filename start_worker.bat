@echo off
echo ===== OpenReply DM Worker (PM2) =====
echo.

echo Step 1: Generating Prisma client...
call npx prisma generate

echo.
echo Step 2: Checking if worker is already running...
call pm2 show openreply-worker >nul 2>&1
if %errorlevel% equ 0 (
  echo [OK] Worker is already running. Restarting...
  call pm2 restart openreply-worker
) else (
  echo [OK] Starting worker via PM2...
  call pm2 start ecosystem.config.js
)

echo.
echo ===== Worker started =====
echo.
pm2 list
echo.
echo The worker will run in the background. Close this window.
pause