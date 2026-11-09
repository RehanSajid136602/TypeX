!macro customInstall
  CreateDirectory "$SMPROGRAMS\TypeX"
  CreateShortCut "$SMPROGRAMS\TypeX\TypeX Stage Host.lnk" "$INSTDIR\TypeX.exe" "--stage-host" "$INSTDIR\TypeX.exe" 0
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\TypeX\TypeX Stage Host.lnk"
  RMDir "$SMPROGRAMS\TypeX"
!macroend
