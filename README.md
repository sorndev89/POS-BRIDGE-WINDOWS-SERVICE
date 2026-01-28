# POS Bridge Service

**Service ເຊື່ອມຕໍ່ລະບົບ POS ກັບ Printer ແລະ Hardware (Cross-Platform)**

---

## 📌 ພາບລວມ (Overview)

**POS Bridge Service** ແມ່ນ Service ທີ່ເຮັດວຽກຢູ່ເບື້ອງຫຼັງ (Background Service / Daemon) ສ້າງຂຶ້ນເພື່ອເຊື່ອມຕໍ່ລະຫວ່າງ **Web-based POS System** ແລະ **ອຸປະກອນ Hardware ໃນເຄື່ອງ** ເຊັ່ນ Printer, Cash Drawer ແລະອຸປະກອນ USB ອື່ນໆ

Service ນີ້ຖືກພັດທະນາໂດຍໃຊ້ **Node.js** ແລະ ສາມາດເຮັດວຽກໄດ້ໃນ **Windows, macOS, ແລະ Linux** ໂດຍອອກແບບມາເພື່ອແກ້ໄຂຂໍ້ຈຳກັດຂອງ Browser ທີ່ບໍ່ສາມາດເຂົ້າເຖິງ Hardware ໂດຍກົງໄດ້

Service ຈະເຮັດວຽກຕໍ່ເນື່ອງ ແລະ ເລີ່ມອັດຕະໂນມັດເມື່ອເປີດເຄື່ອງ

---

## ✨ ຄຸນສົມບັດຫຼັກ (Key Features)

- ✅ **Cross-Platform**: ຮອງຮັບ Windows, macOS, Linux
- ✅ **Run as Service / Daemon**: ເລີ່ມອັດຕະໂນມັດເມື່ອເປີດເຄື່ອງ
- ✅ **Asynchronous Printing**: ພິມຜ່ານລະບົບ Queue (Polling)
- ✅ **Local REST API**: ສັ່ງພິມໂດຍກົງຈາກ POS Web App
- ✅ **Hardware Control**: ຮອງຮັບ Cash Drawer, USB Printer
- ✅ **Sound Alerts**: ຮອງຮັບການສົ່ງສຽງແຈ້ງເຕືອນ (ເມື່ອມີລາຍການພິມໃໝ່)
- ✅ **Enterprise-ready**: ມີ Installer (.exe) ສຳລັບ Windows

---

## 🏗 ໂຄງສ້າງລະບົບ (System Architecture)

```
POS Web Application
        │
        │ HTTPS / API
        ▼
POS Backend Server (Laravel API)
        │
        │ Polling / Fetch Print Jobs
        ▼
POS Bridge Service (Local Machine)
        │
        ├── Printer (USB / Network)
        └── Cash Drawer
```

---

## ⚙️ ການຕັ້ງຄ່າ (Configuration)

POS Bridge Service ໃຊ້ໄຟລ໌ `config.json` ສຳລັບການຕັ້ງຄ່າ ໂດຍຈະຕ້ອງວາງໄວ້ໃນ Folder ດຽວກັນກັບໄຟລ໌ Service (`PosBridge.exe` ຫຼື `server.js`)

### ຕົວຢ່າງ `config.json`

```json
{
  "LARAVEL_API_URL": "https://your-pos-server.com/api",
  "POLLING_INTERVAL_MS": 10000,
  "ENABLE_ALERT_SOUND": true
}
```

### ຄຳອະທິບາຍຄ່າຕັ້ງຄ່າ

| Key                   | ຄຳອະທິບາຍ                                                    |
| --------------------- | ------------------------------------------------------------ |
| `LARAVEL_API_URL`     | URL ຂອງ POS Backend API (ຕ້ອງລະບຸ)                           |
| `POLLING_INTERVAL_MS` | ໄລຍະເວລາໃນການດຶງ Print Jobs (ms, ຕ້ອງລະບຸ)                   |
| `ENABLE_ALERT_SOUND`  | ເປີດ/ປິດ ການແຈ້ງເຕືອນດ້ວຍສຽງ (`true` / `false`)              |
| `ENABLE_POLLING`      | ເປີດ/ປິດ ໂໝດ Polling (`true` / `false`, Default: `true`)     |
| `VFD_PORT`            | Port ຂອງ Customer Display (ເຊັ່ນ: `COM3` ຫຼື `/dev/ttyUSB0`) |
| `VFD_BAUDRATE`        | ຄວາມໄວຂອງ VFD (Default: `9600`)                              |

---

## 🔄 ຮູບແບບການເຮັດວຽກ

### 1️⃣ Polling Mode (ໂໝດຫຼັກ)

Service ຈະດຶງຂໍ້ມູນ Print Jobs ຈາກ Backend API ຕາມໄລຍະເວລາທີ່ກຳນົດ:

1. ດຶງຂໍ້ມູນ PDF
2. ສັ່ງພິມໄປຍັງ Printer ທີ່ກຳນົດ
3. ອັບເດດສະຖານະການພິມກັບໄປຫາ Server

### 2️⃣ Direct API Mode

Service ເປີດ Local REST API ເພື່ອໃຫ້ POS ເອີ້ນໃຊ້ໂດຍກົງ:

- `GET /list-printers` – ດຶງລາຍຊື່ Printer
- `POST /print/pdf` – ສັ່ງພິມ PDF (Base64)
- `POST /hardware/open-drawer` – ເປີດ Cash Drawer
- `GET /play-sound?type=<sound>` – ສັ່ງຫຼິ້ນສຽງແຈ້ງເຕືອນ (ເຊັ່ນ: `alert`, `error`)

---

## 🔊 ການແຈ້ງເຕືອນດ້ວຍສຽງ (Sound Alerts)

Service ສາມາດສົ່ງສຽງແຈ້ງເຕືອນໄດ້ 2 ຮູບແບບ:

1.  **ຜ່ານ Polling**: ເມື່ອ Backend API ສົ່ງສັນຍານ `alert_sound: 1` ມາ, Service ຈະຫຼິ້ນສຽງ `alert.wav` ໂດຍອັດຕະໂນມັດ. ຄຸນສົມບັດນີ້ຈະເຮັດວຽກກໍຕໍ່ເມື່ອຕັ້ງຄ່າ `"ENABLE_ALERT_SOUND": true` ໃນ `config.json`.
2.  **ຜ່ານ Direct API**: ສາມາດສັ່ງຫຼິ້ນສຽງໂດຍກົງຜ່ານ Endpoint `GET /play-sound?type=<sound_type>`, ເຊິ່ງ `<sound_type>` ສາມາດເປັນ `alert` ຫຼື `error`.

### ໄຟລ໌ສຽງທີ່ຈຳເປັນ

ໄຟລ໌ສຽງຕ້ອງເປັນ Format `.wav` ແລະ ຕ້ອງວາງໄວ້ໃນ Folder ດຽວກັນກັບ Service (`PosBridge.exe`).

- `alert.wav`: ສຽງສຳລັບການແຈ້ງເຕືອນທົ່ວໄປ.
- `error.wav`: ສຽງສຳລັບແຈ້ງເຕືອນຂໍ້ຜິດພາດ.

---

## � ການທົດສອບ ແລະ ຕົວຢ່າງການໃຊ້ງານ (API & Examples)

### 1. ກວດສອບສະຖານະ Service

```bash
curl http://localhost:9100/list-printers
```

### 2. ສັ່ງພິມ PDF (Base64)

```bash
curl -X POST http://localhost:9100/print/pdf \
  -H "Content-Type: application/json" \
  -d '{
    "printer_name": "Rongta RP80",
    "content": "JVBERi0xLjQKJ..."
  }'
```

**\*Note**: Endpoint supports aliases: `printer_name` (or `printerName`) and `content` (or `pdfBase64`).\*

````

### 3. ເປີດລິ້ນຊັກເງິນ (Cash Drawer)

```bash
curl -X POST http://localhost:9100/hardware/open-drawer
````

### 4. ລະບົບສຽງແຈ້ງເຕືອນ (Sound Alerts)

```bash
# ສຽງແຈ້ງເຕືອນທົ່ວໄປ
curl "http://localhost:9100/play-sound?type=alert"

# ສຽງແຈ້ງເຕືອນ Error
curl "http://localhost:9100/play-sound?type=error"
```

### 5. ຈໍສະແດງຜົນລູກຄ້າ (Customer Display / VFD)

**ຂັ້ນຕອນທີ 1: ຊອກຫາ Port ຂອງຈໍ**

```bash
curl http://localhost:9100/hardware/ports
# ຜົນລັບຈະບອກ Port ເຊັ່ນ: COM3, /dev/ttyUSB0
```

**ຂັ້ນຕອນທີ 2: ຕັ້ງຄ່າໃນ config.json**

```json
{
  "VFD_PORT": "COM3",
  "VFD_BAUDRATE": 9600
}
```

**ຂັ້ນຕອນທີ 3: ສັ່ງສະແດງຂໍ້ຄວາມ**

```bash
curl -X POST http://localhost:9100/hardware/display \
  -H "Content-Type: application/json" \
  -d '{
    "line1": "Welcome to",
    "line2": "Oryx POS System"
  }'
```

**ຂັ້ນຕອນທີ 4: ສັ່ງລຶບໜ້າຈໍ**

```bash
curl -X POST http://localhost:9100/hardware/display/clear
```

---

### 6. ຈໍສະແດງຜົນລູກຄ້າ ແບບເວັບ (Web-based Customer Display)

**ຂັ້ນຕອນທີ 1: ຕັ້ງຄ່າ config.json**

```json
{
  "ENABLE_CUSTOMER_VIEW": true,
  "CUSTOMER_VIEW_URL": "http://localhost:9100/view",
  "BROWSER_PATH": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "WINDOW_POSITION": "1920,0"
}
```

**ຂັ້ນຕອນທີ 2: ການສະແດງຜົນ (Auto Launch)**

- ຖ້າຕັ້ງຄ່າ `ENABLE_CUSTOMER_VIEW: true`, ລະບົບຈະເປີດ Browser ຂຶ້ນມາເອງແບບ **Kiosk Mode (Full Screen)** ຢູ່ຈໍທີ 2 ທີ່ກຳນົດໄວ້.
- ກໍລະນີຕ້ອງການເປີດເອງ: ໃຫ້ເຂົ້າ Browser ໄປທີ່ `http://localhost:9100/view` ແລ້ວກົດ **F11** ເພື່ອໃຫ້ເຕັມຈໍ.

**ຂັ້ນຕອນທີ 3: ສົ່ງຂໍ້ມູນໄປສະແດງ**

```bash
# ອັບເດດກະຕ່າສິນຄ້າ (ພ້ອມສ່ວນຫຼຸດ)
curl -X POST http://localhost:9100/display/update-cart \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
        { "name": "Pepsi", "qty": 1, "price": 5000, "discount": 0, "subtotal": 5000 },
        { "name": "Lay", "qty": 2, "price": 10000, "discount": 1000, "subtotal": 19000 }
    ],
    "totalQty": 3,
    "totalAmount": 24000,
    "totalDiscount": 1000
  }'

# ປ່ຽນໂຄສະນາ (ຮູບດຽວ)
curl -X POST http://localhost:9100/display/ads \
  -H "Content-Type: application/json" \
  -d '{
    "type": "image",
    "url": "https://example.com/promo.jpg"
  }'

# ປ່ຽນໂຄສະນາ (ສະໄລທ໌ໂຊ)
curl -X POST http://localhost:9100/display/ads \
  -H "Content-Type: application/json" \
  -d '{
    "type": "image",
    "url": [
      "https://example.com/promo1.jpg",
      "https://example.com/promo2.jpg",
      "https://example.com/promo3.jpg"
    ],
    "duration": 5000
  }'

# ລ້າງໜ້າຈໍ
curl -X POST http://localhost:9100/display/clear
```

---

## 🚀 ການຕິດຕັ້ງ (Windows)

1. ດາວໂຫຼດ `POS_Bridge_Setup_vX.X.X.exe`
2. ຄລິກຂວາ → **Run as administrator**
3. ຕິດຕັ້ງຕາມຂັ້ນຕອນ
4. ແກ້ໄຂ `config.json` ໃຫ້ຊີ້ໄປຫາ API Server
5. Restart Service ຫຼື Restart Computer

### ການກວດສອບ Service

- ເປີດ `services.msc`
- ກວດເບິ່ງ Service: **service print pos app** → Running
- ເປີດ Browser: `http://localhost:9100/list-printers`

---

## 📦 Dependencies ຫຼັກ

- **express, cors, body-parser** – REST API Server
- **escpos, escpos-usb** – ຄວບຄຸມ Printer / Cash Drawer
- **serialport, escpos-serialport** – ຄວບຄຸມ Customer Display (VFD)
- **socket.io** – ສື່ສານ Real-time ກັບ Customer View (Web)
- **pkg** – Build executable (.exe)
- **nssm** – Windows Service Manager
- **SumatraPDF** – Silent PDF Printing (Windows)

---

## 👨‍💻 ສຳລັບນັກພັດທະນາ

```bash
git clone <repository-url>
cd <project-folder>
npm install
node server.js
```

Build executable:

Service ນີ້ໃຊ້ `pkg` ເພື່ອ Build ໄຟລ໌ Executable (.exe) ສຳລັບ Windows

ສຳລັບ Windows x64:

```bash
pkg package.json --targets node18-win-x64 --output PosBridge_x64.exe
```

ສຳລັບ Windows ARM64:

```bash
pkg package.json --targets node18-win-arm64 --output PosBridge_arm64.exe
```

ສຳລັບ Windows x86 (32-bit):

```bash
pkg package.json --targets node18-win-x86 --output PosBridge_x86.exe
```

---

## 👨‍💼 ຜູ້ພັດທະນາ

- **SornDev** – Software Development
  _Powered by SornTech Innovation Co., Ltd_
- **Facebook:** [https://www.facebook.com/SornDev](https://www.facebook.com/SornDev)
- **Phone / WhatsApp:** +856 20 2872 9723
