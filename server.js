const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const escpos = require('escpos');
const USB = require('escpos-usb');

const app = express();

// --- ຕັ້ງຄ່າ Middleware ---
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));

const PORT = 9100;
const IS_WINDOWS = os.platform() === 'win32';

// ຟັງຊັນຊອກຫາ Path ຂອງ Folder ທີ່ໄຟລ໌ .exe ຕັ້ງຢູ່
function getExecutableDir() {
    return path.dirname(process.execPath);
}

// === 1. ຟັງຊັນດຶງລາຍຊື່ Printer (ຮັກສາຄວາມສາມາດເດີມ + Universal) ===
function getPrintersWrapper() {
    return new Promise((resolve, reject) => {
        if (IS_WINDOWS) {
            const command = 'powershell -command "Get-Printer | Select-Object Name"';
            exec(command, (error, stdout) => {
                if (error) return reject(error);
                const printers = stdout.split(/\r?\n/)
                    .map(line => line.trim())
                    .filter(line => line && line !== 'Name' && !line.startsWith('----'));
                resolve(printers);
            });
        } else {
            exec('lpstat -a', (error, stdout) => {
                if (error) return reject(error);
                const printers = stdout.split('\n').filter(Boolean).map(line => line.split(' ')[0]);
                resolve(printers);
            });
        }
    });
}

// === 2. ຟັງຊັນພິມ PDF (ໃຊ້ SumatraPDF ສໍານັບ Windows ເພື່ອຮອງຮັບ ARM64/x64) ===
function printFileWrapper(filePath, printerName) {
    return new Promise((resolve, reject) => {
        if (IS_WINDOWS) {
            // ຊອກຫາ SumatraPDF.exe ຢູ່ Folder ດຽວກັນກັບ PosBridge.exe
            const sumatraPath = path.join(getExecutableDir(), 'SumatraPDF.exe');
            
            if (!fs.existsSync(sumatraPath)) {
                return reject(new Error(`ບໍ່ພົບ SumatraPDF.exe ຢູ່ທີ່: ${sumatraPath}`));
            }

            // ສັ່ງພິມແບບ Silent ຜ່ານ SumatraPDF
            const command = `"${sumatraPath}" -print-to "${printerName}" -silent "${filePath}"`;
            exec(command, (error, stdout) => {
                if (error) return reject(error);
                resolve(stdout);
            });
        } else {
            // ສຳລັບ macOS / Linux
            const command = `lp -d "${printerName}" "${filePath}"`;
            exec(command, (error, stdout) => {
                if (error) return reject(error);
                resolve(stdout);
            });
        }
    });
}

// === API Endpoints ===

// ດຶງລາຍຊື່ Printer
app.get('/list-printers', async (req, res) => {
    try {
        const printerList = await getPrintersWrapper();
        res.json(printerList);
    } catch (e) {
        res.status(500).json({ success: false, message: 'Cannot list printers.', error: e.message });
    }
});

// ສັ່ງເປີດລິ້ນຊັກ (ຮັກສາຟັງຊັ່ນເດີມຂອງທ່ານໄວ້)
app.post('/hardware/open-drawer', (req, res) => {
    try {
        const device = new USB(); 
        const escposPrinter = new escpos.Printer(device);
        
        device.open((error) => {
            if (error) {
                return res.status(500).json({ success: false, message: 'USB Error: ' + error.message });
            }
            escposPrinter.cashdraw();
            escposPrinter.close(() => {
                res.json({ success: true, message: 'Cash drawer opened successfully' });
            });
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Drawer exception: ' + e.message });
    }
});

// ສັ່ງພິມ PDF
app.post('/print/pdf', async (req, res) => {
    const { pdfBase64, printerName } = req.body;
    
    if (!pdfBase64 || !printerName) {
        return res.status(400).json({ success: false, message: 'Missing PDF data or printer name.' });
    }

    const tempFilePath = path.join(os.tmpdir(), `pos_temp_${Date.now()}.pdf`);

    try {
        fs.writeFileSync(tempFilePath, Buffer.from(pdfBase64, 'base64'));
        await printFileWrapper(tempFilePath, printerName);

        res.json({ success: true, message: 'PDF sent to printer successfully.' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'PDF printing failed.', error: e.toString() });
    } finally {
        // ລຶບໄຟລ໌ຊົ່ວຄາວຫຼັງພິມ 15 ວິນາທີ
        setTimeout(() => {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        }, 15000);
    }
});

app.listen(PORT, () => {
    console.log(`[POS Bridge] Running on ${os.platform()} (${os.arch()})`);
    console.log(`Listening on http://localhost:${PORT}`);
});