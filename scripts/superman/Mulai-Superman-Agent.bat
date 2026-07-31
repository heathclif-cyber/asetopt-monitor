@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."

title AsetOpt — Superman Agent Lokal
echo ============================================
echo  Superman Agent Lokal (Playwright di PC ini)
echo ============================================
echo.
echo  App tetap di Railway. Captcha + form SPPn
echo  dijalankan di komputer Anda.
echo.
echo  Biarkan jendela ini TETAP TERBUKA, lalu di web:
echo    Input Pembayaran -^> Kirim ke Superman
echo.

REM --- URL API (ganti jika domain berbeda) ---
if "%ASETOPT_API_URL%"=="" set "ASETOPT_API_URL=https://monitoringpemasaran-production.up.railway.app"

REM --- Login app AsetOpt (bukan password Superman) ---
if "%ASETOPT_USER%"=="" (
  set /p ASETOPT_USER=Username app AsetOpt: 
)
if "%ASETOPT_PASSWORD%"=="" (
  set /p ASETOPT_PASSWORD=Password app AsetOpt: 
)

REM --- Credential portal Superman: utamakan api\.env ---
if exist "api\.env" (
  echo Memuat api\.env ...
)

where python >nul 2>&1
if errorlevel 1 (
  echo ERROR: python tidak ditemukan di PATH.
  echo Install Python 3.11+ lalu: pip install -r api\requirements.txt
  echo lalu: python -m playwright install chromium
  pause
  exit /b 1
)

echo.
echo API: %ASETOPT_API_URL%
echo User app: %ASETOPT_USER%
echo.

python "scripts\superman\commands\agent.py" watch --api "%ASETOPT_API_URL%" --username "%ASETOPT_USER%" --password "%ASETOPT_PASSWORD%"
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo Agent berhenti dengan kode %ERR%.
  pause
)
endlocal
exit /b %ERR%
