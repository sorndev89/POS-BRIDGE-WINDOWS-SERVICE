; === 1. ຕັ້ງຄ່າພື້ນຖານ ===
!define APPNAME "service print pos app"
!define COMPANYNAME "Your Company Name"
!define APPVERSION "1.0.4" 
!define APPDIR "POSBridgeApp"

; ຊື່ໄຟລ໌ Installer ທີ່ຈະໄດ້
OutFile "POS_Bridge_Setup_v${APPVERSION}.exe"
InstallDir "$PROGRAMFILES64\${APPDIR}"
RequestExecutionLevel admin

; === 2. ໜ້າຕ່າງ Installer ===
Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

; === 3. ພາກສ່ວນການຕິດຕັ້ງ (Install Section) ===
Section "Install Core Files"

  SetDetailsPrint textonly
  DetailPrint "ກຳລັງຕິດຕັ້ງ ${APPNAME}..."

  ; ຕັ້ງຄ່າບ່ອນສຳເນົາໄຟລ໌
  SetOutPath $INSTDIR
  
  ; ສຳເນົາ PosBridge.exe ແລະ nssm.exe
  DetailPrint "ສຳເນົາໄຟລ໌..."
  File "PosBridge.exe"
  File "nssm.exe"

  ; === ສ່ວນທີ່ສຳຄັນທີ່ສຸດ: ໃຊ້ NSSM ສ້າງ Windows Service ===
  DetailPrint "ສ້າງ Windows Service..."
  
  ; 1. ຕັ້ງຄ່າ Service (ໂດຍ NSSM)
  ExecWait '"$INSTDIR\nssm.exe" install "${APPNAME}" "$INSTDIR\PosBridge.exe"'

  ; 2. ຕັ້ງຄ່າ Startup/Working Directory (ສຳຄັນ)
  ExecWait '"$INSTDIR\nssm.exe" set "${APPNAME}" AppDirectory "$INSTDIR"'
  
  ; 3. ຕັ້ງຄ່າ Service ໃຫ້ເປັນ Automatic
  ExecWait '"$INSTDIR\nssm.exe" set "${APPNAME}" Start SERVICE_AUTO_START'
  
  ; 4. ເລີ່ມ Service ທັນທີ
  DetailPrint "ເລີ່ມ Service..."
  ExecWait '"$INSTDIR\nssm.exe" start "${APPNAME}"'

  ; === ສ້າງ Uninstaller ===
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  
  DetailPrint "ຕິດຕັ້ງສຳເລັດ."

SectionEnd

; === 4. ພາກສ່ວນຖອນການຕິດຕັ້ງ (Uninstall Section) ===
Section "Uninstall"

  DetailPrint "ຖອນການຕິດຕັ້ງ Service..."

  ; 1. ຢຸດ Service
  ExecWait '"$INSTDIR\nssm.exe" stop "${APPNAME}"'
  
  ; 2. ລົບ Service ໂດຍ NSSM
  ExecWait '"$INSTDIR\nssm.exe" remove "${APPNAME}" confirm'

  ; 3. ລົບ Registry
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"

  ; 4. ລົບໄຟລ໌
  DetailPrint "ລຶບໄຟລ໌..."
  Delete "$INSTDIR\PosBridge.exe"
  Delete "$INSTDIR\nssm.exe"
  Delete "$INSTDIR\uninstall.exe"
  
  ; 5. ລົບ Folder ຫຼັກ
  RMDir "$INSTDIR"

  DetailPrint "ຖອນການຕິດຕັ້ງສຳເລັດ."

SectionEnd