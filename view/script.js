const socket = io();
        
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

// State
let isIdle = true;
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

// --- Socket Events ---

socket.on('connect', () => {
    console.log('Connected to POS Bridge');
});

// 1. UPDATE CART
socket.on('cart:update', (data) => {
    console.log('Cart Update:', data);
    
    // Update Text
    totalQtyEl.innerText = data.totalQty || 0;
    totalAmountEl.innerText = formatCurrency(data.totalAmount || 0);

    // Update Discount
    if (data.totalDiscount && data.totalDiscount > 0) {
        totalDiscountEl.innerText = formatCurrency(data.totalDiscount);
        discountRow.classList.remove('hidden');
    } else {
        discountRow.classList.add('hidden');
    }
    
    // Render Items
    renderCart(data.items);

    // Handle QR
    if (data.qrCode) {
        qrImage.src = data.qrCode;
        qrSection.classList.remove('hidden');
    } else {
        qrSection.classList.add('hidden');
    }

    // Switch to Active Mode (wake up from idle)
    isIdle = false;
    
    // Reset Idle Timer
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        isIdle = true;
    }, 60000); // 1 minute idle
});

// 2. ADS UPDATE
let slideshowInterval = null;
let currentSlideIndex = 0;
let slideshowImages = [];

socket.on('ads:update', (data) => {
    console.log('Ads Update:', data);
    
    // Clear existing slideshow
    if (slideshowInterval) clearInterval(slideshowInterval);
    slideshowInterval = null;

    if (data.type === 'video') {
        adImage.classList.add('hidden');
        adVideo.src = data.url;
        adVideo.classList.remove('hidden');
        adVideo.play();
    } else {
        // Stop video
        adVideo.pause();
        adVideo.classList.add('hidden');
        adImage.classList.remove('hidden');

        // Check if it's a slideshow (url is array or direct slideshow type)
        const isSlideshow = Array.isArray(data.url) || (data.urls && Array.isArray(data.urls));
        
        if (isSlideshow) {
            slideshowImages = data.urls || data.url;
            currentSlideIndex = 0;
            const duration = data.duration || 5000;

            if (slideshowImages.length > 0) {
                // Show first image immediately
                adImage.src = slideshowImages[0];
                
                // Start Timer
                slideshowInterval = setInterval(() => {
                    currentSlideIndex = (currentSlideIndex + 1) % slideshowImages.length;
                    // Fade out
                    adImage.style.opacity = 0; 
                    
                    setTimeout(() => {
                        adImage.src = slideshowImages[currentSlideIndex];
                        // Fade in (after loading)
                        adImage.onload = () => {
                            adImage.style.opacity = 1;
                        };
                    }, 500); // 0.5s fade out transition matches/simulates transition

                }, duration);
            }
        } else {
             // Single Image
             adImage.src = data.url;
             adImage.style.opacity = 1;
        }
    }
});

// 3. CLEAR / RESET
socket.on('display:clear', () => {
        renderCart([]);
        totalQtyEl.innerText = '0';
        totalAmountEl.innerText = '0';
        discountRow.classList.add('hidden');
        qrSection.classList.add('hidden');
});
