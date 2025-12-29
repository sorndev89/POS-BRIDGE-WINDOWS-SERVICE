const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const escpos = require('escpos');
const USB = require('escpos-usb');
const axios = require('axios'); // For communicating with Laravel Backend

const app = express();

// --- ຕັ້ງຄ່າ Middleware ---
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));

const APP_PORT = 9100;
const IS_WINDOWS = os.platform() === 'win32';

// ຟັງຊັນຊອກຫາ Path ຂອງ Folder ທີ່ໄຟລ໌ .exe ຕັ້ງຢູ່
function getAppRootPath() {
    if (process.pkg) {
        // Running as a packaged executable (e.g., PosBridge.exe)
        return path.dirname(process.execPath);
    } else {
        // Running in development mode (e.g., node server.js)
        // __dirname points to the directory of the current script file
        return __dirname;
    }
}

// NEW: Load configuration from config.json
let config = {};
const configFilePath = path.join(getAppRootPath(), 'config.json');

try {
    const configFileContent = fs.readFileSync(configFilePath, 'utf8');
    config = JSON.parse(configFileContent);
    console.log(`[POS Bridge] Loaded configuration from ${configFilePath}`);
} catch (error) {
    console.warn(`[POS Bridge] Could not read or parse config.json at ${configFilePath}. Using default/environment variables. Error: ${error.message}`);
}

// Configuration for Laravel API Polling
// Precedence: config.json > environment variable > hardcoded default
const LARAVEL_API_URL = config.LARAVEL_API_URL ;
const POLLING_INTERVAL = parseInt(config.POLLING_INTERVAL_MS);
let isProcessingJobs = false; // Flag to prevent concurrent job processing

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
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    console.error(`stderr: ${stderr}`);
                    return reject(new Error(`Command failed with error: ${error.message}. Stderr: ${stderr}`));
                }
                if (stderr) {
                    console.warn(`Command had stderr output: ${stderr}`);
                }
                resolve(stdout);
            });
        } else {
            // ສຳລັບ macOS / Linux
            const command = `lp -d "${printerName}" "${filePath}"`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    console.error(`stderr: ${stderr}`);
                    return reject(new Error(`Command failed with error: ${error.message}. Stderr: ${stderr}`));
                }
                if (stderr) {
                    console.warn(`Command had stderr output: ${stderr}`);
                }
                resolve(stdout);
            });
        }
    });
}

// === Polling Function to Fetch and Process Print Jobs ===
async function fetchAndProcessPrintJobs() {
    if (isProcessingJobs) {
        console.log('[Polling] Already processing jobs, skipping this interval.');
        return;
    }

    isProcessingJobs = true;
    console.log('[Polling] Checking for pending print jobs...');
    try {
        const response = await axios.get(`${LARAVEL_API_URL}/print-jobs/pending`);
        const pendingJobs = response.data;

        if (pendingJobs.length > 0) {
            console.log(`[Polling] Found ${pendingJobs.length} pending print jobs.`);
            for (const job of pendingJobs) {
                const jobIdentifier = `Job ID: ${job.id}, Type: ${job.type}, Order ID: ${job.order_id || 'N/A'}`;
                console.log(`[Polling] Processing ${jobIdentifier}`);

                // 1. Write Base64 PDF to a temporary file
                const tempPdfPath = path.join(os.tmpdir(), `print_job_${job.id}_${Date.now()}.pdf`);
                try {
                    fs.writeFileSync(tempPdfPath, Buffer.from(job.document_base64, 'base64'));
                    console.log(`[Polling] Temp PDF written to: ${tempPdfPath}`);
                } catch (writeError) {
                    console.error(`[Polling] Error writing temp PDF for ${jobIdentifier}:`, writeError);
                    await axios.put(`${LARAVEL_API_URL}/print-jobs/${job.id}/status`, {
                        status: 'failed',
                        error_message: `Error writing PDF: ${writeError.message}`
                    });
                    // Move to next job if writing fails
                    continue; 
                }

                // 2. Send file to printer
                let printSuccess = false;
                let printErrorMessage = '';
                try {
                    await printFileWrapper(tempPdfPath, job.printer_name);
                    printSuccess = true;
                    console.log(`[Polling] Successfully sent ${jobIdentifier} to printer: ${job.printer_name}.`);
                } catch (printError) {
                    printErrorMessage = printError.message;
                    console.error(`[Polling] Error printing ${jobIdentifier}:`, printError);
                } finally {
                    // 3. Delete temporary file
                    try {
                        if (fs.existsSync(tempPdfPath)) {
                            fs.unlinkSync(tempPdfPath);
                            console.log(`[Polling] Deleted temp PDF: ${tempPdfPath}`);
                        }
                    } catch (unlinkError) {
                        console.error(`[Polling] Error deleting temp PDF for ${jobIdentifier}:`, unlinkError);
                    }
                }

                // 4. Update job status on backend
                try {
                    await axios.put(`${LARAVEL_API_URL}/print-jobs/${job.id}/status`, {
                        status: printSuccess ? 'completed' : 'failed',
                        error_message: printSuccess ? null : printErrorMessage
                    });
                    console.log(`[Polling] Updated status for ${jobIdentifier} to: ${printSuccess ? 'completed' : 'failed'}.`);
                } catch (updateError) {
                    console.error(`[Polling] Error updating status for ${jobIdentifier} on backend:`, updateError);
                }
            }
        } else {
            console.log('[Polling] No pending print jobs found.');
        }
    } catch (error) {
        console.error('[Polling] Error fetching print jobs from Laravel Backend:', error.message);
    } finally {
        isProcessingJobs = false;
    }
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

app.listen(APP_PORT, () => {
    console.log(`[POS Bridge] Running on ${os.platform()} (${os.arch()})`);
    console.log(`[POS Bridge] Listening on http://localhost:${APP_PORT}`);
    console.log(`[POS Bridge] Polling Laravel API at: ${LARAVEL_API_URL}`);
    console.log(`[POS Bridge] Polling interval: ${POLLING_INTERVAL / 1000} seconds.`);

    // Start polling immediately and then at intervals
    fetchAndProcessPrintJobs(); 
    setInterval(fetchAndProcessPrintJobs, POLLING_INTERVAL);
});