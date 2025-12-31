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
const ENABLE_ALERT_SOUND = config.ENABLE_ALERT_SOUND === true; // NEW: ໂຫຼດຄ່າຈາກ config.json, ໃຫ້ແນ່ໃຈວ່າເປັນ boolean
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
            const sumatraPath = path.join(getAppRootPath(), 'SumatraPDF.exe');
            
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


// NEW: System Sound Logic
const SOUND_FILES = {
    'alert': 'alert.wav',
    'error': 'error.wav',
    // Add other sound types here as .wav files
};


function playSystemSound(soundType) {
    if (!ENABLE_ALERT_SOUND) {
        console.log(`[System Sound] Sound playback is disabled in config.json.`);
        return;
    }

    const filename = SOUND_FILES[soundType];
    if (!filename) {
        console.warn(`[System Sound] ບໍ່ພົບໄຟລ໌ສຽງສຳລັບປະເພດ: ${soundType}`);
        return;
    }

    const soundPath = path.join(getAppRootPath(), filename);
    
    if (!fs.existsSync(soundPath)) {
        console.warn(`[System Sound] ບໍ່ພົບໄຟລ໌ສຽງທີ່: ${soundPath}`);
        return;
    }

    if (IS_WINDOWS) {

    function playWindowsSound(soundPath) {
        if (!fs.existsSync(soundPath)) {
            console.warn('[System Sound] File not found:', soundPath);
            return;
        }

        // Escape single quote for PowerShell
        const safePath = soundPath.replace(/'/g, "''");

        // IMPORTANT: single-line PowerShell command
        const psCommand = `
            powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "
            try {
            $player = New-Object System.Media.SoundPlayer '${safePath}';
            $player.Load();
            $player.PlaySync();
            } catch {
            [System.Media.SystemSounds]::Beep.Play();
            }
        "
        `.replace(/\n/g, ' ');

        exec(psCommand, (error, stdout, stderr) => {
            if (error) {
                console.error('[System Sound] PowerShell exec error:', error.message);
            }
            if (stderr) {
                console.error('[System Sound] PowerShell stderr:', stderr);
            }
        });
    }

    // 👉 เรียกใช้ตรงนี้แทน logic เก่า
    playWindowsSound(soundPath);
    return;
}

    if (os.platform() === 'darwin') {
        // macOS: ໃຊ້ afplay (ຮອງຮັບ WAV)
        command = `afplay "${soundPath}"`;
        console.log(`[System Sound] ຫຼິ້ນສຽງ WAV ໃນ macOS: ${soundPath}`);
    } else if (os.platform() === 'linux') {
        // Linux: ໃຊ້ aplay (ຮອງຮັບ WAV)
        // ຄຳເຕືອນ: aplay ຕ້ອງຖືກຕິດຕັ້ງຢູ່ໃນລະບົບ (ສ່ວນໃຫຍ່ມີຕິດມາແລ້ວ)
        command = `aplay "${soundPath}"`; 
        console.log(`[System Sound] ຫຼິ້ນສຽງ WAV ໃນ Linux: ${soundPath}`);
    } else {
        console.warn(`[System Sound] ລະບົບປະຕິບັດການ ${os.platform()} ຍັງບໍ່ຖືກຮອງຮັບສຳລັບການຫຼິ້ນສຽງ.`);
        return;
    }

    if (command) { // This block now only for non-Windows OS
        exec(command, (error) => {
            if (error) {
                console.error(`[System Sound] ເກີດຂໍ້ຜິດພາດໃນການຫຼິ້ນສຽງ: ${error.message}`);
                // ຄຳແນະນຳເພີ່ມເຕີມສຳລັບ Linux
                if (os.platform() === 'linux') {
                    console.error('[System Sound] ຂໍ້ແນະນຳ: ສຳລັບ Linux, ໃຫ້ແນ່ໃຈວ່າໂປຣແກຣມ aplay ໄດ້ຖືກຕິດຕັ້ງແລ້ວ (ສ່ວນໃຫຍ່ມີຕິດມາແລ້ວ).');
                }
            } else {
                console.log(`[System Sound] ຄຳສັ່ງຫຼິ້ນສຽງສຳເລັດ.`);
            }
        });
    }
}

// NEW: Endpoint to play specific system sounds
app.get('/play-sound', (req, res) => {
    const soundType = req.query.type; // e.g., 'error', 'alert'

    if (!soundType) {
        return res.status(400).json({ success: false, message: 'Missing sound type parameter.' });
    }

    if (!SOUND_FILES[soundType]) {
        return res.status(404).json({ success: false, message: `Sound type '${soundType}' not found or not configured.` });
    }

    playSystemSound(soundType); // Play the sound (respects ENABLE_ALERT_SOUND internally)
    res.json({ success: true, message: `Attempting to play sound type: ${soundType}` });
});


// === Polling Function to Fetch and Process Print Jobs ===
async function fetchAndProcessPrintJobs() {
    if (isProcessingJobs) {
        console.log('[Polling] Already processing jobs, skipping this interval.');
        return;
    }

    isProcessingJobs = true;
    console.log('[Polling] Checking for pending print jobs...');
    try {
        const response = await fetch(`${LARAVEL_API_URL}/print-jobs/pending`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const responseData = await response.json(); // ປ່ຽນເປັນ responseData
        const pendingJobs = responseData.pendingJobs || []; // ດຶງ pendingJobs ອອກມາ
        const alertSoundStatus = responseData.alert_sound; // ດຶງ alert_sound ອອກມາ

        console.log('[Polling] Received response data:', responseData);

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
                    await fetch(`${LARAVEL_API_URL}/print-jobs/${job.id}/status`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            status: 'failed',
                            error_message: `Error writing PDF: ${writeError.message}`
                        })
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
                    await fetch(`${LARAVEL_API_URL}/print-jobs/${job.id}/status`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            status: printSuccess ? 'completed' : 'failed',
                            error_message: printSuccess ? null : printErrorMessage
                        })
                    });
                    console.log(`[Polling] Updated status for ${jobIdentifier} to: ${printSuccess ? 'completed' : 'failed'}.`);
                } catch (updateError) {
                    console.error(`[Polling] Error updating status for ${jobIdentifier} on backend:`, updateError);
                }
            }
        } else {
            console.log('[Polling] No pending print jobs found.');
        }

        // NEW: Logic ສຳລັບສຽງແຈ້ງເຕືອນ
        if (ENABLE_ALERT_SOUND && alertSoundStatus === 1) { // ກວດສອບ ENABLE_ALERT_SOUND
            playSystemSound('alert'); // Call new generic function
        }

    } catch (error) {
        console.error('[Polling] Error fetching print jobs from Laravel Backend:', error.message);
    } finally {
        isProcessingJobs = false;
    }
}

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
    console.log(`[POS Bridge] Polling Laravel API at: ${LARAVEL_API_URL}`);
    console.log(`[POS Bridge] Polling interval: ${POLLING_INTERVAL / 1000} seconds.`);
    console.log(`[POS Bridge] Alert Sound enabled: ${ENABLE_ALERT_SOUND}`); // NEW: Log ສະຖານະສຽງ

    // Start polling immediately and then at intervals
    fetchAndProcessPrintJobs(); 
    setInterval(fetchAndProcessPrintJobs, POLLING_INTERVAL);

});