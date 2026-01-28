// Socket.io removed in favor of SSE
// const socket = io(window.location.origin); 


        
// Element References
const cartContainer = document.getElementById('cart-container');
const emptyCart = document.getElementById('empty-cart');
const totalQtyEl = document.getElementById('total-qty');
const totalDiscountEl = document.getElementById('total-discount'); // NEW
const discountRow = document.getElementById('discount-row'); // NEW
const totalAmountEl = document.getElementById('total-amount');
const adImage = document.getElementById('ad-image');
const adVideo = document.getElementById('ad-video');
const qrSection = document.getElementById('payment-qr');
const qrImage = document.getElementById('qr-image');
const socketStatus = document.getElementById('socket-status'); // NEW


// State
let isSocketConnected = false;
let slideshowInterval = null; // Track slideshow timert isIdle = true;
let idleTimer = null;

// Utilities
const formatCurrency = (num) => new Intl.NumberFormat('en-US').format(num);

function renderCart(cartItems) {
    cartContainer.innerHTML = '';
    
    if (!cartItems || cartItems.length === 0) {
        cartContainer.appendChild(emptyCart);
        return;
    }
    
    cartItems.forEach(item => {
        const el = document.createElement('div');
        // CUSTOM COMPACT MODE (User Defined)
        el.className = 'item-card flex justify-between items-center bg-white p-2 rounded-lg shadow-sm border border-gray-50 mb-1 animate-fade-in-up';
        
        // Prepare Discount Logic
        const hasDiscount = item.discount && item.discount > 0;
        const discountBadge = hasDiscount 
            ? `<span class="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0 rounded mx-1">- ${formatCurrency(item.discount)}</span>` 
            : '';
        const priceDisplay = hasDiscount
            ? `<span class="line-through text-gray-400 text-[10px] mr-1">${formatCurrency(item.price)}</span>`
            : '';

        el.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="bg-gradient-to-br from-blue-500 to-blue-700 text-white font-bold h-5 w-5 flex items-center justify-center rounded shadow-blue-200 shadow-sm text-[10px]">
                    ${item.qty}
                </div>
                <div>
                    <p class="text-sm font-bold text-gray-800 line-clamp-1 tracking-tight leading-4">
                        ${item.name} ${discountBadge}
                    </p>
                    <p class="text-[10px] text-gray-400 font-medium leading-none mt-0.5">
                        ${priceDisplay}
                        ${formatCurrency(item.price - (hasDiscount ? (item.discount/item.qty) : 0))} ₭ / unit
                    </p>
                </div>
            </div>
            <div class="text-right">
                <span class="text-base font-bold text-gray-700 block leading-4">${formatCurrency(item.subtotal)}</span>
                <span class="text-[9px] text-gray-400 font-light uppercase leading-none">Total</span>
            </div>
        `;
        cartContainer.appendChild(el);
    });
    
    // Auto scroll to bottom
    cartContainer.scrollTop = cartContainer.scrollHeight;
}



// Helper to reuse update logic
function handleCartUpdate(data) {
    totalQtyEl.innerText = data.totalQty || 0;
    totalAmountEl.innerText = formatCurrency(data.totalAmount || 0);

    if (data.totalDiscount && data.totalDiscount > 0) {
        totalDiscountEl.innerText = formatCurrency(data.totalDiscount);
        discountRow.classList.remove('hidden');
    } else {
        discountRow.classList.add('hidden');
    }
    
    renderCart(data.items);

    if (data.qrCode) {
        qrImage.src = data.qrCode;
        qrSection.classList.remove('hidden');
    } else {
        qrSection.classList.add('hidden');
    }
}

// Helper to determine if URL is local or remote and proxy if needed
function getMediaUrl(src) {
    if (!src) return '';
    // Check if remote URL (http/https)
    if (src.startsWith('http://') || src.startsWith('https://')) {
        return src;
    }
    // Check if local absolute path (Unix '/' or Windows 'C:')
    // Also handling potential double backslashes which might come from JSON
    if (src.startsWith('/') || /^[a-zA-Z]:/.test(src) || src.startsWith('\\')) {
        return `/proxy-media?path=${encodeURIComponent(src)}`;
    }
    // Default (relative or other)
    return src;
}

function handleAdsUpdate(data) {
    if (!data) return;
    console.log('[Ads] Updating:', data);
    
    // Clear existing slideshow
    if (slideshowInterval) clearInterval(slideshowInterval);
    slideshowInterval = null;

    const adImage = document.getElementById('ad-image');
    const adVideo = document.getElementById('ad-video');

    if (data.type === 'video') {
        adImage.classList.add('hidden');
        adVideo.src = getMediaUrl(data.url);
        adVideo.classList.remove('hidden');
        
        // Attempt to play (browser might block auto-play with sound, but usually OK in kiosk/interaction)
        adVideo.play().catch(e => console.warn('Video autoplay blocked:', e));
        
    } else {
        // Image or Slideshow
        // Stop video
        adVideo.pause();
        adVideo.classList.add('hidden');
        adImage.classList.remove('hidden');

        // Check if it's a slideshow (url is array or direct slideshow type)
        const isSlideshow = Array.isArray(data.url) || (data.urls && Array.isArray(data.urls));
        
        if (isSlideshow) {
            slideshowImages = (data.urls || data.url).map(url => getMediaUrl(url));
            currentSlideIndex = 0;
            const duration = data.duration || 5000;

            if (slideshowImages.length > 0) {
                // Show first image immediately
                adImage.src = slideshowImages[0];
                adImage.style.opacity = 1;
                
                // Start Timer
                slideshowInterval = setInterval(() => {
                    currentSlideIndex = (currentSlideIndex + 1) % slideshowImages.length;
                    
                    // Simple fade out/in effect
                    adImage.style.opacity = 0; 
                    
                    setTimeout(() => {
                        adImage.src = slideshowImages[currentSlideIndex];
                        // Fade in once loaded
                        adImage.onload = () => {
                            adImage.style.opacity = 1;
                        };
                        adImage.onerror = (e) => {
                             console.error('[Ads] Error loading image:', adImage.src, e);
                             // Try to show next slide immediately if failure
                        };
                    }, 500); // Wait for fade out to complete

                }, duration);
            }
        } else {
             // Single Image
             adImage.src = getMediaUrl(data.url);
             adImage.style.opacity = 1;
             adImage.onerror = (e) => {
                console.error('[Ads] Error loading single image:', adImage.src, e);
             };
        }
    }
}



// --- SERVER-SENT EVENTS (SSE) SETUP ---
function setupSSE() {
    const evtSource = new EventSource('/events');

    evtSource.onopen = function() {
        isSocketConnected = true; 
        console.log('%c[SSE] Connected to POS Bridge', 'color: green; font-weight: bold');
        
        // Visual: Green Dot + Tooltip
        socketStatus.classList.remove('bg-red-500', 'bg-orange-500');
        socketStatus.classList.add('bg-green-500', 'shadow-[0_0_8px_rgba(34,197,94,0.6)]');
        socketStatus.title = "SSE Connected (Live Stream)";
    };

    evtSource.onerror = function(err) {
        isSocketConnected = false;
        console.error('[SSE] Connection Error', err);
        
        // Visual: Red Dot
        socketStatus.classList.remove('bg-green-500', 'shadow-[0_0_8px_rgba(34,197,94,0.6)]');
        socketStatus.classList.add('bg-red-500');
        socketStatus.title = "Connection Lost - Retrying...";
    };

    // Helper: Flash indicator on data receive
    function flashActivity() {
        socketStatus.classList.add('scale-150', 'brightness-150');
        setTimeout(() => {
            socketStatus.classList.remove('scale-150', 'brightness-150');
        }, 200);
    }

    // 1. Cart Update
    evtSource.addEventListener('cart:update', (e) => {
        const data = JSON.parse(e.data);
        console.log('%c[SSE] Cart Update', 'color: blue', data);
        flashActivity();
        handleCartUpdate(data);
    });

    // 2. Ads Update
    evtSource.addEventListener('ads:update', (e) => {
        const data = JSON.parse(e.data);
        console.log('%c[SSE] Ads Update', 'color: purple', data);
        flashActivity();
        handleAdsUpdate(data);
    });

    // 3. Clear Display
    evtSource.addEventListener('display:clear', () => {
        flashActivity();
        renderCart([]);
        totalQtyEl.innerText = '0';
        totalAmountEl.innerText = '0';
        discountRow.classList.add('hidden');
        qrSection.classList.add('hidden');
    });
}

// Start SSE
setupSSE();


