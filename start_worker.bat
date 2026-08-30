@echo off
echo ===== OpenReply Worker Fix =====
echo.

echo Step 1: Fixing .env file...
findstr /C:"FACEBOOK_APP_ID" .env >nul 2>&1
if errorlevel 1 (
  echo FACEBOOK_APP_ID=4628128514174903>> .env
  echo [OK] Added FACEBOOK_APP_ID to .env
) else (
  echo [OK] FACEBOOK_APP_ID already in .env
)

echo.
echo Step 2: Generating Prisma client...
call npx prisma generate

echo.
echo ===== Starting Worker =====
echo.
call npm run worker
pause