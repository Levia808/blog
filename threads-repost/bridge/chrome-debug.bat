@echo off
rem Threads 浏览器登录一键启动器 (Windows)
rem 双击运行: 启动调试 Chrome (9222) + Cookie 桥 (8788)
rem 之后在后台「平台管理 → 浏览器登录」点击按钮即可完成登录取 Cookie

setlocal
set "PROFILE_DIR=%USERPROFILE%\.threads-debug-chrome"

set "CHROME="
for %%c in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if exist %%c set "CHROME=%%~c"
)
if not defined CHROME (
  echo 未找到 Chrome/Edge, 请先安装。
  pause
  exit /b 1
)

echo 启动调试浏览器 (端口 9222)...
start "Threads 登录浏览器" "%CHROME%" --remote-debugging-port=9222 --user-data-dir="%PROFILE_DIR%" --no-first-run --no-default-browser-check "https://www.threads.com/"

timeout /t 2 /nobreak >nul

echo 启动 Cookie 桥 (端口 8788)...
start "Threads Cookie 桥" /min cmd /c "cd /d "%~dp0" && python bridge.py"

echo.
echo 已就绪: 在弹出的浏览器中登录 Threads 后, 回后台点「浏览器登录」即可。
echo 关闭此窗口不会关闭浏览器; 使用完毕后请手动关闭浏览器窗口。
pause
