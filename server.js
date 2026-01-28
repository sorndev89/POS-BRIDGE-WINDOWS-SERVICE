const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');

// ==========================================
// CRITICAL: LOGGING INIT (MUST BE FIRST)
// ==========================================

function getAppRootPath() {
    if (process.pkg) {
        return path.dirname(process.execPath);
    } else {
        return __dirname;
    }
}

const LOG_FILE = path.join(getAppRootPath(), 'pos-bridge-debug.log');

function logToFile(type, args) {
    const timestamp = new Date().toISOString();
    const message = util.format(...args);
    const logLine = `[${timestamp}] [${type}] ${message}\n`;
    
    // Try main log file
    try {
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (e) {
        // Try temp dir fallback
        try {
            fs.appendFileSync(path.join(os.tmpdir(), 'pos-bridge-debug.log'), logLine);
        } catch (e2) {}
    }
}

// Global Exception Handlers (EARLY)
process.on('uncaughtException', (err) => {
    logToFile('FATAL', ['UNCAUGHT EXCEPTION:', err]);
    console.error('UNCAUGHT EXCEPTION:', err);
    // Keep process alive if possible, or let it crash after logging
});

process.on('unhandledRejection', (reason, promise) => {
    logToFile('ERROR', ['UNHANDLED REJECTION:', reason]);
    console.error('UNHANDLED REJECTION:', reason);
});

// Override Console
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = function(...args) {
    originalLog.apply(console, args);
    logToFile('INFO', args);
};
console.error = function(...args) {
    originalError.apply(console, args);
    logToFile('ERROR', args);
};
console.warn = function(...args) {
    originalWarn.apply(console, args);
    logToFile('WARN', args);
};

console.log('--- STARTING POS BRIDGE APP ---');
console.log('Node Version:', process.version);
console.log('Platform:', os.platform(), 'Arch:', os.arch());
console.log('App Root Path:', getAppRootPath());

// ==========================================
// MODULE IMPORTS & SAFE LOADER
// ==========================================
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { exec, spawn } = require('child_process');

// Native Modules (May fail in pkg)
let escpos, USB, SerialPort, EscposSerial;
try {
    escpos = require('escpos');
    console.log('[Module] escpos loaded');
} catch (e) { console.error('[Module] Failed to load escpos:', e.message); }

try {
    USB = require('escpos-usb');
    console.log('[Module] escpos-usb loaded');
} catch (e) { console.error('[Module] Failed to load escpos-usb:', e.message); }

try {
    const sp = require('serialport');
    SerialPort = sp.SerialPort;
    console.log('[Module] serialport loaded');
} catch (e) { console.error('[Module] Failed to load serialport:', e.message); }

try {
    EscposSerial = require('escpos-serialport');
    console.log('[Module] escpos-serialport loaded');
} catch (e) { console.error('[Module] Failed to load escpos-serialport:', e.message); }


const app = express();
const http = require('http').createServer(app);
// Socket.io removed in favor of SSE






const IS_WINDOWS = os.platform() === 'win32';

// --- ຕັ້ງຄ່າ Middleware ---

app.use(cors({ origin: "*" })); // Allow all origins
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));

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
const PORT = parseInt(config.APP_PORT) || 9100; // NEW: ໂຫຼດຄ່າຈາກ config.json
const LARAVEL_API_URL = config.LARAVEL_API_URL ;
const POLLING_INTERVAL = parseInt(config.POLLING_INTERVAL_MS);
const ENABLE_ALERT_SOUND = config.ENABLE_ALERT_SOUND === true; // NEW: ໂຫຼດຄ່າຈາກ config.json, ໃຫ້ແນ່ໃຈວ່າເປັນ boolean
const ENABLE_POLLING = config.ENABLE_POLLING !== false; // Default to true if not present
const VFD_PORT = config.VFD_PORT; // NEW: VFD Port
const VFD_BAUDRATE = parseInt(config.VFD_BAUDRATE) || 9600; // NEW: VFD BaudRate

// NEW: Customer View Config
const ENABLE_CUSTOMER_VIEW = config.ENABLE_CUSTOMER_VIEW === true;
const BROWSER_PATH = config.BROWSER_PATH;
const CUSTOMER_VIEW_URL = config.CUSTOMER_VIEW_URL || `http://localhost:${PORT}/view`;
const WINDOW_POSITION = config.WINDOW_POSITION || "0,0";



let isProcessingJobs = false; // Flag to prevent concurrent job processing

let lastCartState = null;     // NEW: Store last cart state
let lastAdsState = null;      // NEW: Store last ads state



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

            // ສັ່ງພິມແບບ Silent ຜ່ານ SumatraPDF ພ້ອມກັບ setting noscale (ບໍ່ຍໍ້ຂະໜາດ)
            const command = `"${sumatraPath}" -print-to "${printerName}" -print-settings "noscale" -silent "${filePath}"`;
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

// NEW: Endpoint to get a list of installed printers
app.get('/list-printers', async (req, res) => {
    try {
        const printerList = await getPrintersWrapper();
        res.json({ success: true, printers: printerList }); // Return as { printers: [...] }
    } catch (e) {
        console.error('[Printers Endpoint] Error listing printers:', e);
        res.status(500).json({ success: false, message: 'Cannot list printers.', error: e.message });
    }
});

// ສັ່ງເປີດລິ້ນຊັກ (ຮັກສາຟັງຊັ່ນເດີມຂອງທ່ານໄວ້)
app.post('/hardware/open-drawer', (req, res) => {
    try {
        if (!USB || !escpos) throw new Error('USB or escpos module not loaded');
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

// ==========================================
// NEW: WEB CUSTOMER DISPLAY LOGIC
// ==========================================

// 1. Serve Static Files (The HTML View)
app.use('/view', express.static(path.join(getAppRootPath(), 'view')));

// --------------------------------------------------------------------------
// REPLACED SOCKET.IO WITH SERVER-SENT EVENTS (SSE)
// --------------------------------------------------------------------------

let sseClients = [];

// Helper: Broadcast data to all connected SSE clients
function broadcastToClients(type, data) {
    const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(client => client.res.write(message));
}

// 2. SSE Endpoint
app.get('/events', (req, res) => {
    // Set headers for SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    console.log('[SSE] New client connected');

    // Send initial state
    if (lastCartState) {
        res.write(`event: cart:update\ndata: ${JSON.stringify(lastCartState)}\n\n`);
    }
    if (lastAdsState) {
        res.write(`event: ads:update\ndata: ${JSON.stringify(lastAdsState)}\n\n`);
    }

    // Add client to list
    const clientId = Date.now();
    const newClient = {
        id: clientId,
        res
    };
    sseClients.push(newClient);

    // Clean up on disconnect
    req.on('close', () => {
        console.log(`[SSE] Client ${clientId} disconnected`);
        sseClients = sseClients.filter(c => c.id !== clientId);
    });
});

// 3. API to Update Cart
app.post('/display/update-cart', (req, res) => {
    // Expected Payload: { items: [], totalQty, totalAmount, qrCode }
    const data = req.body;
    lastCartState = data; // Save to state
    console.log('[Display] Updating cart:', data.totalAmount);
    
    broadcastToClients('cart:update', data); // Broadcast via SSE
    res.json({ success: true, message: 'Cart updated' });
});

// 4. API to Update Ads
app.post('/display/ads', (req, res) => {
    // Expected Payload: { type: 'image'|'video', url: '...' }
    const data = req.body;
    lastAdsState = data; // Save to state
    console.log('[Display] Updating ads:', data.url);
    
    broadcastToClients('ads:update', data);
    res.json({ success: true, message: 'Ads updated' });
});

// 5. API to Clear Display
app.post('/display/clear', (req, res) => {
    lastCartState = null; // Clear state
    broadcastToClients('display:clear', {});
    res.json({ success: true, message: 'Display cleared' });
});


// 6. Auto-Launch Browser Logic




// NEW: Endpoint to list all Serial Ports (for VFD detection)
app.get('/hardware/ports', async (req, res) => {
    try {
        if (!SerialPort) throw new Error('SerialPort module not loaded');
        const ports = await SerialPort.list();
        res.json({ success: true, ports: ports });
    } catch (err) {
        console.error('[Serial Port] Error listing ports:', err);
        res.status(500).json({ success: false, message: 'Could not list serial ports.', error: err.message });
    }
});

// NEW: Endpoint to display text on VFD
app.post('/hardware/display', async (req, res) => {
    const { line1, line2 } = req.body;

    if (!VFD_PORT) {
        return res.status(400).json({ success: false, message: 'VFD_PORT is not configured in config.json' });
    }

    try {
        if (!EscposSerial || !escpos) throw new Error('EscposSerial or escpos module not loaded');
        // Create Serial connection
        const device = new EscposSerial(VFD_PORT, { baudRate: VFD_BAUDRATE });
        const printer = new escpos.Printer(device);

        device.open((error) => {
            if (error) {
                console.error('[VFD] Open error:', error);
                return res.status(500).json({ success: false, message: 'Could not open VFD port: ' + error.message });
            }

            // Commands to clear and write
            // Note: Standard ESC/POS commands used by VFDs
            printer
                .font('a')
                .align('ct') // Center align if possible, but VFDs are usually fixed width 20 chars
                .style('normal')
                .size(1, 1);

            // Manual clear might be better for some VFDs if printer.text() doesn't handle it well
            // But usually printer object manages it. 
            // VFDs usually need specific initialization or just raw text.
            // Using standard escpos text output:
            
            // Note: VFDs are often 2x20 lines. 'escpos' might treat it as paper.
            // We'll try standard text output. For explicit line control, we might need raw commands.
            // But let's try generic first.
            
            // Specific VFD clear command often: 0x0C (Form Feed) or ESC @ (Initialize)
            // escpos library 'text' usually sends newline.
            
            // Simple strategy for 2-line VFD:
            // 1. Initialize/Clear
            // 2. Write Line 1
            // 3. Move cursor / Newline
            // 4. Write Line 2
            
            // Using raw commands for VFD is often safer than 'printer.text()' which assumes paper width
            // Common VFD Clear: 0x0C
            device.write(Buffer.from([0x0C])); // Clear screen
            
            setTimeout(() => {
                if (line1) {
                    device.write(Buffer.from(line1.substring(0, 20))); // Write line 1 (max 20 chars)
                }
                
                if (line2) {
                     // Move to 2nd line. Many VFDs wrap automatically or use specific command (e.g. CR/LF or 0x0D 0x0A)
                     // Universal move to bottom line often: 0x0D 0x0A (if not wrapped) or 0x1B 0x5B 0x4C (some models)
                     // Let's try simple CR LF then write
                     device.write(Buffer.from([0x0D, 0x0A])); 
                     device.write(Buffer.from(line2.substring(0, 20)));
                }

                // Close after short delay to ensure transmission
                setTimeout(() => {
                    printer.close(() => {
                        res.json({ success: true, message: 'Displayed text on VFD' });
                    });
                }, 100);
            }, 50); // Small delay after clear
        });

    } catch (e) {
        console.error('[VFD] Exception:', e);
        res.status(500).json({ success: false, message: 'VFD Exception: ' + e.message });
    }
});

// NEW: Endpoint to clear VFD
app.post('/hardware/display/clear', async (req, res) => {
    if (!VFD_PORT) {
        return res.status(400).json({ success: false, message: 'VFD_PORT is not configured in config.json' });
    }

    try {
        if (!EscposSerial || !escpos) throw new Error('EscposSerial or escpos module not loaded');
        const device = new EscposSerial(VFD_PORT, { baudRate: VFD_BAUDRATE });
        const printer = new escpos.Printer(device);

        device.open((error) => {
            if (error) {
                return res.status(500).json({ success: false, message: 'Could not open VFD port: ' + error.message });
            }
            device.write(Buffer.from([0x0C])); // Clear command
             setTimeout(() => {
                printer.close(() => {
                    res.json({ success: true, message: 'Cleared VFD' });
                });
            }, 100);
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'VFD Exception: ' + e.message });
    }
});

// Proxy for local media files
app.get('/proxy-media', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) {
        return res.status(400).send('Missing path parameter');
    }
    
    console.log(`[Proxy] Request for: ${filePath}`);

    // Security check logic...
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        console.error(`[Proxy] File not found: ${filePath}`);
        res.status(404).send('File not found');
    }
});


// ສັ່ງພິມ PDF
app.post('/print/pdf', async (req, res) => {
    // Support both camelCase (internal/standard) and snake_case (Laravel/External)
     // content is often used for base64 in some integrations
    const pdfBase64 = req.body.pdfBase64 || req.body.content || req.body.data;
    const printerName = req.body.printerName || req.body.printer_name;
    
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

// 6. Auto-Launch Browser Logic
function launchCustomerDisplay() {
    if (!ENABLE_CUSTOMER_VIEW || !BROWSER_PATH) return;

    console.log('[Display] Checking for browser at:', BROWSER_PATH);
    if (!fs.existsSync(BROWSER_PATH)) {
        console.error('[Display] Chrome not found at configured path. Please check config.json.');
        return;
    }

    console.log('[Display] Launching Customer View Kiosk...');
    
    // Use a local directory for Chrome's profile to avoid permission issues in %TEMP%
    const userDataDir = path.join(getAppRootPath(), '_chrome_cache');
    
    // Ensure dir exists
    if (!fs.existsSync(userDataDir)) {
        try { 
            fs.mkdirSync(userDataDir, { recursive: true }); 
            console.log(`[Display] Created Chrome cache directory.`);
        } catch(e){
            console.error(`[Display] Failed to create cache directory: ${e.message}`);
        }
    }

    // Arguments for spawn - Split flags and values to ensure correct quoting by Node
    const args = [
        `--app=${CUSTOMER_VIEW_URL}`,
        `--window-position=${WINDOW_POSITION}`,
        '--kiosk',
        '--user-data-dir=' + userDataDir, // Pass as single string, Node handles quoting if needed
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-infobars',
        '--disable-session-crashed-bubble',
        '--overscroll-history-navigation=0',
        '--disable-pinch',
        '--remote-allow-origins=*' // Add this to help with some CORS/local restrictions
    ];

    console.log(`[Display] Spawning: "${BROWSER_PATH}" with args:`, args);

    try {
        const chromeProcess = spawn(BROWSER_PATH, args, {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'] // Capture stdout/stderr
        });

        chromeProcess.stdout.on('data', (data) => {
            console.log(`[Chrome STDOUT] ${data}`);
        });

        chromeProcess.stderr.on('data', (data) => {
            console.error(`[Chrome STDERR] ${data}`);
        });
        
        chromeProcess.on('error', (err) => {
            console.error(`[Display] Failed to start Chrome process: ${err.message}`);
        });

        chromeProcess.on('exit', (code) => {
            if (code !== 0) {
                 console.error(`[Display] Chrome process exited with code ${code}`);
            }
        });

        chromeProcess.unref(); 

        console.log('[Display] Chrome process spawned successfully (detached).');
    } catch (error) {
        console.error('[Display] Chrome Launch Error (spawn):', error.message);
    }
}



// Change app.listen to server.listen (http server)
if (require.main === module) {
    http.listen(PORT, () => {
        console.log(`[POS Bridge] Running on ${os.platform()} (${os.arch()})`);
        console.log(`Listening on http://localhost:${PORT}`);
        console.log(`[POS Bridge] Polling Laravel API at: ${LARAVEL_API_URL}`);
        console.log(`[POS Bridge] Polling interval: ${POLLING_INTERVAL / 1000} seconds.`);
        console.log(`[POS Bridge] Alert Sound enabled: ${ENABLE_ALERT_SOUND}`); 
        console.log(`[POS Bridge] Polling enabled: ${ENABLE_POLLING}`);
        console.log(`[POS Bridge] Customer View enabled: ${ENABLE_CUSTOMER_VIEW}`);

        // Start polling immediately and then at intervals IF enabled
        if (ENABLE_POLLING) {
            fetchAndProcessPrintJobs(); 
            setInterval(fetchAndProcessPrintJobs, POLLING_INTERVAL);
        } else {
            console.log('[POS Bridge] Polling is DISABLED in config.json. Mode: Direct API Only.');
        }

        // Launch Customer View if enabled
        if (ENABLE_CUSTOMER_VIEW) {
            // Delay slightly to ensure server is ready (Increased to 5s)
            setTimeout(launchCustomerDisplay, 5000);
        }
    });
}

module.exports = http; // Export for testing