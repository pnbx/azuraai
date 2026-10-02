@echo off
REM Local Android build (JDK 21 + Aliyun mirrors, see android/build.gradle).
REM
REM `cap sync` is mandatory before assembleDebug: it regenerates
REM android/app/src/main/assets/capacitor.config.json, which is NOT tracked by
REM git. Without it a stale copy silently ships — that file previously still
REM pointed the WebView at www.azuraai.ir/app, so the APK 404'd in production
REM while every local check looked green.
setlocal
cd /d E:\Azura

if not "%AZURA_WEBVIEW_DEBUG%"=="" (
  echo [build] WebView debugging ON
) else (
  echo [build] WebView debugging OFF ^(set AZURA_WEBVIEW_DEBUG=1 to enable^)
)

call npx cap sync android || exit /b 1

cd /d E:\Azura\android
set JAVA_HOME=E:\Dev\jdk-21.0.12.1+1
call .\gradlew.bat assembleDebug %*