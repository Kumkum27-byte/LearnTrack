// ==================== LEARNTRACK APPLICATION ====================
// Complete JavaScript for LearnTrack - Learning Management System

function getStoredJSON(key, fallback) {
    try {
        const rawValue = localStorage.getItem(key);
        if (!rawValue) return fallback;
        return JSON.parse(rawValue);
    } catch (error) {
        console.warn(`Invalid JSON in localStorage for key "${key}". Resetting value.`, error);
        localStorage.removeItem(key);
        return fallback;
    }
}

let weeklyTrendChartInstance = null;
let categorySplitChartInstance = null;
let schedulerMonthDate = new Date();
let reminderIntervalId = null;
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';
const NOTIFICATIONS_STORAGE_KEY = 'growlogNotifications';
const REMINDER_STATE_STORAGE_KEY = 'growlogReminderState';
const NOTIFICATION_PERMISSION_PROMPTED_KEY = 'growlogNotificationPermissionPrompted';
const NOTIFICATION_PERMISSION_WELCOME_KEY = 'growlogNotificationWelcomeShown';

function normalizeApiBaseUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url.trim().replace(/\/+$/, '');
}

let API_BASE_URL = normalizeApiBaseUrl(localStorage.getItem('apiBaseUrl')) || DEFAULT_API_BASE_URL;

function getApiBaseUrlCandidates() {
    const candidates = [
        API_BASE_URL,
        DEFAULT_API_BASE_URL,
        'http://localhost:8000'
    ].map(normalizeApiBaseUrl).filter(Boolean);

    return [...new Set(candidates)];
}

function getAuthToken() {
    return localStorage.getItem('authToken') || '';
}

function toDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseAppDate(dateInput) {
    if (dateInput instanceof Date) {
        return new Date(dateInput.getTime());
    }

    if (typeof dateInput === 'number') {
        return new Date(dateInput);
    }

    if (typeof dateInput !== 'string') {
        return new Date(dateInput);
    }

    const value = dateInput.trim();
    if (!value) return new Date(NaN);

    // Date-only strings should be treated as local calendar date.
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
        const year = Number(dateOnlyMatch[1]);
        const month = Number(dateOnlyMatch[2]) - 1;
        const day = Number(dateOnlyMatch[3]);
        return new Date(year, month, day, 12, 0, 0, 0);
    }

    // Naive datetime from backend (no timezone) is treated as UTC.
    const hasExplicitTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
    const looksLikeDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
    if (looksLikeDateTime && !hasExplicitTimezone) {
        return new Date(`${value}Z`);
    }

    return new Date(value);
}

function formatDateOnly(dateInput) {
    const value = parseAppDate(dateInput);
    if (Number.isNaN(value.getTime())) return '';
    return value.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatDateTime(dateInput) {
    if (!dateInput) return '';
    const value = parseAppDate(dateInput);
    if (Number.isNaN(value.getTime())) return '';
    return value.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function isLegacyDefaultTaskTitle(title) {
    const normalized = String(title || '').trim().toLowerCase();
    return normalized === 'random5' || normalized === 'random 5';
}

function parseJwtPayload(token) {
    try {
        const base64Url = token.split('.')[1];
        if (!base64Url) return null;
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + (4 - (base64.length % 4 || 4)) % 4, '=');
        return JSON.parse(atob(padded));
    } catch (error) {
        console.warn('Failed to parse JWT token payload.', error);
        return null;
    }
}

function serializeNotes(details) {
    try {
        return JSON.stringify(details);
    } catch {
        return details?.reflection || '';
    }
}

function deserializeNotes(notesText) {
    if (!notesText) return {};
    try {
        const parsed = JSON.parse(notesText);
        return typeof parsed === 'object' && parsed ? parsed : { reflection: notesText };
    } catch {
        return { reflection: notesText };
    }
}

function normalizeEntryType(entryType) {
    return String(entryType || '').toLowerCase() === 'learned' ? 'learned' : 'log';
}

function inferEntryType(details, backendItem) {
    const declared = normalizeEntryType(details?.entryType);
    if (details?.entryType) return declared;

    const topic = String(details?.topic || '').trim();
    const reflection = String(details?.reflection || '').trim();
    const proof = String(details?.proof || '').trim();
    const minutesSpent = Number(backendItem?.minutes_spent || 0);

    if (!topic && reflection && !proof && minutesSpent === 60) {
        return 'learned';
    }

    return 'log';
}

function dedupeMyLogsSections() {
    const currentPage = (window.location.pathname.split('/').pop() || '').toLowerCase();
    if (currentPage !== 'history.html') return;

    const planCards = document.querySelectorAll('.today-plan-card');
    if (planCards.length > 1) {
        planCards.forEach((card, index) => {
            if (index > 0) {
                card.remove();
            }
        });
    }

    const quickLogCards = document.querySelectorAll('.quick-log-card');
    if (quickLogCards.length > 1) {
        quickLogCards.forEach((card, index) => {
            if (index > 0) {
                card.remove();
            }
        });
    }
}

function updateLandingNavbarAuthState() {
    const navLinks = document.querySelector('.navbar .nav-links');
    if (!navLinks) return;

    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const currentUser = getStoredJSON('currentUser', null);
    const authToken = getAuthToken();

    const loginLink = navLinks.querySelector('.btn-nav-login');
    const signupLink = navLinks.querySelector('.btn-nav-signup');

    if (!(isLoggedIn && currentUser && authToken)) {
        // Ensure Login / Sign Up are visible for logged-out users
        if (!loginLink) {
            const loginEl = document.createElement('a');
            loginEl.href = 'login.html';
            loginEl.className = 'btn-nav-login';
            loginEl.textContent = 'Log In';
            navLinks.appendChild(loginEl);
        }

        if (!signupLink) {
            const signupEl = document.createElement('a');
            signupEl.href = 'signup.html';
            signupEl.className = 'btn-nav-signup';
            signupEl.textContent = 'Sign Up';
            navLinks.appendChild(signupEl);
        }

        navLinks.querySelectorAll('[data-auth-only="true"]').forEach(el => el.remove());
        return;
    }

    // Hide Login / Sign Up when authenticated
    if (loginLink) loginLink.remove();
    if (signupLink) signupLink.remove();

    if (navLinks.querySelector('[data-auth-only="true"]')) return;

    const dashboardLink = document.createElement('a');
    dashboardLink.href = 'dashboard.html';
    dashboardLink.textContent = 'Dashboard';
    dashboardLink.setAttribute('data-auth-only', 'true');

    const logsLink = document.createElement('a');
    logsLink.href = 'history.html';
    logsLink.textContent = 'My Logs';
    logsLink.setAttribute('data-auth-only', 'true');

    const logoutLink = document.createElement('a');
    logoutLink.href = '#';
    logoutLink.className = 'btn-nav-login';
    logoutLink.textContent = 'Logout';
    logoutLink.setAttribute('data-auth-only', 'true');
    logoutLink.addEventListener('click', function(event) {
        event.preventDefault();
        logout();
    });

    navLinks.appendChild(dashboardLink);
    navLinks.appendChild(logsLink);
    navLinks.appendChild(logoutLink);
}

async function apiRequest(endpoint, options = {}) {
    const candidates = getApiBaseUrlCandidates();
    let lastNetworkError = null;

    for (const baseUrl of candidates) {
        let response;
        try {
            response = await fetch(`${baseUrl}${endpoint}`, options);
        } catch (networkError) {
            lastNetworkError = networkError;
            continue;
        }

        if (!response.ok) {
            let message = `Request failed (${response.status})`;
            let errorDetail = '';
            try {
                const errorData = await response.json();
                errorDetail = (errorData.detail || errorData.message || '').toString();
                message = errorDetail || message;
            } catch {
                // Ignore parse failure and keep fallback message.
            }

            const isInvalidAuth = response.status === 401 && /invalid authentication credentials/i.test(errorDetail || message);
            if (isInvalidAuth) {
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('currentUser');
                localStorage.removeItem('userEmail');
                localStorage.removeItem('authToken');
                localStorage.removeItem('currentTrackId');
                throw new Error('Session expired. Please login again.');
            }

            throw new Error(message);
        }

        if (baseUrl !== API_BASE_URL) {
            API_BASE_URL = baseUrl;
            localStorage.setItem('apiBaseUrl', baseUrl);
        }

        if (response.status === 204) return null;
        return response.json();
    }

    console.error('Network error while calling API endpoint:', endpoint, lastNetworkError);
    throw new Error('Failed to fetch. Please make sure backend server is running on http://127.0.0.1:8000 (or localhost:8000).');
}

async function fetchCurrentUserFromToken(token) {
    const payload = parseJwtPayload(token);
    const userId = payload?.sub;
    if (!userId) {
        throw new Error('Unable to identify user from login token');
    }

    return apiRequest(`/users/${userId}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
}

async function ensurePrimaryTrack(userId, token) {
    const authHeaders = { Authorization: `Bearer ${token}` };
    const existingTrackId = localStorage.getItem('currentTrackId');
    if (existingTrackId) {
        return Number(existingTrackId);
    }

    const tracks = await apiRequest(`/users/${userId}/tracks`, {
        headers: authHeaders
    });

    if (Array.isArray(tracks) && tracks.length > 0) {
        localStorage.setItem('currentTrackId', String(tracks[0].id));
        return tracks[0].id;
    }

    const today = new Date();
    const ninetyDaysLater = new Date(today);
    ninetyDaysLater.setDate(today.getDate() + 90);

    const createdTrack = await apiRequest(`/users/${userId}/tracks`, {
        method: 'POST',
        headers: {
            ...authHeaders,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: 'My Learning Journey',
            start_date: toDateString(today),
            end_date: toDateString(ninetyDaysLater)
        })
    });

    localStorage.setItem('currentTrackId', String(createdTrack.id));
    return createdTrack.id;
}

async function syncLogsFromBackend() {
    const token = getAuthToken();
    const currentUser = getStoredJSON('currentUser', null);
    if (!token || !currentUser?.id) return;

    const trackId = await ensurePrimaryTrack(currentUser.id, token);
    const backendLogs = await apiRequest(`/logs/${trackId}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const mappedLogs = (backendLogs || []).map(item => {
        const details = deserializeNotes(item.notes);
        const entryType = inferEntryType(details, item);
        return {
            id: item.id,
            category: details.category || 'Other',
            topic: details.topic || '',
            duration: Number(((item.minutes_spent || 0) / 60).toFixed(2)),
            reflection: details.reflection || '',
            proof: details.proof || '',
            date: item.date,
            createdAt: item.created_at || item.date,
            completed: Boolean(item.completed),
            entryType
        };
    });

    localStorage.setItem('learningLogs', JSON.stringify(mappedLogs));
}

async function createOrMergeLog(trackId, payload, token) {
    return apiRequest(`/logs/${trackId}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
}

function getCompletedAiLogMap() {
    return getStoredJSON('completedAiLogMap', {});
}

function saveCompletedAiLogMap(map) {
    localStorage.setItem('completedAiLogMap', JSON.stringify(map || {}));
}

async function completeLogWithAi(logId, token) {
    if (!logId) return null;

    const headers = {
        Authorization: `Bearer ${token}`
    };

    const endpointAttempts = [
        `/logs/${logId}/complete`,
        `/logs/logs/${logId}/complete`
    ];

    let lastError = null;
    for (const endpoint of endpointAttempts) {
        try {
            return await apiRequest(endpoint, {
                method: 'POST',
                headers
            });
        } catch (error) {
            const detail = String(error?.message || '').toLowerCase();
            const maybeRouteMismatch = detail.includes('404') || detail.includes('not found') || detail.includes('405') || detail.includes('method not allowed');
            lastError = error;
            if (!maybeRouteMismatch) {
                throw error;
            }
        }
    }

    throw lastError || new Error('Unable to complete log');
}

async function deleteLogEntry(logId) {
    if (!logId) return;

    const confirmed = confirm('Delete this log? This action cannot be undone.');
    if (!confirmed) return;

    const token = getAuthToken();
    const currentUser = getStoredJSON('currentUser', null);
    if (!token || !currentUser?.id) {
        showToast('⚠️ Please login first');
        return;
    }

    const removeDeletedLogFromLocalState = () => {
        const logs = getStoredJSON('learningLogs', []);
        const remainingLogs = logs.filter(log => Number(log.id) !== Number(logId));
        localStorage.setItem('learningLogs', JSON.stringify(remainingLogs));

        const completionMap = getStoredJSON('dailyPlanLogCompletion', {});
        const cleanedCompletionMap = {};
        Object.entries(completionMap).forEach(([key, value]) => {
            if (!String(key).startsWith(`${logId}-`)) {
                cleanedCompletionMap[key] = value;
            }
        });
        localStorage.setItem('dailyPlanLogCompletion', JSON.stringify(cleanedCompletionMap));
    };

    try {
        const headers = {
            Authorization: `Bearer ${token}`
        };

        const deleteAttempts = [
            { endpoint: `/logs/${logId}`, method: 'DELETE' },
            { endpoint: `/logs/logs/${logId}`, method: 'DELETE' },
            { endpoint: `/logs/${logId}/delete`, method: 'POST' },
            { endpoint: `/logs/logs/${logId}/delete`, method: 'POST' }
        ];
        let deleteSucceeded = false;
        let lastDeleteError = null;

        for (const attempt of deleteAttempts) {
            try {
                await apiRequest(attempt.endpoint, {
                    method: attempt.method,
                    headers
                });
                deleteSucceeded = true;
                break;
            } catch (error) {
                const detail = String(error?.message || '').toLowerCase();
                const maybeRouteMismatch =
                    detail.includes('404')
                    || detail.includes('not found')
                    || detail.includes('405')
                    || detail.includes('method not allowed');

                lastDeleteError = error;
                if (!maybeRouteMismatch) {
                    throw error;
                }
            }
        }

        if (!deleteSucceeded) {
            throw lastDeleteError || new Error('Unable to delete log');
        }

        removeDeletedLogFromLocalState();

        try {
            await syncLogsFromBackend();
        } catch (syncError) {
            console.warn('Delete succeeded but sync failed; using local state.', syncError);
        }

        refreshDashboardWidgets();
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            displayFilteredLogs(categoryFilter.value || 'All');
        }
        showToast('🗑️ Log deleted successfully');
    } catch (error) {
        showToast(`❌ ${error.message}`);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ LearnTrack - DOM Loaded - Script Initialized');
    dedupeMyLogsSections();
    updateLandingNavbarAuthState();
    initializeTaskNotifications();
    
    // Initialize user profile and theme
    initializeUserProfile();
    initializeTheme();
    setupThemeToggleListeners();
    setDashboardDate();
    
    // Landing page - No specific functionality needed

    // ==================== SIGNUP PAGE ====================

    const signupForm = document.getElementById('signupForm');
    
    if (signupForm) {
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const name = document.getElementById('signupName')?.value.trim();
            const email = document.getElementById('signupEmail')?.value.trim();
            const password = document.getElementById('signupPassword')?.value;
            const confirmPassword = document.getElementById('signupConfirmPassword')?.value;

            // Validation
            if (!name || !email || !password || !confirmPassword) {
                showToast('❌ Please fill in all fields');
                return;
            }

            if (password.length < 6) {
                showToast('❌ Password must be at least 6 characters');
                return;
            }

            if (password !== confirmPassword) {
                showToast('❌ Passwords do not match');
                return;
            }

            if (!email.includes('@')) {
                showToast('❌ Please enter a valid email');
                return;
            }

            try {
                await apiRequest('/users/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name,
                        email,
                        password
                    })
                });

                showToast('✅ Account created! Redirecting to login...');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
            } catch (error) {
                showToast(`❌ ${error.message}`);
            }
        });
    }

    // ==================== LOGIN PAGE ====================

    const loginForm = document.getElementById('loginForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('loginEmail')?.value.trim();
            const password = document.getElementById('loginPassword')?.value;

            if (!email || !password) {
                showToast('❌ Please fill in all fields');
                return;
            }

            try {
                const formData = new URLSearchParams();
                formData.append('username', email);
                formData.append('password', password);

                const authData = await apiRequest('/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: formData.toString()
                });

                const token = authData.access_token;
                if (!token) {
                    throw new Error('No access token returned from server');
                }

                const user = await fetchCurrentUserFromToken(token);

                localStorage.setItem('authToken', token);
                localStorage.setItem('currentUser', JSON.stringify(user));
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('userEmail', user.email || email);

                await ensurePrimaryTrack(user.id, token);
                await syncLogsFromBackend();

                showToast('✅ Login successful! Redirecting...');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1200);
            } catch (error) {
                showToast(`❌ ${error.message}`);
            }
        });
    }

    // ==================== ADD LEARNING PAGE ====================

    const logForm = document.getElementById('logForm');
    if (logForm) {
        const logDateInput = document.getElementById('logDate');
        if (logDateInput && !logDateInput.value) {
            logDateInput.value = toDateString(new Date());
        }

        // Update form progress as user fills fields
        const formInputs = logForm.querySelectorAll('input, select, textarea');
        formInputs.forEach(input => {
            input.addEventListener('change', updateFormProgress);
            input.addEventListener('input', updateFormProgress);
        });

        logForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const category = document.getElementById('category')?.value;
            const topic = document.getElementById('topic')?.value?.trim();
            const duration = document.getElementById('duration')?.value;
            const logDate = document.getElementById('logDate')?.value;
            const reflection = document.getElementById('reflection')?.value?.trim();
            const proof = document.getElementById('learningDate')?.value?.trim();

            // Validation
            if (!category || !topic || !duration || !logDate) {
                showToast('❌ Please fill in all required fields');
                return;
            }

            if (parseFloat(duration) <= 0) {
                showToast('❌ Duration must be greater than 0');
                return;
            }

            const token = getAuthToken();
            const currentUser = getStoredJSON('currentUser', null);
            if (!token || !currentUser?.id) {
                showToast('⚠️ Please login first');
                return;
            }

            try {
                const trackId = await ensurePrimaryTrack(currentUser.id, token);
                const payloadDate = logDate;
                const durationHours = parseFloat(duration) || 0;

                await createOrMergeLog(
                    trackId,
                    {
                        date: payloadDate,
                        minutes_spent: Math.max(1, Math.round(durationHours * 60)),
                        notes: serializeNotes({ category, topic, reflection, proof, entryType: 'log' })
                    },
                    token
                );

                await syncLogsFromBackend();
            } catch (error) {
                showToast(`❌ ${error.message}`);
                return;
            }

            // Show success toast
            showToast('✨ What You Have Learned ? saved successfully!');
            
            // Show celebration notification
            const celebrationToast = document.getElementById('celebrationToast');
            if (celebrationToast) {
                celebrationToast.style.display = 'flex';
                setTimeout(() => {
                    celebrationToast.style.display = 'none';
                }, 3000);
            }

            // Update goal progress
            updateWeeklyGoal();
            updateDashboardStats();
            updateStreakDisplay();
            
            setTimeout(() => {
                logForm.reset();
                const dateInput = document.getElementById('logDate');
                if (dateInput) {
                    dateInput.value = toDateString(new Date());
                }
                updateFormProgress();
            }, 500);
        });

        // Load initial stats and custom categories
        updateWeeklyGoal();
        updateDashboardStats();
        updateStreakDisplay();
        updateCategorySelect();
        updateDurationSelect();
    }

    function updateStreakDisplay() {
        const streakDisplay = document.getElementById('streakDisplay');
        if (streakDisplay) {
            const streak = calculateCurrentStreak();
            streakDisplay.textContent = streak;
        }

        const totalHoursEl = document.getElementById('totalHours');
        if (totalHoursEl) {
            totalHoursEl.textContent = calculateTotalHours();
        }

        const completionRateEl = document.getElementById('completionRate');
        if (completionRateEl) {
            const logs = getStoredJSON('learningLogs', []);
            const rate = logs.length > 0 ? Math.min(Math.round((logs.length / 10) * 100), 100) : 0;
            completionRateEl.textContent = rate;
        }
    }

    function updateFormProgress() {
        const category = document.getElementById('category')?.value;
        const topic = document.getElementById('topic')?.value?.trim();
        const duration = document.getElementById('duration')?.value;
        const logDate = document.getElementById('logDate')?.value;
        const reflection = document.getElementById('reflection')?.value?.trim();

        let filled = 0;
        if (category) filled++;
        if (topic) filled++;
        if (duration) filled++;
        if (logDate) filled++;
        if (reflection) filled++;

        const progress = (filled / 5) * 100;
        const progressFill = document.getElementById('formProgress');
        if (progressFill) {
            progressFill.style.width = progress + '%';
        }
    }

    function updateWeeklyGoal() {
        const goalProgress = document.getElementById('goalProgress');
        const goalFill = document.getElementById('goalFill');
        
        if (goalProgress && goalFill) {
            let logs = getStoredJSON('learningLogs', []);
            
            // Count logs from this week
            const today = new Date();
            const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
            const weekLogs = logs.filter(log => parseAppDate(log.date) >= weekStart).length;
            
            const goal = Math.min(weekLogs, 5);
            goalProgress.textContent = `${goal}/5`;
            goalFill.style.width = (goal / 5) * 100 + '%';
        }
    }

    function updateDashboardStats() {
        const logs = getStoredJSON('learningLogs', []);
        
        // Update total hours
        const totalHours = document.getElementById('totalHours');
        if (totalHours && logs.length > 0) {
            const total = logs.reduce((sum, log) => sum + log.duration, 0);
            const hours = Math.floor(total);
            const minutes = Math.round((total - hours) * 60);
            totalHours.textContent = `${hours}h ${minutes}m`;
        }

        // Update streak
        const streakDisplay = document.getElementById('streakDisplay');
        if (streakDisplay) {
            const streak = calculateStreak(logs);
            streakDisplay.textContent = `${streak} Days`;
        }

        // Update completion rate
        const completionRate = document.getElementById('completionRate');
        if (completionRate && logs.length > 0) {
            const rate = Math.min(Math.round((logs.length / 10) * 100), 100);
            completionRate.textContent = `${rate}%`;
        }
    }

    function calculateStreak(logs) {
        if (logs.length === 0) return 0;
        
        const logsByDate = {};
        logs.forEach(log => {
            const dateKey = toDateKey(log.date);
            if (dateKey) {
                logsByDate[dateKey] = true;
            }
        });

        let streak = 0;
        let currentDate = new Date();
        
        while (true) {
            const dateStr = toDateKey(currentDate);
            if (logsByDate[dateStr]) {
                streak++;
                currentDate.setDate(currentDate.getDate() - 1);
            } else {
                break;
            }
        }
        
        return streak;
    }

    // ==================== DASHBOARD PAGE ====================
    // Check login status - only for dashboard pages
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const currentUser = getStoredJSON('currentUser', null);

    if (!isLoggedIn || !currentUser) {
        // Only redirect if on dashboard pages
        const currentPage = window.location.pathname.split('/').pop().toLowerCase();
        const protectedPages = ['dashboard.html', 'log.html', 'history.html', 'settings.html'];
        const isProtectedPage = protectedPages.includes(currentPage);
        
        if (isProtectedPage) {
            showToast('⚠️ Please login first');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        }
    } else {
        syncLogsFromBackend()
            .then(() => {
                refreshDashboardWidgets();
            })
            .catch(error => {
                console.warn('Failed to sync logs from backend:', error.message);
            });
    }

    // Display user name on dashboard
    const userNameElement = document.querySelector('.user-name');
    if (userNameElement && currentUser) {
        userNameElement.textContent = currentUser.name;
    }

    // Load and display dashboard data
    refreshDashboardWidgets();
    initializeScheduler();
    renderTodayLearningPlan();

    // Quick log form handler on dashboard
    const quickLogForm = document.getElementById('quickLogForm');
    if (quickLogForm) {
        quickLogForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const quickCategoryEl = document.getElementById('quickCategory');
            if (!quickCategoryEl) {
                showToast('⚠️ Quick log category field is missing');
                return;
            }
            const category = quickCategoryEl.value;
            const reflection = document.getElementById('quickTopic')?.value?.trim();

            if (!category || !reflection) {
                showToast('⚠️ Please fill all fields');
                return;
            }

            const token = getAuthToken();
            const currentUser = getStoredJSON('currentUser', null);
            if (!token || !currentUser?.id) {
                showToast('⚠️ Please login first');
                return;
            }

            try {
                const trackId = await ensurePrimaryTrack(currentUser.id, token);
                await createOrMergeLog(
                    trackId,
                    {
                        date: new Date().toISOString().split('T')[0],
                        minutes_spent: 60,
                        notes: serializeNotes({
                            category,
                            topic: '',
                            reflection,
                            proof: '',
                            entryType: 'learned'
                        })
                    },
                    token
                );

                await syncLogsFromBackend();
            } catch (error) {
                showToast(`❌ ${error.message}`);
                return;
            }

            // Reset form and reload
            quickLogForm.reset();
            showToast('✅ What You Have Learned ? saved successfully!');
            refreshDashboardWidgets();
        });
    }

    // Logout button
    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            if (confirm('Are you sure you want to logout?')) {
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('currentUser');
                localStorage.removeItem('userEmail');
                localStorage.removeItem('authToken');
                localStorage.removeItem('currentTrackId');
                showToast('✅ Logged out successfully!');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1000);
            }
        });
    }

    // History page - Category filter
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', function() {
            displayFilteredLogs(this.value);
        });
        // Display all logs on first load
        displayFilteredLogs('All');
    }

    // Sidebar navigation
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href && href !== '#') {
                window.location.href = href;
            }
        });
    });
});

// Logout function (called from HTML onclick handlers)
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentTrackId');
        showToast('✅ Logged out successfully!');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease-in-out';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

function getStoredNotifications() {
    return getStoredJSON(NOTIFICATIONS_STORAGE_KEY, []);
}

function saveStoredNotifications(items) {
    const normalized = Array.isArray(items) ? items.slice(0, 120) : [];
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(normalized));
}

function getReminderState() {
    return getStoredJSON(REMINDER_STATE_STORAGE_KEY, {});
}

function saveReminderState(state) {
    localStorage.setItem(REMINDER_STATE_STORAGE_KEY, JSON.stringify(state || {}));
}

function shouldSendReminder(reminderKey, cooldownMinutes) {
    if (!reminderKey) return true;

    const state = getReminderState();
    const now = Date.now();
    const cooldownMs = Math.max(1, Number(cooldownMinutes) || 1) * 60 * 1000;
    const lastSent = Number(state[reminderKey] || 0);

    if (lastSent && now - lastSent < cooldownMs) {
        return false;
    }

    state[reminderKey] = now;
    saveReminderState(state);
    return true;
}

function sendBrowserNotification(title, message) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        try {
            new Notification(title, { body: message });
        } catch (error) {
            console.warn('Browser notification failed:', error);
        }
    }
}

function updateNotificationPermissionHint() {
    const permissionHint = document.getElementById('notificationPermissionHint');
    if (!permissionHint) return;

    if (typeof window === 'undefined' || !('Notification' in window)) {
        permissionHint.innerHTML = '<p>Browser notifications are not supported on this device.</p>';
        return;
    }

    if (Notification.permission === 'granted') {
        permissionHint.innerHTML = '<p>✅ Browser notifications are enabled (outside-site alerts allowed).</p>';
    } else if (Notification.permission === 'denied') {
        permissionHint.innerHTML = '<p>❌ Notifications are blocked in browser settings. Enable them to receive reminders outside the website.</p>';
    } else {
        permissionHint.innerHTML = '<p>🔕 Click Enable to allow browser reminders outside the website.</p>';
    }
}

async function requestBrowserNotificationPermission(force = false) {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';

    const alreadyPrompted = localStorage.getItem(NOTIFICATION_PERMISSION_PROMPTED_KEY) === 'true';
    if (!force && alreadyPrompted) {
        updateNotificationPermissionHint();
        return Notification.permission;
    }

    if (Notification.permission === 'default') {
        try {
            const permission = await Notification.requestPermission();
            localStorage.setItem(NOTIFICATION_PERMISSION_PROMPTED_KEY, 'true');
            updateNotificationPermissionHint();

            if (permission === 'granted' && localStorage.getItem(NOTIFICATION_PERMISSION_WELCOME_KEY) !== 'true') {
                sendBrowserNotification('GrowLog Notifications Enabled', 'You will receive reminders for pending, current, and upcoming tasks.');
                localStorage.setItem(NOTIFICATION_PERMISSION_WELCOME_KEY, 'true');
            }

            return permission;
        } catch (error) {
            console.warn('Notification permission request failed:', error);
            updateNotificationPermissionHint();
            return 'default';
        }
    }

    updateNotificationPermissionHint();
    return Notification.permission;
}

function addUserNotification({ type = 'info', title, message, reminderKey = '', cooldownMinutes = 180, browser = true }) {
    if (!title || !message) return;
    if (!shouldSendReminder(reminderKey, cooldownMinutes)) return;

    const notifications = getStoredNotifications();
    notifications.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        title,
        message,
        createdAt: new Date().toISOString(),
        read: false
    });

    saveStoredNotifications(notifications);
    updateNotificationUI();
    showToast(`🔔 ${title}`);

    if (browser) {
        sendBrowserNotification(title, message);
    }
}

function updateNotificationUI() {
    const notifications = getStoredNotifications();
    const unreadCount = notifications.filter(item => !item.read).length;
    const badge = document.querySelector('.notification-badge');

    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
            badge.style.display = 'flex';
        } else {
            badge.textContent = '0';
            badge.style.display = 'none';
        }
    }

    const list = document.getElementById('notificationList');
    if (!list) return;

    if (notifications.length === 0) {
        list.innerHTML = '<p class="notification-empty">No notifications yet ✨</p>';
        return;
    }

    list.innerHTML = notifications.slice(0, 25).map(item => {
        const timeText = formatDateTime(item.createdAt);
        return `
            <div class="notification-item ${item.read ? '' : 'is-unread'}">
                <div class="notification-item-head">
                    <strong>${item.title}</strong>
                    <span>${timeText}</span>
                </div>
                <p>${item.message}</p>
            </div>
        `;
    }).join('');
}

function markNotificationsAsRead() {
    const notifications = getStoredNotifications();
    if (notifications.length === 0) return;

    const updated = notifications.map(item => ({ ...item, read: true }));
    saveStoredNotifications(updated);
    updateNotificationUI();
}

function setupNotificationPanel() {
    const button = document.querySelector('.notification-btn');
    if (!button) return;

    if (!button.querySelector('.notification-badge')) {
        const badge = document.createElement('span');
        badge.className = 'notification-badge';
        badge.textContent = '0';
        badge.style.display = 'none';
        button.appendChild(badge);
    }

    const existingPanel = document.getElementById('notificationPanel');
    if (!existingPanel) {
        const panel = document.createElement('div');
        panel.id = 'notificationPanel';
        panel.className = 'notification-panel';
        panel.innerHTML = `
            <div class="notification-panel-header">
                <h4>Notifications</h4>
                <div class="notification-actions-inline">
                    <button type="button" id="enableBrowserNotifications" class="notif-action-btn">Enable</button>
                    <button type="button" id="markAllNotificationsRead" class="notif-action-btn">Mark all read</button>
                </div>
            </div>
            <div class="notification-browser-permission" id="notificationPermissionHint"></div>
            <div class="notification-panel-list" id="notificationList"></div>
        `;
        document.body.appendChild(panel);
    }

    const panel = document.getElementById('notificationPanel');
    const markReadBtn = document.getElementById('markAllNotificationsRead');
    const enablePermissionBtn = document.getElementById('enableBrowserNotifications');

    const positionNotificationPanel = () => {
        if (!panel || !button) return;

        const rect = button.getBoundingClientRect();
        const panelWidth = 360;
        const viewportPadding = 12;

        let left = rect.right - panelWidth;
        left = Math.max(viewportPadding, left);
        left = Math.min(left, window.innerWidth - panelWidth - viewportPadding);

        panel.style.top = `${Math.round(rect.bottom + 10)}px`;
        panel.style.left = `${Math.round(left)}px`;
    };

    if (markReadBtn && !markReadBtn.dataset.bound) {
        markReadBtn.dataset.bound = '1';
        markReadBtn.addEventListener('click', function(event) {
            event.preventDefault();
            markNotificationsAsRead();
        });
    }

    if (enablePermissionBtn && !enablePermissionBtn.dataset.bound) {
        enablePermissionBtn.dataset.bound = '1';
        enablePermissionBtn.addEventListener('click', async function(event) {
            event.preventDefault();
            await requestBrowserNotificationPermission(true);
            updateNotificationPermissionHint();
            showToast('🔔 Notification permission updated');
        });
    }

    if (!button.dataset.bound) {
        button.dataset.bound = '1';
        button.addEventListener('click', async function(event) {
            event.preventDefault();
            event.stopPropagation();
            if (!panel) return;

            positionNotificationPanel();

            panel.classList.toggle('open');
            if (panel.classList.contains('open')) {
                await requestBrowserNotificationPermission(true);
                updateNotificationPermissionHint();
                markNotificationsAsRead();
            }
        });

        window.addEventListener('resize', function() {
            if (panel?.classList.contains('open')) {
                positionNotificationPanel();
            }
        });

        window.addEventListener('scroll', function() {
            if (panel?.classList.contains('open')) {
                positionNotificationPanel();
            }
        }, true);
    }

    document.addEventListener('click', function(event) {
        const activePanel = document.getElementById('notificationPanel');
        if (!activePanel || !activePanel.classList.contains('open')) return;
        if (activePanel.contains(event.target) || button.contains(event.target)) return;
        activePanel.classList.remove('open');
    });

    updateNotificationPermissionHint();
    updateNotificationUI();
}

function runTaskReminderChecks() {
    if (localStorage.getItem('isLoggedIn') !== 'true') return;

    const now = new Date();
    const todayKey = toDateKey(now);
    const startOfToday = new Date(`${todayKey}T00:00:00`);
    const endOfUpcomingWindow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));

    const schedules = getSchedules();
    const pendingTasks = [];
    const currentTasks = [];
    const upcomingTasks = [];

    schedules.forEach(task => {
        if (task.completed) return;
        const taskDateTime = new Date(`${task.date}T${task.time || '23:59'}`);
        if (Number.isNaN(taskDateTime.getTime())) return;

        if (taskDateTime <= now) {
            pendingTasks.push(task);
        }

        if (task.date === todayKey && taskDateTime >= now && taskDateTime - now <= 2 * 60 * 60 * 1000) {
            currentTasks.push(task);
        }

        if (taskDateTime > startOfToday && taskDateTime <= endOfUpcomingWindow) {
            upcomingTasks.push(task);
        }
    });

    if (pendingTasks.length > 0) {
        const message = `${pendingTasks.length} task(s) are pending. Please complete and tick them.`;
        addUserNotification({
            type: 'pending',
            title: 'Pending Task Reminder',
            message,
            reminderKey: `pending-summary-${todayKey}-${pendingTasks.length}`,
            cooldownMinutes: 120
        });
    }

    if (currentTasks.length > 0) {
        const message = `${currentTasks.length} task(s) are due soon today.`;
        addUserNotification({
            type: 'current',
            title: 'Current Task Reminder',
            message,
            reminderKey: `current-summary-${todayKey}-${currentTasks.length}`,
            cooldownMinutes: 90
        });
    }

    if (upcomingTasks.length > 0) {
        const message = `${upcomingTasks.length} upcoming task(s) are scheduled in the next 3 days.`;
        addUserNotification({
            type: 'upcoming',
            title: 'Upcoming Tasks Reminder',
            message,
            reminderKey: `upcoming-summary-${todayKey}-${upcomingTasks.length}`,
            cooldownMinutes: 12 * 60
        });
    }

    const logs = getStoredJSON('learningLogs', []);
    const todaysLogs = logs.filter(log => toDateKey(log.date) === todayKey && normalizeEntryType(log.entryType) === 'log');
    const todaysTaskEntries = expandLogsToTaskEntries(todaysLogs)
        .filter(task => !isLegacyDefaultTaskTitle(task.title));

    const pendingLogIds = new Set(
        todaysLogs
            .filter(log => !Boolean(log.completed))
            .map(log => Number(log.id))
            .filter(id => Number.isFinite(id) && id > 0)
    );

    const untickedCount = todaysTaskEntries.filter(task => pendingLogIds.has(Number(task.logId))).length;

    if (untickedCount > 0) {
        addUserNotification({
            type: 'unticked',
            title: 'Tick Completed Logs',
            message: `${untickedCount} logged task(s) are not ticked yet in Today's Learning Plan.`,
            reminderKey: `unticked-summary-${todayKey}-${untickedCount}`,
            cooldownMinutes: 120
        });
    }
}

function initializeTaskNotifications() {
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        updateNotificationUI();
        return;
    }

    setupNotificationPanel();
    requestBrowserNotificationPermission(false).catch(() => {});
    runTaskReminderChecks();

    if (reminderIntervalId) {
        clearInterval(reminderIntervalId);
    }

    reminderIntervalId = setInterval(() => {
        runTaskReminderChecks();
    }, 60 * 1000);
}

// Calculate current streak
function calculateCurrentStreak() {
    const logs = getStoredJSON('learningLogs', []);
    if (logs.length === 0) return 0;

    // Sort logs by date
    const sortedLogs = logs.sort((a, b) => parseAppDate(b.date) - parseAppDate(a.date));
    
    // Get unique dates
    const uniqueDates = [...new Set(sortedLogs.map(log => toDateKey(log.date)).filter(Boolean))].sort((a, b) => parseAppDate(b) - parseAppDate(a));
    
    let streak = 0;
    let currentDate = parseAppDate(new Date());

    for (const date of uniqueDates) {
        const logDate = parseAppDate(date);
        const expectedDate = new Date(currentDate);
        expectedDate.setDate(expectedDate.getDate() - streak);

        if (toDateKey(logDate) === toDateKey(expectedDate)) {
            streak++;
        } else {
            break;
        }
    }

    return streak;
}

// Calculate longest streak
function calculateLongestStreak() {
    const logs = getStoredJSON('learningLogs', []);
    if (logs.length === 0) return 0;

    // Get unique dates sorted
    const uniqueDates = [...new Set(logs.map(log => toDateKey(log.date)).filter(Boolean))].sort();
    
    let maxStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < uniqueDates.length; i++) {
        const prevDate = parseAppDate(uniqueDates[i - 1]);
        const currentDate = parseAppDate(uniqueDates[i]);
        const dayDiff = (currentDate - prevDate) / (1000 * 60 * 60 * 24);

        if (dayDiff === 1) {
            currentStreak++;
            maxStreak = Math.max(maxStreak, currentStreak);
        } else {
            currentStreak = 1;
        }
    }

    return maxStreak;
}

// Count total days learned
function countTotalDaysLearned() {
    const logs = getStoredJSON('learningLogs', []);
    const uniqueDates = new Set(logs.map(log => log.date));
    return uniqueDates.size;
}

// Calculate total hours
function calculateTotalHours() {
    const logs = getStoredJSON('learningLogs', []);
    return logs.reduce((total, log) => total + (parseFloat(log.duration) || 0), 0).toFixed(1);
}

function formatHours(totalHours) {
    const wholeHours = Math.floor(totalHours);
    const minutes = Math.round((totalHours - wholeHours) * 60);

    if (wholeHours === 0) return `${minutes}m`;
    if (minutes === 0) return `${wholeHours}h`;
    return `${wholeHours}h ${minutes}m`;
}

function setDashboardDate() {
    const dateDisplay = document.getElementById('dateDisplay');
    if (!dateDisplay) return;

    const today = new Date();
    dateDisplay.textContent = today.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    });
}

// Count logs by category
function countByCategory(category) {
    const logs = getStoredJSON('learningLogs', []);
    return logs.filter(log => log.category === category).length;
}

// Load and display dashboard statistics
function loadDashboardStats() {
    const logs = getStoredJSON('learningLogs', []);
    const totalHoursNumber = logs.reduce((sum, log) => sum + (parseFloat(log.duration) || 0), 0);

    // Update streak stats
    const streakValue = document.getElementById('currentStreak');
    const currentStreak = calculateCurrentStreak();
    if (streakValue) {
        streakValue.textContent = currentStreak;
    }

    const longestStreakEl = document.getElementById('longestStreak');
    if (longestStreakEl) {
        longestStreakEl.textContent = calculateLongestStreak();
    }

    const activeDaysEl = document.getElementById('activeDays');
    if (activeDaysEl) {
        activeDaysEl.textContent = countTotalDaysLearned();
    }

    const totalHoursEl = document.getElementById('totalHours');
    if (totalHoursEl) {
        totalHoursEl.textContent = formatHours(totalHoursNumber);
    }

    const streakDisplayEl = document.getElementById('streakDisplay');
    if (streakDisplayEl) {
        streakDisplayEl.textContent = `${currentStreak} Days`;
    }

    const totalHoursDisplayEl = document.getElementById('totalHoursDisplay');
    if (totalHoursDisplayEl) {
        totalHoursDisplayEl.textContent = formatHours(totalHoursNumber);
    }

    const completionRateDisplayEl = document.getElementById('completionRateDisplay');
    if (completionRateDisplayEl) {
        const completion = Math.min(Math.round((countTotalDaysLearned() / 30) * 100), 100);
        completionRateDisplayEl.textContent = `${completion}%`;
    }

    const totalLearningDaysEl = document.getElementById('totalLearningDays');
    if (totalLearningDaysEl) {
        totalLearningDaysEl.textContent = countTotalDaysLearned();
    }

    // Update welcome text with username
    const welcomeText = document.getElementById('welcomeText');
    const currentUser = getStoredJSON('currentUser', null);
    if (welcomeText && currentUser) {
        welcomeText.textContent = `Welcome back, ${currentUser.name}!`;
    }

    // Generate dynamic current/previous month heatmaps
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const previousDate = new Date(currentYear, now.getMonth() - 1, 1);
    const previousMonth = previousDate.getMonth() + 1;
    const previousYear = previousDate.getFullYear();

    const currentMonthLabel = document.getElementById('currentMonthLabel');
    if (currentMonthLabel) {
        currentMonthLabel.textContent = now.toLocaleDateString(undefined, { month: 'long' });
    }

    const previousMonthLabel = document.getElementById('previousMonthLabel');
    if (previousMonthLabel) {
        previousMonthLabel.textContent = previousDate.toLocaleDateString(undefined, { month: 'long' });
    }

    generateHeatmap('currentHeatmap', currentMonth, currentYear);
    generateHeatmap('previousHeatmap', previousMonth, previousYear);
}

function toDateKey(dateInput) {
    const date = parseAppDate(dateInput);
    if (Number.isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getLastNDaysLabels(n) {
    const labels = [];
    const keys = [];
    const now = new Date();

    for (let i = n - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        labels.push(date.toLocaleDateString(undefined, { weekday: 'short' }));
        keys.push(toDateKey(date));
    }

    return { labels, keys };
}

function renderDashboardAnalytics() {
    const weeklyCanvas = document.getElementById('weeklyTrendChart');
    const categoryCanvas = document.getElementById('categorySplitChart');
    if (!weeklyCanvas || !categoryCanvas) return;

    if (typeof Chart === 'undefined') {
        console.warn('Chart.js not available. Skipping analytics rendering.');
        return;
    }

    const logs = getStoredJSON('learningLogs', []);
    const { labels, keys } = getLastNDaysLabels(7);

    const byDay = {};
    const byCategory = {};

    logs.forEach(log => {
        const dayKey = toDateKey(log.date);
        const duration = parseFloat(log.duration) || 0;

        if (dayKey) {
            byDay[dayKey] = (byDay[dayKey] || 0) + duration;
        }

        const category = log.category || 'Other';
        byCategory[category] = (byCategory[category] || 0) + duration;
    });

    const trendData = keys.map(key => Number((byDay[key] || 0).toFixed(2)));
    const categoryLabels = Object.keys(byCategory);
    const categoryData = Object.values(byCategory).map(value => Number(value.toFixed(2)));

    const hasCategoryData = categoryData.length > 0;
    const splitLabels = hasCategoryData ? categoryLabels : ['No Data'];
    const splitData = hasCategoryData ? categoryData : [1];

    if (weeklyTrendChartInstance) {
        weeklyTrendChartInstance.destroy();
    }

    if (categorySplitChartInstance) {
        categorySplitChartInstance.destroy();
    }

    const computedStyle = getComputedStyle(document.documentElement);
    const textColor = computedStyle.getPropertyValue('--text-main').trim() || '#1e293b';
    const lightTextColor = computedStyle.getPropertyValue('--text-light').trim() || '#64748b';
    const primaryColor = computedStyle.getPropertyValue('--primary-color').trim() || '#3b82f6';

    weeklyTrendChartInstance = new Chart(weeklyCanvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Hours Learned',
                data: trendData,
                backgroundColor: 'rgba(59,130,246,0.7)',
                borderColor: primaryColor,
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: textColor }
                }
            },
            scales: {
                x: {
                    ticks: { color: lightTextColor },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: lightTextColor },
                    grid: { color: 'rgba(148,163,184,0.2)' }
                }
            }
        }
    });

    categorySplitChartInstance = new Chart(categoryCanvas, {
        type: 'doughnut',
        data: {
            labels: splitLabels,
            datasets: [{
                data: splitData,
                backgroundColor: hasCategoryData
                    ? ['#3b82f6', '#06b6d4', '#6366f1', '#14b8a6', '#8b5cf6', '#0ea5e9']
                    : ['#cbd5e1'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        boxWidth: 12,
                        padding: 12
                    }
                }
            }
        }
    });
}

function getSchedules() {
    const schedules = getStoredJSON('learningSchedule', []);
    const cleaned = schedules.filter(item => !isLegacyDefaultTaskTitle(item?.title));
    if (cleaned.length !== schedules.length) {
        localStorage.setItem('learningSchedule', JSON.stringify(cleaned));
    }
    return cleaned;
}

function saveSchedules(items) {
    localStorage.setItem('learningSchedule', JSON.stringify(items));
}

function refreshDashboardWidgets() {
    loadDashboardStats();
    displayRecentLogs();
    renderDashboardAnalytics();
    renderTodayLearningPlan();
    renderLearningGoals();
    renderQuickLogCategoryOptions();
    updateNotificationUI();
    runTaskReminderChecks();
}

function syncTodayPlanWithTodayLogs() {
    const todayKey = toDateKey(new Date());
    const schedules = getSchedules();
    const todayIndices = [];

    schedules.forEach((item, index) => {
        if (item.date === todayKey) {
            todayIndices.push(index);
        }
    });

    if (todayIndices.length === 0) return;

    const logs = getStoredJSON('learningLogs', []);
    const todaysLogCount = logs.filter(log => toDateKey(log.date) === todayKey).length;
    if (todaysLogCount <= 0) return;

    const completedAlready = todayIndices.filter(index => schedules[index].completed).length;
    if (completedAlready >= Math.min(todaysLogCount, todayIndices.length)) return;

    let toMark = Math.min(todaysLogCount, todayIndices.length) - completedAlready;
    const updated = schedules.map(item => ({ ...item }));

    for (const index of todayIndices) {
        if (toMark === 0) break;
        if (!updated[index].completed) {
            updated[index].completed = true;
            toMark--;
        }
    }

    saveSchedules(updated);
}

function renderQuickLogCategoryOptions() {
    const quickCategory = document.getElementById('quickCategory');
    if (!quickCategory) return;

    const selectedValue = quickCategory.value;
    const customCategories = getCustomCategories();
    const logs = getStoredJSON('learningLogs', []);
    const categoriesFromLogs = [...new Set(logs.map(log => (log.category || '').trim()).filter(Boolean))];
    const categories = [...new Set([...customCategories, ...categoriesFromLogs])].sort((a, b) => a.localeCompare(b));

    quickCategory.innerHTML = '<option value="">Select Category</option>';

    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        quickCategory.appendChild(option);
    });

    if (selectedValue && categories.includes(selectedValue)) {
        quickCategory.value = selectedValue;
    }
}

function expandLogsToTaskEntries(logs) {
    const splitTaskText = (text) => {
        return String(text || '')
            // Split numbered items like "1. ... 2. ..." into separate lines
            .replace(/\s(?=\d+\.)/g, '\n')
            .split(/\r?\n+/)
            .map(line => line.replace(/^\d+\.\s*/, '').trim())
            .filter(Boolean);
    };

    return [...logs]
        .flatMap(log => {
            const topicParts = splitTaskText(log.topic);
            const reflectionParts = splitTaskText(log.reflection);
            const rawParts = [...topicParts, ...reflectionParts];
            const uniqueParts = [...new Set(rawParts)];

            const titles = uniqueParts.length > 0
                ? uniqueParts
                : [(log.category || 'Learning Session').trim()];

            return titles.map((title, index) => ({
                key: String(`${log.id || `${log.date}-task`}-${index}`),
                logId: log.id,
                title,
                date: log.date,
                category: log.category || 'Other',
                duration: parseFloat(log.duration) || 0,
                createdAt: log.createdAt || log.date
            }));
        })
        .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
}

function renderTodayLearningPlan() {
    const planItems = document.getElementById('planItems');
    const summary = document.getElementById('planSummaryMessage');
    if (!planItems) return;

    const todayKey = toDateKey(new Date());
    const logs = getStoredJSON('learningLogs', []);
    const todaysCreatedLogs = logs
        .filter(log => toDateKey(log.date) === todayKey && normalizeEntryType(log.entryType) === 'log')
        .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

    const todaysTasks = todaysCreatedLogs
        .map(log => {
            const taskTitle = (log.topic || log.reflection || log.category || 'Daily Log Task').trim();
            return {
                logId: Number(log.id),
                title: taskTitle,
                createdAt: log.createdAt || log.date,
                duration: Number(log.duration) || 0,
                completed: Boolean(log.completed)
            };
        })
        .filter(task => !isLegacyDefaultTaskTitle(task.title));

    const pendingTasks = todaysTasks.filter(task => !task.completed);
    const completedTasks = todaysTasks.filter(task => task.completed);

    if (todaysTasks.length === 0) {
        planItems.innerHTML = '<p class="no-schedule">No daily logs created for today yet. Add a log to create tasks here ✨</p>';
        if (summary) {
            summary.innerHTML = 'No tasks available to tick yet for today.';
        }
        return;
    }

    planItems.innerHTML = `
        <div class="plan-log-subtitle">Pending Tasks (Tick when completed)</div>
        ${pendingTasks.length === 0 ? '<p class="no-schedule">No pending tasks 🎉</p>' : pendingTasks.map(task => {
            const label = (task.title || 'Daily Log Task').trim();
            const safeLabel = label.length > 42 ? `${label.slice(0, 42)}...` : label;
            const spentText = formatHours(task.duration);
            return `
                <label class="plan-item">
                    <input type="checkbox" data-log-id="${task.logId}">
                    <span>${safeLabel}</span>
                    <small style="margin-left:auto; color: var(--text-light);">Spent: ${spentText}</small>
                </label>
            `;
        }).join('')}
        <div class="plan-log-subtitle" style="margin-top: 1rem;">Completed Tasks</div>
        ${completedTasks.length === 0 ? '<p class="no-schedule">No completed tasks yet.</p>' : completedTasks.map(task => {
            const label = (task.title || 'Daily Log Task').trim();
            const safeLabel = label.length > 42 ? `${label.slice(0, 42)}...` : label;
            const spentText = formatHours(task.duration);
            return `
                <label class="plan-item is-completed-log">
                    <input type="checkbox" checked disabled>
                    <span>${safeLabel}</span>
                    <small style="margin-left:auto; color: var(--text-light);">Spent: ${spentText}</small>
                </label>
            `;
        }).join('')}
    `;

    const completedCount = completedTasks.length;

    if (summary) {
        summary.innerHTML = `Completed <strong>${completedCount}/${todaysTasks.length}</strong> daily log task${todaysTasks.length > 1 ? 's' : ''} today ✨`;
    }

    planItems.querySelectorAll('input[data-log-id]').forEach(checkbox => {
        checkbox.addEventListener('change', async function() {
            if (!this.checked) return;
            const logId = Number(this.getAttribute('data-log-id'));
            if (!logId) return;

            const token = getAuthToken();
            const currentUser = getStoredJSON('currentUser', null);
            if (!token || !currentUser?.id) {
                this.checked = false;
                showToast('⚠️ Please login first');
                return;
            }

            const completedAiMap = getCompletedAiLogMap();
            const alreadyCompletedInMap = Boolean(completedAiMap[String(logId)]);

            try {
                if (!alreadyCompletedInMap) {
                    const completionResult = await completeLogWithAi(logId, token);
                    completedAiMap[String(logId)] = true;
                    saveCompletedAiLogMap(completedAiMap);

                    const aiResponse = String(completionResult?.ai_response || '').trim();
                    if (aiResponse) {
                        const shortMessage = aiResponse.length > 140 ? `${aiResponse.slice(0, 140)}...` : aiResponse;
                        showToast(`🤖 AI Coach: ${shortMessage}`);
                    }
                }

                await syncLogsFromBackend();
                renderTodayLearningPlan();
                runTaskReminderChecks();
                updateNotificationUI();
            } catch (error) {
                this.checked = false;
                showToast(`❌ ${error.message}`);
            }
        });
    });
}

function completeOnePlanTaskForCategory(category) {
    const todayKey = toDateKey(new Date());
    const schedules = getSchedules();
    const normalizedCategory = (category || '').toLowerCase();

    const target = schedules.find(item => (
        item.date === todayKey
        && !item.completed
        && (item.category || '').toLowerCase() === normalizedCategory
    ));

    const fallbackTarget = schedules.find(item => (
        item.date === todayKey
        && !item.completed
    ));

    const chosenTarget = target || fallbackTarget;
    if (!chosenTarget) return;

    const updated = schedules.map(item => (
        item.id === chosenTarget.id ? { ...item, completed: true } : item
    ));
    saveSchedules(updated);
}

function renderLearningGoals() {
    const goalsList = document.getElementById('learningGoalsList');
    if (!goalsList) return;

    const schedules = getSchedules();
    const todayKey = toDateKey(new Date());
    const pendingGoals = schedules
        .filter(item => !item.completed && item.date && item.date > todayKey)
        .sort((a, b) => {
            const aDateTime = new Date(`${a.date}T${a.time || '23:59'}`);
            const bDateTime = new Date(`${b.date}T${b.time || '23:59'}`);
            return aDateTime - bDateTime;
        })
        .slice(0, 6);

    if (pendingGoals.length === 0) {
        goalsList.innerHTML = '<p class="no-schedule">No future goals yet. Add upcoming goals in Schedule Planner ✨</p>';
        return;
    }

    goalsList.innerHTML = pendingGoals.map((goal) => {
        const title = (goal.title || 'Learning Goal').trim();
        const displayTitle = title.length > 42 ? `${title.slice(0, 42)}...` : title;
        const icon = getCategoryIcon(goal.category || 'Other');
        const dateText = formatDateOnly(goal.date) || (goal.date || '');
        const timeText = goal.time ? ` • ${goal.time}` : '';

        return `
            <div class="goal-item">
                <div class="goal-header">
                    <span class="goal-icon">${icon}</span>
                    <span class="goal-name">${displayTitle}</span>
                    <button type="button" class="scheduled-delete" data-goal-delete-id="${goal.id}" title="Delete goal">✕</button>
                </div>
                <div class="goal-progress-bar">
                    <div class="progress" style="width: 0%;"></div>
                </div>
                <span class="goal-count">Pending • ${dateText}${timeText}</span>
            </div>
        `;
    }).join('');

    goalsList.querySelectorAll('button[data-goal-delete-id]').forEach(button => {
        button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            const goalId = Number(this.getAttribute('data-goal-delete-id'));
            deleteSchedule(goalId);
        });
    });
}

function initializeScheduler() {
    const schedulerGrid = document.getElementById('schedulerGrid');
    const scheduleForm = document.getElementById('scheduleForm');
    const scheduleDateInput = document.getElementById('scheduleDate');
    const prevBtn = document.getElementById('calPrevMonth');
    const nextBtn = document.getElementById('calNextMonth');

    if (!schedulerGrid || !scheduleForm || !scheduleDateInput || !prevBtn || !nextBtn) return;

    if (!scheduleDateInput.value) {
        scheduleDateInput.value = toDateKey(new Date());
    }

    renderSchedulerCalendar();
    renderScheduledList();

    prevBtn.addEventListener('click', function() {
        schedulerMonthDate.setMonth(schedulerMonthDate.getMonth() - 1);
        renderSchedulerCalendar();
    });

    nextBtn.addEventListener('click', function() {
        schedulerMonthDate.setMonth(schedulerMonthDate.getMonth() + 1);
        renderSchedulerCalendar();
    });

    scheduleForm.addEventListener('submit', function(event) {
        event.preventDefault();

        const title = document.getElementById('scheduleTitle')?.value?.trim();
        const date = document.getElementById('scheduleDate')?.value;
        const time = document.getElementById('scheduleTime')?.value || '';
        const category = document.getElementById('scheduleCategory')?.value || 'General';

        if (!title || !date) {
            showToast('⚠️ Please enter task title and date');
            return;
        }

        const items = getSchedules();
        items.push({
            id: Date.now(),
            title,
            date,
            time,
            category,
            createdAt: new Date().toISOString()
        });

        items.sort((a, b) => {
            const aDateTime = new Date(`${a.date}T${a.time || '23:59'}`);
            const bDateTime = new Date(`${b.date}T${b.time || '23:59'}`);
            return aDateTime - bDateTime;
        });

        saveSchedules(items);
        scheduleForm.reset();
        scheduleDateInput.value = toDateKey(new Date());

        renderSchedulerCalendar();
        renderScheduledList();
        renderTodayLearningPlan();
        runTaskReminderChecks();
        updateNotificationUI();
        showToast('📅 Task scheduled!');
    });
}

function renderSchedulerCalendar() {
    const monthLabel = document.getElementById('calMonthLabel');
    const schedulerGrid = document.getElementById('schedulerGrid');
    if (!monthLabel || !schedulerGrid) return;

    const year = schedulerMonthDate.getFullYear();
    const month = schedulerMonthDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = toDateKey(new Date());
    const scheduleByDate = {};

    getSchedules().forEach(item => {
        scheduleByDate[item.date] = (scheduleByDate[item.date] || 0) + 1;
    });

    monthLabel.textContent = schedulerMonthDate.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric'
    });

    schedulerGrid.innerHTML = '';

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'scheduler-cell scheduler-empty';
        schedulerGrid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateKey = toDateKey(date);
        const itemCount = scheduleByDate[dateKey] || 0;

        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'scheduler-cell';
        if (dateKey === todayKey) {
            cell.classList.add('is-today');
        }
        if (itemCount > 0) {
            cell.classList.add('has-items');
        }

        cell.innerHTML = `
            <span class="day-number">${day}</span>
            ${itemCount > 0 ? `<span class="day-dot">${itemCount}</span>` : ''}
        `;

        cell.addEventListener('click', function() {
            const scheduleDateInput = document.getElementById('scheduleDate');
            if (scheduleDateInput) {
                scheduleDateInput.value = dateKey;
            }
        });

        schedulerGrid.appendChild(cell);
    }
}

function renderScheduledList() {
    const listEl = document.getElementById('scheduledList');
    if (!listEl) return;

    const now = new Date();
    const items = getSchedules().filter(item => {
        const itemDate = new Date(`${item.date}T${item.time || '23:59'}`);
        return itemDate >= now;
    });

    items.sort((a, b) => {
        const aDateTime = new Date(`${a.date}T${a.time || '23:59'}`);
        const bDateTime = new Date(`${b.date}T${b.time || '23:59'}`);
        return aDateTime - bDateTime;
    });

    const upcoming = items.slice(0, 8);

    if (upcoming.length === 0) {
        listEl.innerHTML = '<p class="no-schedule">No upcoming tasks. Add one above ✨</p>';
        return;
    }

    listEl.innerHTML = upcoming.map(item => {
        const dateText = formatDateOnly(item.date);

        return `
            <div class="scheduled-item">
                <div>
                    <p class="scheduled-title">${item.title}</p>
                    <p class="scheduled-meta">${dateText}${item.time ? ` • ${item.time}` : ''} • ${item.category}</p>
                </div>
                <button type="button" class="scheduled-delete" onclick="deleteSchedule(${item.id})">✕</button>
            </div>
        `;
    }).join('');
}

function deleteSchedule(id) {
    const remaining = getSchedules().filter(item => item.id !== id);
    saveSchedules(remaining);
    renderSchedulerCalendar();
    renderScheduledList();
    renderTodayLearningPlan();
    runTaskReminderChecks();
    updateNotificationUI();
    showToast('🗑️ Scheduled task removed');
}

// Generate learning heatmap for a specific month
function generateHeatmap(elementId, month, year) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const logs = getStoredJSON('learningLogs', []);
    const logsByDate = {};

    // Create a map of dates with their learning duration
    logs.forEach(log => {
        const logDate = new Date(log.date);
        if (logDate.getMonth() + 1 === month && logDate.getFullYear() === year) {
            const dateKey = logDate.getDate();
            logsByDate[dateKey] = (logsByDate[dateKey] || 0) + log.duration;
        }
    });

    // Get number of days in month
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay();

    // Clear and rebuild heatmap
    element.innerHTML = '';

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfMonth; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'heatmap-cell no-activity';
        element.appendChild(emptyCell);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const hours = logsByDate[day] || 0;
        let levelClass = 'no-activity';

        if (hours > 0) {
            if (hours >= 3) levelClass = 'very-high';
            else if (hours >= 2) levelClass = 'high';
            else if (hours >= 1.5) levelClass = 'medium';
            else levelClass = 'low';
        }

        const dayElement = document.createElement('div');
        dayElement.className = `heatmap-cell ${levelClass}`;
        dayElement.title = `${day}: ${hours > 0 ? hours + 'h' : 'No learning'}`;
        element.appendChild(dayElement);
    }
}

// Display recent logs on dashboard
function displayRecentLogs() {
    const logs = getStoredJSON('learningLogs', []);
    const logsList = document.getElementById('logsList');
    
    if (!logsList) return;

    const recentLogs = logs.slice(-5).reverse();

    if (recentLogs.length === 0) {
        logsList.innerHTML = '<div class="no-logs">No "What You Have Learned ?" entries yet. <a href="log.html">Add your first entry</a></div>';
        return;
    }

    logsList.innerHTML = recentLogs.map(log => `
        <div class="log-item">
            <div class="log-header">
                <span class="log-category">${log.category}</span>
                <span class="log-date">Spent: ${formatHours(parseFloat(log.duration) || 0)}</span>
            </div>
            ${log.topic ? `<div class="log-topic">${log.topic}</div>` : ''}
            <div class="log-duration">⏱️ ${log.duration} hours</div>
            ${log.reflection ? `<div style="color: var(--text-light); margin-top: 0.5rem; font-size: 0.9rem;">💭 ${log.reflection.substring(0, 100)}...</div>` : ''}
        </div>
    `).join('');
}

// Display filtered logs on history page
function displayFilteredLogs(category) {
    const logs = getStoredJSON('learningLogs', []);
    const logsContainer = document.getElementById('logsContainer');
    const learnedContainer = document.getElementById('learnedContainer');
    const logCount = document.getElementById('logCount');
    
    if (!logsContainer && !learnedContainer) return;

    let filteredLogs = logs;
    if (category !== 'All') {
        filteredLogs = logs.filter(log => log.category === category);
    }

    filteredLogs.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

    const createdLogs = filteredLogs.filter(log => normalizeEntryType(log.entryType) === 'log');
    const learnedLogs = filteredLogs.filter(log => normalizeEntryType(log.entryType) === 'learned');

    if (logCount) {
        const logLabel = `${createdLogs.length} ${createdLogs.length === 1 ? 'created log' : 'created logs'}`;
        const learnedLabel = `${learnedLogs.length} ${learnedLogs.length === 1 ? 'learned note' : 'learned notes'}`;
        logCount.textContent = `${logLabel} • ${learnedLabel}`;
    }

    if (logsContainer && createdLogs.length === 0) {
        logsContainer.innerHTML = `
            <div class="empty-state">
                <img src="assets/No%20Data%20Yet.png" alt="No learning data yet" class="empty-state-image">
                <div class="empty-icon">📖</div>
                <p class="empty-message">No created logs found for this category.</p>
                <p class="empty-submessage">Start your learning journey today!</p>
                <a href="log.html" class="btn-start-logging">Start Logging →</a>
            </div>
        `;
    } else if (logsContainer) {
        logsContainer.innerHTML = createdLogs.map(log => `
            <div class="log-item">
                <div class="log-header">
                    <span class="log-category">${getCategoryIcon(log.category)} ${log.category}</span>
                    <span class="log-date">Spent: ${formatHours(parseFloat(log.duration) || 0)}</span>
                </div>
                ${log.topic ? `<div class="log-topic">${log.topic}</div>` : ''}
                <div class="log-duration">⏱️ ${log.duration} hour${log.duration !== 1 ? 's' : ''}</div>
                ${log.reflection ? `<div style="color: var(--text-light); margin-top: 0.8rem; font-size: 0.9rem;">💭 <strong>Notes:</strong> ${log.reflection}</div>` : ''}
                ${log.proof ? `<div style="color: var(--primary-color); margin-top: 0.5rem; font-size: 0.85rem;"><a href="${log.proof}" target="_blank" style="text-decoration: none; font-weight: 600;">🔗 View Proof</a></div>` : ''}
                <div style="margin-top: 0.75rem; display: flex; justify-content: flex-end;">
                    <button type="button" class="scheduled-delete" data-history-delete-id="${log.id}" title="Delete log">✕</button>
                </div>
            </div>
        `).join('');
    }

    if (learnedContainer && learnedLogs.length === 0) {
        learnedContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🧠</div>
                <p class="empty-message">No "What We Learned" notes found for this category.</p>
                <p class="empty-submessage">Use "What You Have Learned ?" to save what you learned.</p>
            </div>
        `;
    } else if (learnedContainer) {
        learnedContainer.innerHTML = learnedLogs.map(log => `
            <div class="log-item">
                <div class="log-header">
                    <span class="log-category">🧠 ${getCategoryIcon(log.category)} ${log.category}</span>
                    <span class="log-date">Spent: ${formatHours(parseFloat(log.duration) || 0)}</span>
                </div>
                <div class="log-topic">${log.reflection || log.topic || 'Learning note'}</div>
                <div style="margin-top: 0.75rem; display: flex; justify-content: flex-end;">
                    <button type="button" class="scheduled-delete" data-history-delete-id="${log.id}" title="Delete learned note">✕</button>
                </div>
            </div>
        `).join('');
    }

    document.querySelectorAll('button[data-history-delete-id]').forEach(button => {
        button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            const logId = Number(this.getAttribute('data-history-delete-id'));
            deleteLogEntry(logId);
        });
    });
}

function getCategoryIcon(category) {
    const icons = {
        'DSA': '🔷',
        'Web': '🌐',
        'ML': '🤖',
        'Other': '📌'
    };
    return icons[category] || '📚';
}

// ==================== THEME MANAGEMENT ====================

// Initialize theme on page load

// ==================== THEME MANAGEMENT ====================

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    console.log('🌗 Initializing theme. Saved theme:', savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
    console.log('📝 data-theme set to:', document.documentElement.getAttribute('data-theme'));
    updateThemeToggleIcon(savedTheme);
    updateThemeCheckbox(savedTheme);
    console.log('✅ Theme initialized');
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    console.log('🔄 Theme toggle clicked. Current:', currentTheme, 'New:', newTheme);
    applyTheme(newTheme);
}

function toggleThemeFromDropdown() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
}

function applyTheme(theme) {
    console.log('🎨 Applying theme:', theme);
    document.documentElement.setAttribute('data-theme', theme);
    console.log('📝 data-theme attribute set to:', document.documentElement.getAttribute('data-theme'));
    localStorage.setItem('theme', theme);
    console.log('💾 Saved theme to localStorage');
    updateThemeToggleIcon(theme);
    updateThemeCheckbox(theme);
    
    // Update theme display in settings
    const themeDisplay = document.getElementById('currentThemeDisplay');
    if (themeDisplay) {
        themeDisplay.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
    }
    console.log('✅ Theme applied successfully');
}

function updateThemeToggleIcon(theme) {
    // Update icon for old theme toggle (if it exists)
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('.theme-icon');
        if (icon) {
            icon.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
    }
    
    // Update icon for home page theme toggle (if it exists)
    const themeToggleHome = document.getElementById('themeToggleHome');
    if (themeToggleHome) {
        const icon = themeToggleHome.querySelector('.theme-icon');
        if (icon) {
            icon.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
    }

    // Update icons for global theme toggles on app pages
    const globalThemeIcons = document.querySelectorAll('.theme-toggle-global .theme-icon');
    globalThemeIcons.forEach(icon => {
        icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    });
}

function updateThemeCheckbox(theme) {
    const darkModeToggle = document.getElementById('userThemeToggle');
    if (darkModeToggle) {
        darkModeToggle.checked = theme === 'dark';
    }
    
    const settingsDarkModeToggle = document.getElementById('darkModeToggle');
    if (settingsDarkModeToggle) {
        settingsDarkModeToggle.checked = theme === 'dark';
    }
}

function setupThemeToggleListeners() {
    // Home page toggle uses inline onclick to avoid duplicate event firing

    // Setup settings page dark mode toggle
    const settingsDarkModeToggle = document.getElementById('darkModeToggle');
    if (settingsDarkModeToggle) {
        settingsDarkModeToggle.addEventListener('change', toggleTheme);
    }
}

// ==================== USER PROFILE MANAGEMENT ====================

function initializeUserProfile() {
    const currentUser = getStoredJSON('currentUser', null);
    if (currentUser) {
        updateUserProfileDisplay(currentUser);
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('userDropdown');
        const userBtn = event.target.closest('.user-avatar-btn');
        if (dropdown && !userBtn && !dropdown.contains(event.target)) {
            dropdown.style.display = 'none';
        }
    });
}

function updateUserProfileDisplay(user) {
    const userNameEl = document.getElementById('dropdownUserName');
    const userEmailEl = document.getElementById('dropdownUserEmail');
    const userNameInput = document.getElementById('userName');
    const userEmailInput = document.getElementById('userEmail');
    
    if (userNameEl) userNameEl.textContent = user.name || 'User';
    if (userEmailEl) userEmailEl.textContent = user.email || 'user@email.com';
    if (userNameInput) userNameInput.value = user.name || '';
    if (userEmailInput) userEmailInput.value = user.email || '';
}

function toggleUserDropdown(event) {
    if (!event) return;
    event.stopPropagation();
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        const isVisible = getComputedStyle(dropdown).display !== 'none';
        dropdown.style.display = isVisible ? 'none' : 'flex';
    }
}

function openUserSettings(event) {
    if (!event) return;
    event.preventDefault();
    event.stopPropagation();
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    window.location.href = 'settings.html';
}

function saveUserProfile() {
    const nameInput = document.getElementById('userName');
    const name = nameInput?.value?.trim();
    
    if (!name) {
        showToast('❌ Please enter your name');
        return;
    }
    
    const currentUser = getStoredJSON('currentUser', null);
    if (currentUser) {
        currentUser.name = name;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        updateUserProfileDisplay(currentUser);
        showToast('✅ Profile updated successfully!');
    }
}

// ==================== CUSTOM CATEGORY MANAGEMENT ====================

function getCustomCategories() {
    return getStoredJSON('customCategories', []);
}

function getCustomDurations() {
    return getStoredJSON('customDurations', []);
}

function saveCustomCategories(categories) {
    localStorage.setItem('customCategories', JSON.stringify(categories));
    updateCategorySelect();
    loadCustomCategories();
}

function saveCustomDurations(durations) {
    localStorage.setItem('customDurations', JSON.stringify(durations));
    updateDurationSelect();
}

// Handle category dropdown change
function handleCategoryChange() {
    const categorySelect = document.getElementById('category');
    const value = categorySelect?.value;
    
    if (value === '__add_custom__') {
        categorySelect.value = '';
        openCategoryCustomModal();
    }
}

// Handle duration dropdown change
function handleDurationChange() {
    const durationSelect = document.getElementById('duration');
    const value = durationSelect?.value;
    
    if (value === '__add_custom__') {
        durationSelect.value = '';
        openDurationCustomModal();
    }
}

// Category custom modal functions
function openCategoryCustomModal() {
    const modal = document.getElementById('categoryCustomModal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('categoryCustomInput');
        if (input) {
            input.focus();
            input.value = '';
        }
    }
}

function closeCategoryCustomModal() {
    const modal = document.getElementById('categoryCustomModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function saveCategoryCustom() {
    const input = document.getElementById('categoryCustomInput');
    const categoryName = input?.value?.trim();
    
    if (!categoryName) {
        showToast('❌ Please enter a category name');
        return;
    }
    
    if (categoryName.length > 50) {
        showToast('❌ Category name is too long (max 50 characters)');
        return;
    }
    
    const customCategories = getCustomCategories();
    
    if (customCategories.includes(categoryName)) {
        showToast('❌ This category already exists');
        return;
    }
    
    customCategories.push(categoryName);
    saveCustomCategories(customCategories);
    closeCategoryCustomModal();
    
    // Set the newly added category as selected
    const categorySelect = document.getElementById('category');
    if (categorySelect) {
        categorySelect.value = categoryName;
    }
    
    showToast('✅ Category added successfully!');
}

// Duration custom modal functions
function openDurationCustomModal() {
    const modal = document.getElementById('durationCustomModal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('durationCustomInput');
        if (input) {
            input.focus();
            input.value = '';
        }
    }
}

function closeDurationCustomModal() {
    const modal = document.getElementById('durationCustomModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function saveDurationCustom() {
    const input = document.getElementById('durationCustomInput');
    const durationValue = input?.value?.trim();
    
    if (!durationValue) {
        showToast('❌ Please enter a duration');
        return;
    }
    
    const duration = parseFloat(durationValue);
    
    if (isNaN(duration) || duration <= 0) {
        showToast('❌ Duration must be a positive number');
        return;
    }
    
    if (duration > 24) {
        showToast('❌ Duration cannot exceed 24 hours');
        return;
    }
    
    const customDurations = getCustomDurations();
    const displayText = duration % 1 === 0 ? `${duration} hr${duration !== 1 ? 's' : ''}` : `${duration} hrs`;
    
    // Check if duration already exists
    if (customDurations.some(d => d.value === duration)) {
        showToast('❌ This duration already exists');
        return;
    }
    
    customDurations.push({ value: duration, display: displayText });
    saveCustomDurations(customDurations);
    closeDurationCustomModal();
    
    // Set the newly added duration as selected
    const durationSelect = document.getElementById('duration');
    if (durationSelect) {
        durationSelect.value = duration.toString();
    }
    
    showToast('✅ Duration added successfully!');
}

function updateCategorySelect() {
    const select = document.getElementById('category');
    if (!select) return;

    const customCategories = getCustomCategories();

    // Keep static options and remove previously injected custom options
    const selectedValue = select.value;
    select.querySelectorAll('option[data-custom="true"]').forEach(option => option.remove());

    const addCustomOption = select.querySelector('option[value="__add_custom__"]');
    if (!addCustomOption) return;

    // Add custom categories before the "Add Custom" option
    customCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        option.setAttribute('data-custom', 'true');
        select.insertBefore(option, addCustomOption);
    });

    if (customCategories.includes(selectedValue)) {
        select.value = selectedValue;
    }
}

function updateDurationSelect() {
    const select = document.getElementById('duration');
    if (!select) return;

    const customDurations = getCustomDurations();

    // Keep static options and remove previously injected custom options
    const selectedValue = select.value;
    select.querySelectorAll('option[data-custom="true"]').forEach(option => option.remove());

    const addCustomOption = select.querySelector('option[value="__add_custom__"]');
    if (!addCustomOption) return;

    // Add custom durations before the "Add Custom" option
    customDurations.forEach(dur => {
        const option = document.createElement('option');
        option.value = dur.value.toString();
        option.textContent = dur.display;
        option.setAttribute('data-custom', 'true');
        select.insertBefore(option, addCustomOption);
    });

    if (customDurations.some(d => d.value.toString() === selectedValue)) {
        select.value = selectedValue;
    }
}

function addCategoryFromSettings() {
    const input = document.getElementById('newCategoryInput');
    const categoryName = input?.value?.trim();
    
    if (!categoryName) {
        showToast('❌ Please enter a category name');
        return;
    }
    
    if (categoryName.length > 50) {
        showToast('❌ Category name is too long (max 50 characters)');
        return;
    }
    
    const customCategories = getCustomCategories();
    
    if (customCategories.includes(categoryName)) {
        showToast('❌ This category already exists');
        return;
    }
    
    customCategories.push(categoryName);
    saveCustomCategories(customCategories);
    input.value = '';
    showToast('✅ Category added successfully!');
}

function removeCustomCategory(categoryName) {
    if (confirm(`Are you sure you want to delete "${categoryName}"?`)) {
        let customCategories = getCustomCategories();
        customCategories = customCategories.filter(cat => cat !== categoryName);
        saveCustomCategories(customCategories);
        showToast('✅ Category deleted!');
    }
}

function loadCustomCategories() {
    const list = document.getElementById('categoriesList');
    if (!list) return;
    
    const customCategories = getCustomCategories();
    const emptyMessage = document.getElementById('emptyCategoriesMessage');
    
    if (customCategories.length === 0) {
        list.innerHTML = '';
        if (emptyMessage) emptyMessage.style.display = 'block';
        return;
    }
    
    if (emptyMessage) emptyMessage.style.display = 'none';
    
    list.innerHTML = customCategories.map(cat => `
        <div class="category-item">
            <span class="category-name">${cat}</span>
            <button type="button" class="btn-delete-category" onclick="removeCustomCategory('${cat}')">Delete</button>
        </div>
    `).join('');
}

function toggleCustomCategoryInput() {
    const input = document.getElementById('customCategoryInput');
    if (input) {
        input.style.display = input.style.display === 'none' ? 'flex' : 'none';
        if (input.style.display === 'flex') {
            const nameInput = document.getElementById('customCategoryName');
            if (nameInput) nameInput.focus();
        }
    }
}

function addCustomCategory() {
    const nameInput = document.getElementById('customCategoryName');
    const categoryName = nameInput?.value?.trim();
    
    if (!categoryName) {
        showToast('❌ Please enter a category name');
        return;
    }
    
    if (categoryName.length > 50) {
        showToast('❌ Category name is too long (max 50 characters)');
        return;
    }
    
    const customCategories = getCustomCategories();
    
    if (customCategories.includes(categoryName)) {
        showToast('❌ This category already exists');
        return;
    }
    
    customCategories.push(categoryName);
    saveCustomCategories(customCategories);
    nameInput.value = '';
    toggleCustomCategoryInput();
    showToast('✅ Category added successfully!');
}

// ==================== SETTINGS PAGE FUNCTIONS ====================

function confirmResetData() {
    if (confirm('⚠️ WARNING: This will delete ALL your "What You Have Learned ?" entries and custom categories. This cannot be undone!\n\nAre you absolutely sure?')) {
        if (confirm('Last chance! Really delete everything?')) {
            localStorage.setItem('learningLogs', '[]');
            localStorage.setItem('customCategories', '[]');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('currentUser');
            localStorage.removeItem('isLoggedIn');
            showToast('✅ All data reset! Redirecting to login...');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        }
    }
}

// Ensure custom categories are loaded on log page
window.addEventListener('load', function() {
    updateCategorySelect();
    updateDurationSelect();
});

