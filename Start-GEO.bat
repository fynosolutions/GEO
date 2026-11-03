@echo off
setlocal
cd /d "%~dp0"
title GEO Check Server

rem Use an explicit runtime; no conda activation or machine PATH edits required.
if not defined GEO_NODE set "GEO_NODE=E:\CondaEnvs\geo\node.exe"
if not exist "%GEO_NODE%" goto missing_node
for %%I in ("%GEO_NODE%") do set "GEO_NODE_DIR=%%~dpI"
set "PATH=%GEO_NODE_DIR%;%PATH%"

echo [GEO Check] Using Node.js:
echo %GEO_NODE%
"%GEO_NODE%" scripts/check-runtime.mjs
if errorlevel 1 goto old_node

if not exist "node_modules\typescript\bin\tsc" goto install
if not exist "node_modules\@types\node\package.json" goto install
if not exist "node_modules\playwright\package.json" goto install
goto build

:install
echo Installing project dependencies...
if not exist "%GEO_NODE_DIR%node_modules\npm\bin\npm-cli.js" goto missing_npm
"%GEO_NODE%" "%GEO_NODE_DIR%node_modules\npm\bin\npm-cli.js" ci
if errorlevel 1 goto failed

:build
echo Building server and results page...
"%GEO_NODE%" "node_modules\typescript\bin\tsc" -p config/tsconfig.server.json
if errorlevel 1 goto failed
"%GEO_NODE%" "node_modules\typescript\bin\tsc" -p config/tsconfig.client.json
if errorlevel 1 goto failed
"%GEO_NODE%" scripts/copy-assets.mjs
if errorlevel 1 goto failed

if /i "%~1"=="--check" goto check
if not exist ".env" echo NOTE: No .env file found. Configure OPENAI_API_KEY before submitting an audit.
echo.
echo Starting server. Open the URL printed below in your browser.
echo Keep this window open. Press Ctrl+C to stop the server.
echo.
"%GEO_NODE%" dist/backend/server.js
if errorlevel 1 goto failed
exit /b 0

:check
"%GEO_NODE%" --test scripts/audit.test.mjs
if errorlevel 1 goto failed
echo Launcher validation passed. No live API calls were made.
exit /b 0

:missing_node
echo ERROR: Node.js was not found at "%GEO_NODE%".
echo Install Node.js 24.14+ or set GEO_NODE to its full executable path.
goto failed

:old_node
echo ERROR: Node.js 24.14 or newer is required.
goto failed

:missing_npm
echo ERROR: Dependencies are missing and npm-cli.js was not found beside Node.js.
echo Install npm in the Node.js environment, then run this file again.
goto failed

:failed
echo.
echo Startup or validation failed. Read the error above.
echo If the port is in use, stop the other server before restarting.
if /i not "%~1"=="--check" pause
exit /b 1
