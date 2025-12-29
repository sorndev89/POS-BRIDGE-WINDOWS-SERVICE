# POS Bridge Service

**Service ເຊື່ອມຕໍ່ລະບົບ POS ກັບ Printer ແລະ Hardware (Cross-Platform)**

---

## 📌 ພາບລວມ (Overview)

**POS Bridge Service** ແມ່ນ Service ທີ່ເຮັດວຽກຢູ່ເບື້ອງຫຼັງ (Background Service / Daemon) ສ້າງຂຶ້ນເພື່ອເຊື່ອມຕໍ່ລະຫວ່າງ **Web-based POS System** ແລະ **ອຸປະກອນ Hardware ໃນເຄື່ອງ** ເຊັ່ນ Printer, Cash Drawer ແລະອຸປະກອນ USB ອື່ນໆ

Service ນີ້ຖືກພັດທະນາໂດຍໃຊ້ **Node.js** ແລະ ສາມາດເຮັດວຽກໄດ້ໃນ **Windows, macOS, ແລະ Linux** ໂດຍອອກແບບມາເພື່ອແກ້ໄຂຂໍ້ຈຳກັດຂອງ Browser ທີ່ບໍ່ສາມາດເຂົ້າເຖິງ Hardware ໂດຍກົງໄດ້

Service ຈະເຮັດວຽກຕໍ່ເນື່ອງ ແລະ ເລີ່ມອັດຕະໂນມັດເມື່ອເປີດເຄື່ອງ

---

## ✨ ຄຸນສົມບັດຫຼັກ (Key Features)

* ✅ **Cross-Platform**: ຮອງຮັບ Windows, macOS, Linux
* ✅ **Run as Service / Daemon**: ເລີ່ມອັດຕະໂນມັດເມື່ອເປີດເຄື່ອງ
* ✅ **Asynchronous Printing**: ພິມຜ່ານລະບົບ Queue (Polling)
* ✅ **Local REST API**: ສັ່ງພິມໂດຍກົງຈາກ POS Web App
* ✅ **Hardware Control**: ຮອງຮັບ Cash Drawer, USB Printer
* ✅ **Enterprise-ready**: ມີ Installer (.exe) ສຳລັບ Windows

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
  "POLLING_INTERVAL_MS": 10000
}
```

### ຄຳອະທິບາຍຄ່າຕັ້ງຄ່າ

| Key                   | ຄຳອະທິບາຍ                        |
| --------------------- | -------------------------------- |
| `LARAVEL_API_URL`     | URL ຂອງ POS Backend API          |
| `POLLING_INTERVAL_MS` | ໄລຍະເວລາໃນການດຶງ Print Jobs (ms) |

---

## 🔄 ຮູບແບບການເຮັດວຽກ

### 1️⃣ Polling Mode (ໂໝດຫຼັກ)

Service ຈະດຶງຂໍ້ມູນ Print Jobs ຈາກ Backend API ຕາມໄລຍະເວລາທີ່ກຳນົດ:

1. ດຶງຂໍ້ມູນ PDF
2. ສັ່ງພິມໄປຍັງ Printer ທີ່ກຳນົດ
3. ອັບເດດສະຖານະການພິມກັບໄປຫາ Server

### 2️⃣ Direct API Mode

Service ເປີດ Local REST API ເພື່ອໃຫ້ POS ເອີ້ນໃຊ້ໂດຍກົງ:

* `GET /list-printers` – ດຶງລາຍຊື່ Printer
* `POST /print/pdf` – ສັ່ງພິມ PDF (Base64)
* `POST /hardware/open-drawer` – ເປີດ Cash Drawer

---

## 🚀 ການຕິດຕັ້ງ (Windows)

1. ດາວໂຫຼດ `POS_Bridge_Setup_vX.X.X.exe`
2. ຄລິກຂວາ → **Run as administrator**
3. ຕິດຕັ້ງຕາມຂັ້ນຕອນ
4. ແກ້ໄຂ `config.json` ໃຫ້ຊີ້ໄປຫາ API Server
5. Restart Service ຫຼື Restart Computer

### ການກວດສອບ Service

* ເປີດ `services.msc`
* ກວດເບິ່ງ Service: **service print pos app** → Running
* ເປີດ Browser: `http://localhost:9100/list-printers`

---

## 📦 Dependencies ຫຼັກ

* **express, cors, body-parser** – REST API Server
* **escpos, escpos-usb** – ຄວບຄຸມ Printer / Cash Drawer
* **pkg** – Build executable (.exe)
* **nssm** – Windows Service Manager
* **SumatraPDF** – Silent PDF Printing (Windows)

---

## 👨‍💻 ສຳລັບນັກພັດທະນາ

```bash
git clone <repository-url>
cd <project-folder>
npm install
node server.js
```

Build executable:

```bash
npm run build
```

---

## 👨‍💼 ຜູ້ພັດທະນາ

* **SornDev** – Software Development
  *Powered by SornTech Innovation Co., Ltd*
* **Facebook:** [https://www.facebook.com/SornDev](https://www.facebook.com/SornDev)
* **Phone / WhatsApp:** +856 20 2872 9723
