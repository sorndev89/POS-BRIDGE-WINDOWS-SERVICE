const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const escpos = require('escpos');
const USB = require('escpos-usb');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const app = express();
app.use(cors({
    origin: ['http://127.0.0.1:8000', 'http://localhost:8000'], // Allow specific origins
    credentials: true // Allow cookies/authorization headers to be sent
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

const PORT = 9100;
const SERVICE_NAME = 'service print pos app';
const IS_WINDOWS = os.platform() === 'win32';

// --- Wrapper Functions for Cross-Platform Printing ---

function getPrintersWrapper() {
  return new Promise((resolve, reject) => {
    if (IS_WINDOWS) {
      // For Windows, use PowerShell to get printer names
      const command = 'powershell -command "Get-Printer | Select-Object Name | Format-List"';
      exec(command, (error, stdout, stderr) => {
        if (error) {
          return reject(error);
        }
        if (stderr) {
          // PowerShell might write warnings to stderr, ignore for now unless it's a real issue
          console.warn('Powershell stderr:', stderr);
        }
        const printers = stdout.split('\n')
          .filter(line => line.includes('Name'))
          .map(line => line.split(':')[1].trim())
          .filter(name => name.length > 0);
        resolve(printers);
      });
    } else {
      // For macOS/Linux, use lpstat
      const command = 'lpstat -a';
      exec(command, (error, stdout, stderr) => {
        if (error) {
          return reject(error);
        }
        const printers = stdout.split('\n')
          .filter(line => line.length > 0)
          .map(line => line.split(' ')[0]);
        resolve(printers);
      });
    }
  });
}

function printFileWrapper(filePath, printerName) {
  return new Promise((resolve, reject) => {
    // Sanitize inputs to prevent command injection
    const safeFilePath = `"${filePath}"`;
    const safePrinterName = `"${printerName}"`;

    let command;
    if (IS_WINDOWS) {
      // Use PowerShell's PrintTo verb. Important to use single quotes around paths for PS.
      const psFilePath = filePath.replace(/'/g, "''");
      const psPrinterName = printerName.replace(/'/g, "''");
      command = `powershell -command "Start-Process -FilePath '${psFilePath}' -Verb PrintTo -ArgumentList '${psPrinterName}' -PassThru | Wait-Process"`;
    } else {
      // Use lp for macOS/Linux
      command = `lp -d ${safePrinterName} ${safeFilePath}`;
    }

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Exec error for command "${command}":`, error);
        return reject(error);
      }
      if (stderr) {
        console.warn(`Stderr for command "${command}":`, stderr);
      }
      resolve(stdout);
    });
  });
}

// === Endpoint 1: ດຶງລາຍຊື່ Printer ທັງໝົດ ===
app.get('/list-printers', async (req, res) => {
    console.log(`Received /list-printers request on ${os.platform()}.`);
    try {
        const printerList = await getPrintersWrapper();
        res.json(printerList);
    } catch (e) {
        console.error('Error listing printers:', e);
        res.status(500).json({ success: false, message: 'Cannot list printers.', error: e.message });
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
                return res.status(500).json({ success: false, message: 'USB Error: Cannot open device (VID/PID error or permissions)', error: error.message });
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

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const tempFilePath = path.join(__dirname, `temp_${Date.now()}.pdf`);

    try {
        fs.writeFileSync(tempFilePath, pdfBuffer);

        console.log(`Printing on ${os.platform()} to printer: ${printerName}`);
        await printFileWrapper(tempFilePath, printerName);

        res.json({ success: true, message: 'PDF sent to printer successfully.' });

    } catch (e) {
        console.error('PDF Print Error:', e);
        res.status(500).json({ success: false, message: 'PDF printing failed.', error: e.toString() });
    } finally {
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
});

// ເລີ່ມ Server ຫຼັກ
app.listen(PORT, () => {
    console.log(`[${SERVICE_NAME}] is running on ${os.platform()}! Listening on http://localhost:${PORT}`);
});
