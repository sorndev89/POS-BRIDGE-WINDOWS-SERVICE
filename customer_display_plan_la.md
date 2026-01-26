# ແຜນການພັດທະນາ - ລະບົບສະແດງຜົນລູກຄ້າອັດຕະໂນມັດ (Automatic Customer Display)

ເປົ້າໝາຍແມ່ນເພື່ອໃຫ້ໜ້າຈໍສະແດງຜົນລູກຄ້າ ເປີດຂຶ້ນມາເອງຢູ່ຈໍທີ 2 ແບບເຕັມຈໍ (Full Screen) ໂດຍອັດຕະໂນມັດ ໂດຍທີ່ບໍ່ຕ້ອງໃຫ້ຜູ້ໃຊ້ກົດເອງ.

## ການວິເຄາະ (Analysis)

ເພື່ອໃຫ້ໄດ້ຟັງຊັ່ນ "ເປີດອັດຕະໂນມັດ" ແລະ "ເຕັມຈໍ" ໂດຍບໍ່ຕ້ອງກົດ F11, ເຮົາຈະໃຊ້ຄວາມສາມາດ **Kiosk Mode** ຂອງ Browser (Chrome/Edge).
ພວກເຮົາຈະຂຽນຄຳສັ່ງໃນ Node.js ເພື່ອສັ່ງເປີດ Browser ພ້ອມກັບການຕັ້ງຄ່າພິເສດດັ່ງນີ້:

- `--app=URL`: ເປີດແບບ "App Mode" (ບໍ່ມີແຖບ Address/Toolbars).
- `--kiosk`: ບັງຄັບໃຫ້ເປັນ Full Screen.
- `--window-position=X,Y`: ກຳນົດໃຫ້ໄປເປີດຢູ່ຈໍທີ 2 (ໂດຍການລະບຸພິກັດ X).
- `--user-data-dir=...`: ແຍກ Profile ຕ່າງຫາກ ເພື່ອບໍ່ໃຫ້ໄປລົບກວນ Browser ຫຼັກທີ່ຜູ້ໃຊ້ເປີດຢູ່.

## ສິ່ງທີ່ຜູ້ໃຊ້ຕ້ອງກວດສອບ (User Review Required)

> [!NOTE]
> ວິທີນີ້ຈຳເປັນຕ້ອງມີ **Google Chrome** ຫຼື **Microsoft Edge** ຕິດຕັ້ງຢູ່ໃນເຄື່ອງ.
> ຜູ້ໃຊ້ຕ້ອງໄດ້ຕັ້ງຄ່າ **X coordinate** ຂອງຈໍທີ 2 ເອງ (ຕົວຢ່າງ: ຖ້າຈໍຫຼັກກວ້າງ 1920px, ຈໍທີ 2 ມັກຈະເລີ່ມຕົ້ນທີ່ x=1920).

## ການປ່ຽນແປງທີ່ສະເໜີ (Proposed Changes)

### ການຕັ້ງຄ່າ (Configuration)

#### [MODIFY] [config.json](file:///Users/macpro/Developer/Laravel+Vue/OryxSystem/OryxPOS/POS_BRIDGE_ROOTV2/config.json)

- `ENABLE_CUSTOMER_VIEW`: boolean (ເປີດ/ປິດ ຟັງຊັ່ນນີ້)
- `CUSTOMER_VIEW_URL`: "http://localhost:9100/view" (URL ຂອງໜ້າຈໍລູກຄ້າ)
- `BROWSER_PATH`: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (ທີ່ຢູ່ຂອງ file browser)
- `WINDOW_POSITION`: "1920,0" (ຕຳແໜ່ງທີ່ຕ້ອງການໃຫ້ເປີດ x,y)

### ລະບົບ Server (Server Logic)

#### [MODIFY] [server.js](file:///Users/macpro/Developer/Laravel+Vue/OryxSystem/OryxPOS/POS_BRIDGE_ROOTV2/server.js)

1.  **Serve Static Files**: ຕັ້ງຄ່າ Express ໃຫ້ເປີດ Folder `/view` ສຳລັບເກັບໄຟລ໌ HTML.
2.  **API Endpoints ໃໝ່**:
    - `/display/update-cart`: ຮັບຂໍ້ມູນກະຕ່າສິນຄ້າ.
    - `/display/ads`: ຮັບ URL ຂອງຮູບ ຫຼື ວິດີໂອໂຄສະນາ (ເຊັ່ນ: `{ "type": "image", "url": "https://..." }`).
3.  **Auto-Launch Logic**:
    - ເມື່ອ Server ເລີ່ມເຮັດວຽກ, ກວດສອບຄ່າ `ENABLE_CUSTOMER_VIEW`.
    - ຖ້າເປີດຢູ່, ໃຫ້ Run ຄຳສັ່ງ `exec` ເພື່ອເປີດ Browser ຕາມການຕັ້ງຄ່າ.
4.  **WebSocket**: ຕິດຕັ້ງ `socket.io` ສຳລັບສົ່ງຂໍ້ມູນແບບ Real-time.

## ແຜນການກວດສອບ (Verification Plan)

1.  Start server -> ກວດສອບວ່າ Chrome ເປີດຂຶ້ນມາເອງຢູ່ຈໍທີ 2 ຫຼືບໍ່.
2.  Close server -> (ທາງເລືອກ) ພະຍາຍາມສັ່ງປິດ Browser ພ້ອມກັນ (ອາດຈະຊັບຊ້ອນ, ແຕ່ເບື້ອງຕົ້ນເອົາແຕ່ເປີດກ່ອນ).
