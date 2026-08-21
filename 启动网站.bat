@echo off
chcp 65001 >nul
title szkids 网站服务
cd /d "%~dp0"

echo ================================================
echo   szkids.dpdns.org  本地网站服务
echo ================================================
echo.

echo [1/2] 启动本地网页服务器 (127.0.0.1:8080) ...
start "szkids-web" /min python "%~dp0serve.py"
timeout /t 2 /nobreak >nul

echo [2/2] 启动 Cloudflare 隧道 ...
echo.
echo   窗口保持打开 = 网站在线   https://szkids.dpdns.org
echo   关掉这个窗口 = 网站离线
echo.
set /p CFTOKEN=<"%USERPROFILE%\.cf_tunnel_token"
"%APPDATA%\npm\node_modules\cloudflared\bin\cloudflared.exe" tunnel --no-autoupdate run --token %CFTOKEN%

echo.
echo 隧道已退出，正在关闭网页服务器 ...
taskkill /fi "WINDOWTITLE eq szkids-web*" /f >nul 2>&1
pause
