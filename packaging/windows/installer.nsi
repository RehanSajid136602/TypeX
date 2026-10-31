; TypeX Windows NSIS 64-bit Installer Script
; Installs per-machine to C:\Program Files\TypeX
; User data is strictly stored in %LOCALAPPDATA%\TypeX

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

; Define app properties
!define PRODUCT_NAME "TypeX"
!ifndef PRODUCT_VERSION
  !define PRODUCT_VERSION "0.1"
!endif
!define PRODUCT_PUBLISHER "TypeX Team"
!define PRODUCT_WEB_SITE "https://github.com/RehanSajid136602/TypeX"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\TypeX.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define PRODUCT_UNINST_ROOT_KEY "HKLM"

; Target 64-bit Program Files
InstallDir "$PROGRAMFILES64\TypeX"
InstallDirRegKey HKLM "${PRODUCT_DIR_REGKEY}" ""

; Request admin privileges for per-machine installation
RequestExecutionLevel admin

; Installer output file
!ifndef OUTFILE
  !define OUTFILE "TypeX-Setup.exe"
!endif
OutFile "${OUTFILE}"
Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"

; Interface Configuration
!define MUI_ABORTWARNING
!define MUI_ICON "..\..\assets\icons\typex.ico"
!define MUI_UNICON "..\..\assets\icons\typex.ico"

; Pages
!insertmacro MUI_PAGE_WELCOME

; License & Terms Agreement Page
!define MUI_LICENSEPAGE_CHECKBOX
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"

; Installation Directory Selection Page
!insertmacro MUI_PAGE_DIRECTORY

; Installation Progress Page
!insertmacro MUI_PAGE_INSTFILES

; Finish Page with option to run TypeX
!define MUI_FINISHPAGE_RUN "$INSTDIR\TypeX.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch TypeX"
!insertmacro MUI_PAGE_FINISH

; Uninstaller Pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "English"

Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  SetOverwrite ifnewer

  ; App Binaries & Resources (Never user data!)
  File /r "dist_win\*.*"

  ; Create Start Menu Shortcuts
  CreateDirectory "$SMPROGRAMS\TypeX"
  CreateShortcut "$SMPROGRAMS\TypeX\TypeX.lnk" "$INSTDIR\TypeX.exe" "" "$INSTDIR\typex.ico" 0
  CreateShortcut "$SMPROGRAMS\TypeX\Uninstall TypeX.lnk" "$INSTDIR\uninst.exe"
  CreateShortcut "$DESKTOP\TypeX.lnk" "$INSTDIR\TypeX.exe" "" "$INSTDIR\typex.ico" 0

  ; Create default localappdata folder on first install if not exists
  ; Note: typex.db is created by the backend executable in %LOCALAPPDATA%\TypeX
SectionEnd

Section -Post
  WriteUninstaller "$INSTDIR\uninst.exe"
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "" "$INSTDIR\TypeX.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninst.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\typex.ico"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegDWORD ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "NoModify" 1
  WriteRegDWORD ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "NoRepair" 1
SectionEnd

Section Uninstall
  ; Check if silent uninstall (/S)
  ${If} ${Silent}
    ; Silent uninstall preserves user data in %LOCALAPPDATA%\TypeX by contract
  ${Else}
    ; Interactive uninstall - prompt user if they want to delete their data
    MessageBox MB_YESNO|MB_ICONQUESTION "Also delete your personal TypeX profile data and test history in %LOCALAPPDATA%\TypeX?" IDYES delete_data IDNO keep_data
    delete_data:
      RMDir /r "$LOCALAPPDATA\TypeX"
    keep_data:
  ${EndIf}

  ; Remove program files from Program Files (x64)
  RMDir /r "$INSTDIR"

  ; Remove shortcuts
  Delete "$SMPROGRAMS\TypeX\TypeX.lnk"
  Delete "$SMPROGRAMS\TypeX\Uninstall TypeX.lnk"
  RMDir "$SMPROGRAMS\TypeX"
  Delete "$DESKTOP\TypeX.lnk"

  ; Remove registry keys
  DeleteRegKey ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}"
  DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"
  SetAutoClose true
SectionEnd
