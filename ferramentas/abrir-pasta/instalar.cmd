@echo off
REM ============================================================
REM  SONARE CRM - Abrir pasta em um clique
REM
REM  Registra o atalho "sonare://" nesta maquina para que o botao
REM  "Abrir pasta" do CRM abra o Explorador direto na pasta certa.
REM
REM  Instala apenas para o usuario atual - NAO precisa de admin.
REM  Rode uma vez em cada computador que usa o sistema.
REM ============================================================

setlocal
set "DESTINO=%LOCALAPPDATA%\SonareCRM"
set "ORIGEM=%~dp0abrir-pasta.vbs"

echo.
echo  Instalando o atalho de pastas do SONARE CRM (versao 2)...
echo.

if not exist "%ORIGEM%" (
  echo  ERRO: arquivo abrir-pasta.vbs nao encontrado nesta pasta.
  echo  Mantenha os dois arquivos juntos e tente de novo.
  echo.
  pause
  exit /b 1
)

if not exist "%DESTINO%" mkdir "%DESTINO%"
copy /Y "%ORIGEM%" "%DESTINO%\abrir-pasta.vbs" >nul
if errorlevel 1 (
  echo  ERRO: nao foi possivel copiar o script para %DESTINO%
  echo.
  pause
  exit /b 1
)

REM Registro do protocolo no perfil do usuario
reg add "HKCU\Software\Classes\sonare" /ve /d "URL:SONARE CRM" /f >nul
reg add "HKCU\Software\Classes\sonare" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\sonare\shell\open\command" /ve ^
  /d "wscript.exe \"%DESTINO%\abrir-pasta.vbs\" \"%%1\"" /f >nul

if errorlevel 1 (
  echo  ERRO: falha ao registrar o atalho.
  echo.
  pause
  exit /b 1
)

echo  Pronto! Atalho versao 2 instalado.
echo.
echo  Agora, no cartao do projeto, o botao "Abrir pasta" abre
echo  direto o Explorador de Arquivos.
echo.
echo  Na primeira vez o navegador vai perguntar se pode abrir o
echo  aplicativo - marque "Sempre permitir" e clique em Abrir.
echo.
pause
