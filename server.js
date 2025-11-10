const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const escpos = require('escpos');
const USB = require('escpos-usb'); 
const fs = require('fs'); // ໃຊ້ສຳລັບການບັນທຶກ/ລຶບໄຟລ໌ຊົ່ວຄາວ
const path = require('path');
const { print, getPrinters } = require('pdf-to-printer'); // Library ພິມ PDF ໃໝ່

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

const PORT = 9100;
const SERVICE_NAME = 'service print pos app';

// === Endpoint 1: ດຶງລາຍຊື່ Printer ທັງໝົດ ===
app.get('/list-printers', async (req, res) => {
    console.log('Received /list-printers request.');
    try {
        // ໃຊ້ getPrinters ຂອງ pdf-to-printer ເຊິ່ງເປັນ Pure JS
        const printerList = await getPrinters();
        res.json(printerList);
    } catch (e) {
        console.error('Error listing printers:', e.message);
        res.status(500).json({ success: false, message: 'Cannot list printers (pdf-to-printer error).', error: e.message });
    }
});

// === Endpoint 2: ສັ່ງເປີດລິ້ນຊັກ ===
app.post('/hardware/open-drawer', (req, res) => {
    console.log('Received /hardware/open-drawer request.');
    try {
        const device = new USB(); 
        const escposPrinter = new escpos.Printer(device);
        
        device.open((error) => {
            if (error) {
                // ຂໍ້ຜິດພາດ USB/Permission
                return res.status(500).json({ success: false, message: 'USB Error: Cannot open device ( VID/PID error or no permissions)' });
            }
            escposPrinter.cashdraw();
            escposPrinter.close(() => {
                res.json({ success: true, message: 'Cash drawer opened successfully' });
            });
        });
    } catch (e) {
        console.error('Drawer Exception:', e.message);
        res.status(500).json({ success: false, message: 'Drawer exception: ' + e.message });
    }
});

// === Endpoint 3: ສັ່ງພິມ PDF ===
app.post('/print/pdf', async (req, res) => {
    const { pdfBase64, printerName } = req.body;
    
    if (!pdfBase64 || !printerName) {
        return res.status(400).json({ success: false, message: 'Missing PDF data or printer name.' });
    }

    // 1. ປ່ຽນ Base64 ໃຫ້ເປັນ Buffer ແລ້ວບັນທຶກເປັນໄຟລ໌ PDF ຊົ່ວຄາວ
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const tempFilePath = path.join(__dirname, `temp_${Date.now()}.pdf`);

    try {
        fs.writeFileSync(tempFilePath, pdfBuffer);

        // 2. ສົ່ງໄປພິມຜ່ານ Windows Driver
        await print(tempFilePath, {
            printer: printerName,
            // ທ່ານສາມາດເພີ່ມ copies, orientation, etc. ທີ່ນີ້
        });

        res.json({ success: true, message: 'PDF sent to printer driver successfully.' });

    } catch (e) {
        console.error('PDF Print Error:', e.message);
        res.status(500).json({ success: false, message: 'PDF printing failed: ' + e.message });
    } finally {
        // 3. ລຶບໄຟລ໌ຊົ່ວຄາວຖິ້ມ
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
});


// ເລີ່ມ Server ຫຼັກ (ຈະຖືກເປີດໂດຍ NSSM Service)
app.listen(PORT, () => {
    console.log(`[${SERVICE_NAME}] is running! Listening on http://localhost:${PORT}`);
});