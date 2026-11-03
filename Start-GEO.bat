@echo off
setlocal
cd /d "%~dp0"
title GEO Check Server

rem Optional override; otherwise discover Node without a machine-specific path.
if defined GEO_NODE goto node_selected
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined GEO_NODE set "GEO_NODE=%%N"
if defined GEO_NODE goto node_selected
if exist "%ProgramFiles%\nodejs\node.exe" set "GEO_NODE=%ProgramFiles%\nodejs\node.exe"
if defined GEO_NODE goto node_selected
rem Also support the existing local geo environment when Explorer has no Node PATH.
if exist "E:\CondaEnvs\geo\node.exe" set "GEO_NODE=E:\CondaEnvs\geo\node.exe"
if defined GEO_NODE goto node_selected
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "GEO_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if defined GEO_NODE goto node_selected
echo ERROR: Install Node.js 24.14+ with npm, or set GEO_NODE to node.exe's full path.
goto failed

:node_selected
if not exist "%GEO_NODE%" goto invalid_node
echo Using Node.js: "%GEO_NODE%"
for %%N in ("%GEO_NODE%") do set "GEO_NODE_DIR=%%~dpN"
set "PATH=%GEO_NODE_DIR%;%PATH%"
"%GEO_NODE%" scripts/check-runtime.mjs
if errorlevel 1 goto failed

if not exist "node_modules\typescript\bin\tsc" goto install
if not exist "node_modules\@types\node\package.json" goto install
if not exist "node_modules\playwright\cli.js" goto install
goto build

:install
echo Installing project dependencies...
if exist "%GEO_NODE_DIR%node_modules\npm\bin\npm-cli.js" goto bundled_npm
where npm.cmd >nul 2>nul
if errorlevel 1 goto missing_npm
call npm.cmd ci
if errorlevel 1 goto failed
goto build

:bundled_npm
"%GEO_NODE%" "%GEO_NODE_DIR%node_modules\npm\bin\npm-cli.js" ci
if errorlevel 1 goto failed

:build
echo Building GEO Check...
"%GEO_NODE%" scripts/clean-dist.mjs
if errorlevel 1 goto failed
"%GEO_NODE%" node_modules\typescript\bin\tsc -p config/tsconfig.server.json
if errorlevel 1 goto failed
"%GEO_NODE%" node_modules\typescript\bin\tsc -p config/tsconfig.client.json
if errorlevel 1 goto failed
"%GEO_NODE%" scripts/copy-assets.mjs
if errorlevel 1 goto failed
if /i "%~1"=="--build-only" exit /b 0

if /i "%~1"=="--check" goto check
if not exist ".env" echo NOTE: Copy .env.example to .env and configure APIFY_TOKEN before collection.
echo Starting the local test UI. Open the URL printed below.
echo Keep this window open. Press Ctrl+C to stop the server.
"%GEO_NODE%" dist/backend/server.js
if errorlevel 1 goto failed
exit /b 0

:check
"%GEO_NODE%" --test scripts/*.test.mjs
if errorlevel 1 goto failed
echo Launcher validation passed. No live Apify runs were started.
exit /b 0

:invalid_node
echo ERROR: GEO_NODE does not point to an existing executable: "%GEO_NODE%".
goto failed

:missing_npm
echo ERROR: Dependencies are missing. Install npm, then run npm ci and retry.

:failed
echo Startup or validation failed. Read the error above.
if /i "%~1"=="--check" exit /b 1
if /i "%~1"=="--build-only" exit /b 1
pause
exit /b 1
