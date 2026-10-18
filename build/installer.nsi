Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma

!include "MUI2.nsh"

!ifndef APPDIR
  !error "Defina APPDIR"
!endif
!ifndef OUTFILE
  !error "Defina OUTFILE"
!endif
!ifndef ICON
  !error "Defina ICON"
!endif

!define APPNAME "Vireun Converter"
!define EXE "Vireun Converter.exe"
!define VERSION "1.0.0"
!define REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\VireunConverter"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Vireun Converter"
RequestExecutionLevel user
InstallDirRegKey HKCU "${REGKEY}" "InstallLocation"
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "CompanyName" "Vireun"
VIAddVersionKey "FileDescription" "Instalador do Vireun Converter"
VIAddVersionKey "FileVersion" "1.0.0.0"
VIAddVersionKey "LegalCopyright" "Uso interno da Vireun"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Vireun Converter"
!define MUI_WELCOMEPAGE_TEXT "Conversor local da agência Vireun. Os arquivos ficam neste computador e não são enviados para a internet.$\r$\n$\r$\nClique em Avançar para instalar."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o Vireun Converter"
!define MUI_FINISHPAGE_TITLE "Instalação concluída"
!define MUI_FINISHPAGE_TEXT "O Vireun Converter fica na bandeja do sistema. Use Ctrl+Alt+V ou o menu Converter com Vireun no Explorer."
!define MUI_FINISHPAGE_RUN_NOTCHECKED

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Section "Instalar"
  SetOutPath "$INSTDIR"
  File /r "${APPDIR}/*.*"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  CreateShortcut "$SMPROGRAMS\Vireun Converter.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateShortcut "$DESKTOP\Vireun Converter.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  WriteRegStr HKCU "Software\Classes\*\shell\VireunConverter" "" "Converter com Vireun"
  WriteRegStr HKCU "Software\Classes\*\shell\VireunConverter" "Icon" "$INSTDIR\${EXE},0"
  WriteRegStr HKCU "Software\Classes\*\shell\VireunConverter\command" "" '"$INSTDIR\${EXE}" --convert "%1"'
  WriteRegStr HKCU "${REGKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${REGKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${REGKEY}" "Publisher" "Vireun"
  WriteRegStr HKCU "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  DeleteRegKey HKCU "Software\Classes\*\shell\VireunConverter"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Vireun Converter"
  Delete "$SMPROGRAMS\Vireun Converter.lnk"
  Delete "$DESKTOP\Vireun Converter.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${REGKEY}"
SectionEnd
