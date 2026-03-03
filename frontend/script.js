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
const API_BASE_URL = localStorage.getItem('apiBaseUrl') || 'http://127.0.0.1:8000';

function getAuthToken() {
    return localStorage.getItem('authToken') || '';
}

function toDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
            const errorData = await response.json();
            message = errorData.detail || errorData.message || message;
        } catch {
            // Ignore parse failure and keep fallback message.
        }
        throw new Error(message);
    }

    if (response.status === 204) return null;
    return response.json();
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
        return {
            id: item.id,
            category: details.category || 'Other',
            topic: details.topic || 'Learning Session',
            duration: Number(((item.minutes_spent || 0) / 60).toFixed(2)),
            reflection: details.reflection || '',
            proof: details.proof || '',
            date: item.date,
            createdAt: item.date
        };
    });

    localStorage.setItem('learningLogs', JSON.stringify(mappedLogs));
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ LearnTrack - DOM Loaded - Script Initialized');
    
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
        // Initialize quick tags
        const quickTagsContainer = document.getElementById('quickTags');
        const quickTags = ['Arrays', 'React', 'Algorithms', 'APIs', 'Database', 'Testing'];
        
        if (quickTagsContainer) {
            quickTags.forEach(tag => {
                const tagElement = document.createElement('button');
                tagElement.type = 'button';
                tagElement.className = 'quick-tag';
                tagElement.textContent = tag;
                tagElement.addEventListener('click', function(e) {
                    e.preventDefault();
                    const topicInput = document.getElementById('topic');
                    if (!topicInput) {
                        console.warn('Topic input not found while applying quick tag.');
                        return;
                    }
                    const currentText = topicInput.value.trim();
                    if (currentText) {
                        topicInput.value = currentText + ' - ' + tag;
                    } else {
                        topicInput.value = tag;
                    }
                    updateFormProgress();
                });
                quickTagsContainer.appendChild(tagElement);
            });
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
            const reflection = document.getElementById('reflection')?.value?.trim();
            const proof = document.getElementById('learningDate')?.value?.trim();

            // Validation
            if (!category || !topic || !duration) {
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
                const payloadDate = new Date().toISOString().split('T')[0];
                const durationHours = parseFloat(duration) || 0;

                await apiRequest(`/logs/${trackId}`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        date: payloadDate,
                        minutes_spent: Math.max(1, Math.round(durationHours * 60)),
                        notes: serializeNotes({ category, topic, reflection, proof })
                    })
                });

                await syncLogsFromBackend();
            } catch (error) {
                showToast(`❌ ${error.message}`);
                return;
            }

            // Show success toast
            showToast('✨ Learning logged successfully!');
            
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
        const reflection = document.getElementById('reflection')?.value?.trim();

        let filled = 0;
        if (category) filled++;
        if (topic) filled++;
        if (duration) filled++;
        if (reflection) filled++;

        const progress = (filled / 4) * 100;
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
            const weekLogs = logs.filter(log => new Date(log.date) >= weekStart).length;
            
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
            const date = new Date(log.date).toDateString();
            logsByDate[date] = true;
        });

        let streak = 0;
        let currentDate = new Date();
        
        while (true) {
            const dateStr = currentDate.toDateString();
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
                loadDashboardStats();
                displayRecentLogs();
                renderDashboardAnalytics();
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
    loadDashboardStats();
    displayRecentLogs();
    renderDashboardAnalytics();
    initializeScheduler();

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
                await apiRequest(`/logs/${trackId}`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        date: new Date().toISOString().split('T')[0],
                        minutes_spent: 60,
                        notes: serializeNotes({
                            category,
                            topic: 'Quick Log',
                            reflection,
                            proof: ''
                        })
                    })
                });

                await syncLogsFromBackend();
            } catch (error) {
                showToast(`❌ ${error.message}`);
                return;
            }

            // Reset form and reload
            quickLogForm.reset();
            showToast('✅ Learning logged successfully!');
            loadDashboardStats();
            displayRecentLogs();
            renderDashboardAnalytics();
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

// Calculate current streak
function calculateCurrentStreak() {
    const logs = getStoredJSON('learningLogs', []);
    if (logs.length === 0) return 0;

    // Sort logs by date
    const sortedLogs = logs.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Get unique dates
    const uniqueDates = [...new Set(sortedLogs.map(log => log.date))].sort((a, b) => new Date(b) - new Date(a));
    
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let currentDate = new Date(today);

    for (const date of uniqueDates) {
        const logDate = new Date(date);
        const expectedDate = new Date(currentDate);
        expectedDate.setDate(expectedDate.getDate() - streak);

        if (logDate.toISOString().split('T')[0] === expectedDate.toISOString().split('T')[0]) {
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
    const uniqueDates = [...new Set(logs.map(log => log.date))].sort();
    
    let maxStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < uniqueDates.length; i++) {
        const prevDate = new Date(uniqueDates[i - 1]);
        const currentDate = new Date(uniqueDates[i]);
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
    const date = new Date(dateInput);
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
    return getStoredJSON('learningSchedule', []);
}

function saveSchedules(items) {
    localStorage.setItem('learningSchedule', JSON.stringify(items));
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
        const dateText = new Date(`${item.date}T00:00:00`).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
        });

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
        logsList.innerHTML = '<div class="no-logs">No learning logs yet. <a href="log.html">Add your first log</a></div>';
        return;
    }

    logsList.innerHTML = recentLogs.map(log => `
        <div class="log-item">
            <div class="log-header">
                <span class="log-category">${log.category}</span>
                <span class="log-date">${new Date(log.date).toLocaleDateString()}</span>
            </div>
            <div class="log-topic">${log.topic}</div>
            <div class="log-duration">⏱️ ${log.duration} hours</div>
            ${log.reflection ? `<div style="color: var(--text-light); margin-top: 0.5rem; font-size: 0.9rem;">💭 ${log.reflection.substring(0, 100)}...</div>` : ''}
        </div>
    `).join('');
}

// Display filtered logs on history page
function displayFilteredLogs(category) {
    const logs = getStoredJSON('learningLogs', []);
    const logsContainer = document.getElementById('logsContainer');
    const logCount = document.getElementById('logCount');
    
    if (!logsContainer) return;

    let filteredLogs = logs;
    if (category !== 'All') {
        filteredLogs = logs.filter(log => log.category === category);
    }

    // Sort by date descending
    filteredLogs.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Update log count
    if (logCount) {
        logCount.textContent = `${filteredLogs.length} ${filteredLogs.length === 1 ? 'log' : 'logs'}`;
    }

    if (filteredLogs.length === 0) {
        logsContainer.innerHTML = `
            <div class="empty-state">
                <img src="assets/No%20Data%20Yet.png" alt="No learning data yet" class="empty-state-image">
                <div class="empty-icon">📖</div>
                <p class="empty-message">No logs found for this category.</p>
                <p class="empty-submessage">Start your learning journey today!</p>
                <a href="log.html" class="btn-start-logging">Start Logging →</a>
            </div>
        `;
        return;
    }

    logsContainer.innerHTML = filteredLogs.map(log => `
        <div class="log-item">
            <div class="log-header">
                <span class="log-category">${getCategoryIcon(log.category)} ${log.category}</span>
                <span class="log-date">${new Date(log.date).toLocaleDateString()}</span>
            </div>
            <div class="log-topic">${log.topic}</div>
            <div class="log-duration">⏱️ ${log.duration} hour${log.duration !== 1 ? 's' : ''}</div>
            ${log.reflection ? `<div style="color: var(--text-light); margin-top: 0.8rem; font-size: 0.9rem;">💭 <strong>Reflection:</strong> ${log.reflection}</div>` : ''}
            ${log.proof ? `<div style="color: var(--primary-color); margin-top: 0.5rem; font-size: 0.85rem;"><a href="${log.proof}" target="_blank" style="text-decoration: none; font-weight: 600;">🔗 View Proof</a></div>` : ''}
        </div>
    `).join('');
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
    if (confirm('⚠️ WARNING: This will delete ALL your learning logs and custom categories. This cannot be undone!\n\nAre you absolutely sure?')) {
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

