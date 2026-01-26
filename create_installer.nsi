; === 1. ຕັ້ງຄ່າພື້ນຖານ ===
!define APPNAME "service print pos app"
!define COMPANYNAME "SornTech Innovation"
!define APPVERSION "1.2.0" 
!define SERVICEDESC "Smart Bridge App for Vue POS. Developed by SornTech Innovation."
!define APPDIR "POSBridgeApp"

; ຊື່ໄຟລ໌ Installer
OutFile "POS_Bridge_Setup_v${APPVERSION}.exe"

; ໃຊ້ $PROGRAMFILES64 ຖ້າເປັນ 64bit, ຖ້າບໍ່ມີຈະໄປ $PROGRAMFILES (32bit) ເອງ
InstallDir "$PROGRAMFILES64\${APPDIR}"
RequestExecutionLevel admin

; === 2. ໜ້າຕ່າງ Installer ===
Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

; === 3. ພາກສ່ວນການຕິດຕັ້ງ ===
Section "Install Core Files"

  ; --- 0. ກວດສອບ ແລະ ຢຸດ Service ເກົ່າກ່ອນ (ຖ້າມີ) ---
  DetailPrint "Checking for existing service..."
  nsExec::Exec '"$INSTDIR\nssm.exe" stop "${APPNAME}"'

  SetOutPath $INSTDIR
  
  ; --- 1. ສຳເນົາໄຟລ໌ ---
  DetailPrint "Copying files..."
  File "PosBridge.exe"
  File "nssm.exe"
  File "SumatraPDF.exe"
  File "config.json"
  File "alert.wav"
  File "error.wav"

  ; --- 2. ຕັ້ງຄ່າ Windows Service ຜ່ານ NSSM ---
  DetailPrint "Configuring Windows Service..."
  
  ; ຕິດຕັ້ງ ແລະ ຕັ້ງ Path ບ່ອນເຮັດວຽກ (AppDirectory ສຳຄັນຫຼາຍເພື່ອໃຫ້ຊອກ SumatraPDF ເຫັນ)
  ExecWait '"$INSTDIR\nssm.exe" install "${APPNAME}" "$INSTDIR\PosBridge.exe"'
  ExecWait '"$INSTDIR\nssm.exe" set "${APPNAME}" AppDirectory "$INSTDIR"'
  ExecWait '"$INSTDIR\nssm.exe" set "${APPNAME}" Description "${SERVICEDESC}"'
  ExecWait '"$INSTDIR\nssm.exe" set "${APPNAME}" Start SERVICE_AUTO_START'
  
  ; ຕັ້ງຄ່າໃຫ້ Service Restart ຕົວເອງອັດຕະໂນມັດຖ້າມັນ Crash
  ExecWait '"$INSTDIR\nssm.exe" set "${APPNAME}" AppExit Default Restart'

  ; --- 3. ເປີດ Firewall Port 9100 (Option) ---
  DetailPrint "Opening Firewall Port 9100..."
  nsExec::Exec 'netsh advfirewall firewall add rule name="${APPNAME}" dir=in action=allow protocol=TCP localport=9100'

  ; --- 4. ເລີ່ມ Service ---
  DetailPrint "Starting Service..."
  ExecWait '"$INSTDIR\nssm.exe" start "${APPNAME}"'

  ; --- 5. ສ້າງ Uninstaller ---
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayVersion" "${APPVERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "Publisher" "${COMPANYNAME}"

  DetailPrint "Installation completed successfully."
SectionEnd

; === 4. ພາກສ່ວນຖອນການຕິດຕັ້ງ ===
Section "Uninstall"

  DetailPrint "Stopping and Removing Service..."
  ; 1. ຢຸດ ແລະ ລຶບ Service
  ExecWait '"$INSTDIR\nssm.exe" stop "${APPNAME}"'
  ExecWait '"$INSTDIR\nssm.exe" remove "${APPNAME}" confirm'

  ; 2. ປິດ Firewall Rule
  nsExec::Exec 'netsh advfirewall firewall delete rule name="${APPNAME}"'

  ; 3. ລຶບໄຟລ໌
  DetailPrint "Deleting files..."
  Delete "$INSTDIR\PosBridge.exe"
  Delete "$INSTDIR\nssm.exe"
  Delete "$INSTDIR\SumatraPDF.exe"
  Delete "$INSTDIR\config.json" ; Ensure config.json is also deleted
  Delete "$INSTDIR\alert.wav"
  Delete "$INSTDIR\error.wav"
  Delete "$INSTDIR\uninstall.exe"
  
  ; ລຶບ Folder ຫຼັກ (RMDir ຈະລຶບໄດ້ກໍຕໍ່ເມື່ອ Folder ວ່າງ)
  RMDir "$INSTDIR"

  ; ລຶບ Registry
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"

  DetailPrint "Uninstallation completed."
SectionEnd