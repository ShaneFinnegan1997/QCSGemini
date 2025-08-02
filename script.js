// qc-sweepstakes-sketch/script.js

// Firebase SDK imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithCustomToken, 
    signInAnonymously,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    onSnapshot, 
    collection, 
    query, 
    where, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Global Variables ---
let db, auth, userId, userRole, userProfile;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

/**
 * ====================================================================================
 * !!! IMPORTANT: FIREBASE CONFIGURATION REQUIRED !!!
 * ====================================================================================
 * You MUST replace these placeholder values with your actual Firebase project configuration.
 * * 1. Go to your Firebase project in the Firebase Console.
 * 2. Click on "Project settings" (the gear icon).
 * 3. Under the "General" tab, scroll down to "Your apps".
 * 4. Select the app you registered for this project (or create a new web app).
 * 5. Copy the `firebaseConfig` object and paste it below, replacing the placeholder.
 * * !!! CRITICAL STEP: ENABLE AUTHENTICATION PROVIDERS !!!
 * After you set up the config, go to "Authentication" in your Firebase console,
 * click "Get started", and enable the "Anonymous" and "Email/Password" sign-in methods.
 * ====================================================================================
 */
const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : {
    apiKey: "your-api-key", // <-- REPLACE THIS WITH YOUR API KEY
    authDomain: "your-project-id.firebaseapp.com", // <-- REPLACE THIS WITH YOUR AUTH DOMAIN
    projectId: "your-project-id", // <-- REPLACE THIS WITH YOUR PROJECT ID
    storageBucket: "your-project-id.appspot.com", // <-- REPLACE THIS WITH YOUR STORAGE BUCKET
    messagingSenderId: "your-sender-id", // <-- REPLACE THIS WITH YOUR SENDER ID
    appId: "your-app-id" // <-- REPLACE THIS WITH YOUR APP ID
};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : '';
const googleProvider = new GoogleAuthProvider();

// --- Utility Functions ---
function showMessage(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = `message ${type}`;
        element.style.display = 'block';
    }
}

function showLoadingSpinner(show) {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
        spinner.style.display = show ? 'flex' : 'none';
    }
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// --- Header and Navigation Functions ---
function setupHeaderListeners() {
    const hamburgerBtn = document.getElementById('hamburger-menu-btn');
    const navLinks = document.getElementById('nav-links');
    const authLinks = document.getElementById('auth-links');
    const logoutBtn = document.getElementById('logout-btn');

    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            authLinks.classList.toggle('active');
            hamburgerBtn.classList.toggle('open');
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await auth.signOut();
            window.location.href = 'index.html';
        });
    }
    
    // Setup dark mode toggle
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
        });
    }

    // Setup global announcement banner
    const closeBannerBtn = document.getElementById('close-banner-btn');
    const announcementBanner = document.getElementById('announcement-banner');
    if (closeBannerBtn) {
        closeBannerBtn.addEventListener('click', () => {
            if (announcementBanner) {
                announcementBanner.style.display = 'none';
            }
        });
    }
}

function updateNavForUser(user, role = 'guest') {
    const authNavLinks = document.getElementById('auth-nav-links');
    const userNavLinks = document.getElementById('user-nav-links');
    const navAdminLink = document.getElementById('nav-admin-link');
    const navHostLink = document.getElementById('nav-host-link');
    const userEmailDisplay = document.getElementById('user-email-display');
    const userDisplayName = document.getElementById('user-display-name');
    const navUserBadge = document.getElementById('nav-user-badge');
    const headerProfile = document.getElementById('header-profile');

    if (user && user.isAnonymous === false) {
        if (authNavLinks) authNavLinks.style.display = 'none';
        if (userNavLinks) userNavLinks.style.display = 'flex';
        if (userEmailDisplay) userEmailDisplay.textContent = user.email;
        if (headerProfile) headerProfile.style.display = 'flex';

        // Update dashboard content
        if (userDisplayName) userDisplayName.textContent = user.displayName || user.email;
        if (navUserBadge) {
            navUserBadge.textContent = role;
            navUserBadge.className = `role-badge ${role.replace(' ', '_')}`;
        }
        
        // Show role-specific links
        if (navAdminLink) navAdminLink.style.display = (role === 'admin' || role === 'owner') ? 'block' : 'none';
        if (navHostLink) navHostLink.style.display = (['admin', 'owner', 'community_host', 'official_host'].includes(role)) ? 'block' : 'none';

    } else {
        if (authNavLinks) authNavLinks.style.display = 'flex';
        if (userNavLinks) userNavLinks.style.display = 'none';
        if (headerProfile) headerProfile.style.display = 'none';
        if (navAdminLink) navAdminLink.style.display = 'none';
        if (navHostLink) navHostLink.style.display = 'none';
        // Redirect non-authenticated users from protected pages
        if (['dashboard.html', 'admin.html', 'sweepstakes.html', 'vip.html', 'chat.html'].some(page => window.location.pathname.endsWith(page))) {
             window.location.href = 'index.html';
        }
    }
    showLoadingSpinner(false);
}

// --- AdBlock Detector ---
let adBlockChecked = false;
function checkAdBlock() {
    if (adBlockChecked) return;
    adBlockChecked = true;
    
    // Check if the adblock modal was already shown in this session
    if (localStorage.getItem('adblock-shown')) {
        return;
    }

    const testAd = document.createElement('div');
    testAd.innerHTML = '&nbsp;';
    testAd.className = 'ad-test';
    testAd.style.position = 'absolute';
    testAd.style.top = '-9999px';
    document.body.appendChild(testAd);

    setTimeout(() => {
        if (testAd.offsetHeight === 0) {
            showModal('adblock-modal');
            localStorage.setItem('adblock-shown', 'true');
        }
        document.body.removeChild(testAd);
    }, 100);
}

// --- User Data & Onboarding ---
async function handleUserOnboarding(user) {
    if (!user) return;
    userId = user.uid;
    const userDocRef = doc(db, 'artifacts', appId, 'users', userId);
    
    // Listen for real-time updates to the user's document
    onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            userProfile = docSnap.data();
            userRole = userProfile.role;
            updateNavForUser(user, userRole);
            updateDashboardUI();
            updateVIPUI();
            updateAdminPanelUI();
            updateChatUI();
        } else {
            // New user, create profile
            const profileData = {
                email: user.email,
                displayName: user.displayName || 'New User',
                photoURL: user.photoURL || 'https://placehold.co/40x40',
                role: 'guest',
                vipTier: 'none',
                isVerified: false,
                wallets: {
                    individual: 0,
                    chPrizePool: 0,
                    chEarnings: 0,
                    website: 0,
                    nonprofit: 0
                },
                createdAt: serverTimestamp()
            };
            setDoc(userDocRef, profileData, { merge: true }).then(() => {
                userProfile = profileData;
                userRole = 'guest';
                updateNavForUser(user, userRole);
                updateDashboardUI();
                showModal('onboarding-modal'); // Show onboarding modal for new users
            });
        }
    });
}

// --- UI Updaters (Called by onSnapshot) ---
function updateDashboardUI() {
    if (document.getElementById('dashboard-content') && userProfile) {
        document.getElementById('user-display-name').textContent = userProfile.displayName;
        document.getElementById('user-role-badge').textContent = userProfile.role;
        document.getElementById('user-role-badge').className = `ml-4 role-badge ${userProfile.role.replace(' ', '_')}`;
        document.getElementById('user-entries').textContent = 'Mock: 5'; // Mock data
        document.getElementById('user-wins').textContent = 'Mock: 1'; // Mock data
        document.getElementById('wallet-balance').textContent = `Mock: $${userProfile.wallets.individual.toFixed(2)}`;
        
        // Update VIP status badge
        const vipStatus = document.getElementById('vip-status');
        if (vipStatus) {
            vipStatus.textContent = userProfile.vipTier === 'none' ? 'Standard' : userProfile.vipTier;
            vipStatus.className = `vip-badge ${userProfile.vipTier.toLowerCase()}`;
        }

        // Fetch and display sweepstakes
        fetchAndDisplaySweepstakes();
    }
}

function updateVIPUI() {
    if (document.getElementById('vip-page') && userProfile) {
        document.getElementById('current-vip-status').textContent = `Current Status: ${userProfile.vipTier === 'none' ? 'Standard' : userProfile.vipTier}`;
        // Hide upgrade button if already elite
        const eliteBtn = document.getElementById('activate-elite-btn');
        if (eliteBtn && userProfile.vipTier === 'elite') {
            eliteBtn.disabled = true;
            eliteBtn.textContent = 'Already Elite';
        }
    }
}

function updateAdminPanelUI() {
    if (document.getElementById('admin-panel') && userRole && (userRole === 'admin' || userRole === 'owner')) {
        // Mocking user list and verification requests
        const usersList = document.getElementById('users-list');
        const verificationList = document.getElementById('verification-requests');
        if (usersList) usersList.innerHTML = '<p>User list data goes here...</p>';
        if (verificationList) verificationList.innerHTML = '<p>Verification requests data goes here...</p>';
    }
}

function updateChatUI() {
    if (document.getElementById('chat-page')) {
        // Fetch and display chat messages
        fetchAndDisplayChatMessages();
    }
}

// --- Sweepstakes Logic ---
async function fetchAndDisplaySweepstakes() {
    const sweepstakesList = document.getElementById('sweepstakes-list');
    if (!sweepstakesList) return;
    sweepstakesList.innerHTML = '<p class="text-gray-500">Loading sweepstakes...</p>';

    const publicCollectionPath = `artifacts/${appId}/public/data/sweepstakes`;
    const q = query(collection(db, publicCollectionPath));

    onSnapshot(q, (querySnapshot) => {
        sweepstakesList.innerHTML = '';
        if (querySnapshot.empty) {
            sweepstakesList.innerHTML = '<p class="text-gray-500">No active sweepstakes at the moment.</p>';
            return;
        }

        querySnapshot.forEach(async (docSnap) => {
            const sweepstakesData = docSnap.data();
            const docId = docSnap.id;
            
            // Check if user has entered, based on role permissions
            let isUserEntered = false;
            if (userRole && userRole !== 'guest') {
                isUserEntered = await checkUserEntry(docId, userId);
            }

            const statusClass = sweepstakesData.status === 'active' ? 'active' : (sweepstakesData.status === 'upcoming' ? 'upcoming' : 'completed');
            const isDisabled = isUserEntered || sweepstakesData.status !== 'active' || userRole === 'guest';
            
            const card = document.createElement('div');
            card.className = 'sweepstakes-card';
            card.innerHTML = `
                <img src="${sweepstakesData.prizeImage}" alt="Prize image" class="mb-4">
                <div class="flex items-center mb-2">
                    <span class="sweepstakes-status ${statusClass}">${sweepstakesData.status}</span>
                    <span class="ml-auto text-sm text-gray-400">Ends in: <span id="countdown-${docId}"></span></span>
                </div>
                <h4 class="text-xl font-bold">${sweepstakesData.title}</h4>
                <p class="text-lg text-gray-300">Prize: ${sweepstakesData.prize}</p>
                <div class="flex items-center mt-2">
                    <span class="text-sm">Host:</span>
                    <span class="role-badge ${sweepstakesData.hostRole.replace(' ', '_')} ml-2">${sweepstakesData.hostName}</span>
                </div>
                <button id="enter-btn-${docId}" class="btn btn-primary mt-4" ${isDisabled ? 'disabled' : ''}>
                    ${isUserEntered ? 'Entered' : 'Enter Now'}
                </button>
            `;
            sweepstakesList.appendChild(card);

            // Setup countdown timer
            const countdownEl = document.getElementById(`countdown-${docId}`);
            if (countdownEl) {
                 setInterval(() => {
                    const now = new Date().getTime();
                    const end = new Date(sweepstakesData.endTime).getTime();
                    const distance = end - now;
                    if (distance < 0) {
                        countdownEl.textContent = 'Completed';
                        return;
                    }
                    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                    countdownEl.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
                }, 1000);
            }

            const enterBtn = document.getElementById(`enter-btn-${docId}`);
            if (enterBtn && !isUserEntered && sweepstakesData.status === 'active') {
                enterBtn.addEventListener('click', () => handleSweepstakesEntry(docId, userId));
            }
        });
    }, (error) => {
        console.error("Error fetching sweepstakes:", error);
        sweepstakesList.innerHTML = `<p class="text-gray-500">Error loading sweepstakes.</p>`;
    });
}

async function checkUserEntry(sweepstakesId, currentUserId) {
    if (!currentUserId) return false;
    const entryDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'sweepstakes', sweepstakesId, 'entries', currentUserId);
    const entryDocSnap = await getDoc(entryDocRef);
    return entryDocSnap.exists();
}

async function handleSweepstakesEntry(sweepstakesId, currentUserId) {
    if (!currentUserId) {
        console.error("User not authenticated.");
        return;
    }
    const entryDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'sweepstakes', sweepstakesId, 'entries', currentUserId);
    try {
        await setDoc(entryDocRef, {
            userId: currentUserId,
            timestamp: serverTimestamp()
        });
        const button = document.getElementById(`enter-btn-${sweepstakesId}`);
        if (button) {
            button.textContent = 'Entered';
            button.disabled = true;
        }
    } catch (error) {
        console.error("Error entering sweepstakes:", error);
        alert('Failed to enter sweepstakes. Please try again.');
    }
}

// --- Chat Logic ---
function fetchAndDisplayChatMessages() {
    const chatMessagesEl = document.getElementById('chat-messages');
    if (!chatMessagesEl) return;
    const chatCollectionPath = `artifacts/${appId}/public/data/chat_messages`;
    const q = query(collection(db, chatCollectionPath));
    
    onSnapshot(q, (querySnapshot) => {
        chatMessagesEl.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const msg = doc.data();
            const messageEl = document.createElement('div');
            messageEl.className = 'chat-message';
            messageEl.innerHTML = `
                <span class="role-badge ${msg.userRole.replace(' ', '_')}">${msg.userName}</span>
                <span class="ml-2">${msg.message}</span>
                <span class="text-sm text-gray-400 ml-2">${msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString() : ''}</span>
            `;
            chatMessagesEl.appendChild(messageEl);
        });
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }, (error) => {
        console.error("Error fetching chat messages:", error);
    });
}

async function handleChatMessageSend(event) {
    event.preventDefault();
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();
    if (!message || !userId || userRole === 'guest') return;

    // TODO: Implement rate limiting logic based on userRole
    const chatCollectionPath = `artifacts/${appId}/public/data/chat_messages`;
    await addDoc(collection(db, chatCollectionPath), {
        userId: userId,
        userName: userProfile.displayName,
        userRole: userRole,
        message: message,
        timestamp: serverTimestamp()
    });
    chatInput.value = '';
}

// This function checks the auth state on page load and redirects if needed.
function checkAuthAndRedirect(user) {
    const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/';
    const isDashboardPage = window.location.pathname.endsWith('dashboard.html');

    if (user && user.isAnonymous === false) {
        if (isLoginPage) {
            window.location.href = 'dashboard.html';
        }
        hideModal('auth-modal');
    } else if (user && user.isAnonymous === true) {
        // User is anonymous, allow them to view public pages but redirect from protected ones.
        if (isDashboardPage) {
            window.location.href = 'index.html';
        }
    } else {
        // User is not authenticated, redirect from protected pages.
        if (isDashboardPage) {
            window.location.href = 'index.html';
        }
    }
}

// --- Main Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    setupHeaderListeners(); // Setup listeners for the now-embedded header
    checkAdBlock();

    // Firebase initialization
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        console.log('Firebase App Initialized with Project ID:', firebaseConfig.projectId);

        // --- AUTH LOGIC ---
        // Login with email/password
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = loginForm.email.value;
                const password = loginForm.password.value;
                try {
                    // Sign in, but DON'T redirect immediately. The onAuthStateChanged listener will handle it.
                    await signInWithEmailAndPassword(auth, email, password);
                } catch (error) {
                    showMessage('login-error', error.message, 'error');
                }
            });
        }
        
        // Signup with email/password
        const signupForm = document.getElementById('signup-form');
        if (signupForm) {
            signupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = signupForm.email.value;
                const password = signupForm.password.value;
                try {
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    const user = userCredential.user;
                    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid), {
                        email: user.email,
                        role: 'guest',
                        createdAt: serverTimestamp()
                    });
                    // Sign up is successful, the onAuthStateChanged listener will handle the redirect.
                } catch (error) {
                    showMessage('signup-error', error.message, 'error');
                }
            });
        }

        // Google Sign-in
        const googleLoginBtn = document.getElementById('google-login-btn');
        if (googleLoginBtn) {
            googleLoginBtn.addEventListener('click', async () => {
                try {
                    // Sign in with Google, the onAuthStateChanged listener will handle the redirect.
                    await signInWithPopup(auth, googleProvider);
                } catch (error) {
                    showMessage('login-error', error.message, 'error');
                }
            });
        }

        // Handle VIP Upgrade
        const vipForm = document.getElementById('vip-form');
        if (vipForm) {
            vipForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const newTier = vipForm.tier.value;
                const userDocRef = doc(db, 'artifacts', appId, 'users', userId);
                await setDoc(userDocRef, { vipTier: newTier }, { merge: true });
                alert(`You have successfully upgraded to ${newTier}!`);
            });
        }

        // Handle Chat Message
        const chatForm = document.getElementById('chat-form');
        if (chatForm) {
            chatForm.addEventListener('submit', handleChatMessageSend);
        }
        
        // Listeners for showing/hiding login/signup forms
        const authForms = document.getElementById('auth-forms');
        const signupFormContainer = document.getElementById('signup-form-container');
        const showSignupLink = document.getElementById('show-signup');
        const showLoginLink = document.getElementById('show-login');
        if (showSignupLink) {
            showSignupLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (authForms) authForms.style.display = 'none';
                if (signupFormContainer) signupFormContainer.style.display = 'block';
            });
        }
        if (showLoginLink) {
            showLoginLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (authForms) authForms.style.display = 'block';
                if (signupFormContainer) signupFormContainer.style.display = 'none';
            });
        }


        // Listen for authentication state changes and handle redirects
        onAuthStateChanged(auth, async (user) => {
            checkAuthAndRedirect(user); // New function to handle redirects
            if (user) {
                await handleUserOnboarding(user);
            } else {
                userRole = 'guest';
                userId = null;
                updateNavForUser(null);
            }
        });

        // Sign in with custom token or anonymously if in dev environment
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

    } catch (error) {
        console.error("Error initializing Firebase:", error);
        const mainContainer = document.querySelector('main.container');
        if (mainContainer) {
            mainContainer.innerHTML = `<div class="p-4 bg-red-100 text-red-800 rounded-lg shadow-lg mt-8">
                <h3 class="font-bold">Initialization Error</h3>
                <p>Failed to initialize the application. Please ensure your Firebase config in script.js is correct and authentication is enabled in your project.</p>
                <p>Error details: ${error.message}</p>
            </div>`;
        }
    }
});

