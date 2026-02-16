// Admin Dashboard Module
const adminDashboard = (function() {
    let activityChart = null;
    let roomsChart = null;
    let trafficChart = null;
    let usersListener = null;
    let roomsListener = null;
    let trafficInterval = null;
    
    // Статистика
    let totalUsers = 0;
    let onlineUsers = 0;
    let activeRooms = 0;
    let bannedUsers = 0;
    let trafficData = {
        today: 0,
        week: 0,
        month: 0,
        history: []
    };

    // DOM Elements
    const totalUsersEl = document.getElementById('totalUsers');
    const onlineNowEl = document.getElementById('onlineNow');
    const activeRoomsEl = document.getElementById('activeRooms');
    const bannedUsersEl = document.getElementById('bannedUsers');
    const traffic24hEl = document.getElementById('traffic24h');
    const trafficTodayEl = document.getElementById('trafficToday');
    const trafficWeekEl = document.getElementById('trafficWeek');
    const trafficMonthEl = document.getElementById('trafficMonth');
    const usersTableBody = document.getElementById('usersTableBody');
    const roomsTableBody = document.getElementById('roomsTableBody');
    const searchInput = document.getElementById('searchUser');

    // Initialize dashboard
    async function init() {
        // Load initial data
        await loadUsers();
        await loadRooms();
        await loadTrafficData();
        await loadBannedUsers();
        
        // Start real-time listeners
        startUsersListener();
        startRoomsListener();
        startTrafficTracking();
        
        // Setup search
        searchInput.addEventListener('input', filterUsers);
        
        // Log dashboard access
        await logDashboardAccess();
    }

    // Log dashboard access
    async function logDashboardAccess() {
        const user = firebase.auth().currentUser;
        if (user) {
            await db.collection('admin_logs').add({
                adminId: user.uid,
                action: 'dashboard_access',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    }

    // Load banned users count
    async function loadBannedUsers() {
        try {
            const snapshot = await db.collection('users')
                .where('banned', '==', true)
                .get();
            
            bannedUsers = snapshot.size;
            if (bannedUsersEl) bannedUsersEl.textContent = bannedUsers;
        } catch (error) {
            console.error('Error loading banned users:', error);
        }
    }

    // Load traffic data from Firestore
    async function loadTrafficData() {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            
            const monthAgo = new Date();
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            
            // Get today's traffic
            const todaySnapshot = await db.collection('traffic')
                .where('date', '>=', firebase.firestore.Timestamp.fromDate(today))
                .get();
            
            trafficData.today = todaySnapshot.docs.reduce((sum, doc) => 
                sum + (doc.data().bytes || 0), 0);
            
            // Get week's traffic
            const weekSnapshot = await db.collection('traffic')
                .where('date', '>=', firebase.firestore.Timestamp.fromDate(weekAgo))
                .get();
            
            trafficData.week = weekSnapshot.docs.reduce((sum, doc) => 
                sum + (doc.data().bytes || 0), 0);
            
            // Get month's traffic
            const monthSnapshot = await db.collection('traffic')
                .where('date', '>=', firebase.firestore.Timestamp.fromDate(monthAgo))
                .get();
            
            trafficData.month = monthSnapshot.docs.reduce((sum, doc) => 
                sum + (doc.data().bytes || 0), 0);
            
            // Get history for chart
            const historySnapshot = await db.collection('traffic')
                .orderBy('date', 'desc')
                .limit(24 * 7) // Last 7 days by hour
                .get();
            
            trafficData.history = historySnapshot.docs.map(doc => ({
                time: doc.data().date.toDate(),
                bytes: doc.data().bytes || 0
            })).reverse();
            
            updateTrafficUI();
            updateTrafficChart();
        } catch (error) {
            console.error('Error loading traffic data:', error);
            // Use mock data if real data not available
            useMockTrafficData();
        }
    }

    // Use mock traffic data (for development)
    function useMockTrafficData() {
        trafficData.today = Math.floor(Math.random() * 500) + 100;
        trafficData.week = Math.floor(Math.random() * 3000) + 500;
        trafficData.month = Math.floor(Math.random() * 10000) + 2000;
        
        trafficData.history = [];
        for (let i = 0; i < 24; i++) {
            trafficData.history.push({
                time: new Date(Date.now() - i * 60 * 60 * 1000),
                bytes: Math.floor(Math.random() * 50) + 10
            });
        }
        trafficData.history.reverse();
        
        updateTrafficUI();
        updateTrafficChart();
    }

    // Start real-time users listener
    function startUsersListener() {
        if (usersListener) usersListener();
        
        usersListener = db.collection('users')
            .onSnapshot((snapshot) => {
                totalUsers = snapshot.size;
                totalUsersEl.textContent = totalUsers;
                
                let online = 0;
                let banned = 0;
                
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.online) online++;
                    if (data.banned) banned++;
                });
                
                onlineUsers = online;
                onlineNowEl.textContent = online;
                
                bannedUsers = banned;
                if (bannedUsersEl) bannedUsersEl.textContent = banned;
                
                renderUsersTable(snapshot.docs);
                updateActivityChart(snapshot.docs);
            }, (error) => {
                console.error('Users listener error:', error);
            });
    }

    // Start real-time rooms listener
    function startRoomsListener() {
        if (roomsListener) roomsListener();
        
        roomsListener = db.collection('rooms')
            .where('active', '==', true)
            .onSnapshot((snapshot) => {
                activeRooms = snapshot.size;
                activeRoomsEl.textContent = activeRooms;
                
                renderRoomsTable(snapshot.docs);
                updateRoomsChart(snapshot.docs);
            }, (error) => {
                console.error('Rooms listener error:', error);
            });
    }

    // Start traffic tracking
    function startTrafficTracking() {
        if (trafficInterval) clearInterval(trafficInterval);
        
        trafficInterval = setInterval(() => {
            updateTrafficData();
        }, 60000); // Every minute
    }

    // Update traffic data
    async function updateTrafficData() {
        // Log current traffic (this would come from WebRTC stats)
        const currentTraffic = estimateCurrentTraffic();
        
        const now = new Date();
        now.setMinutes(0, 0, 0); // Round to hour
        
        try {
            // Check if we already have an entry for this hour
            const existingSnapshot = await db.collection('traffic')
                .where('date', '==', firebase.firestore.Timestamp.fromDate(now))
                .get();
            
            if (existingSnapshot.empty) {
                // Create new entry
                await db.collection('traffic').add({
                    date: firebase.firestore.Timestamp.fromDate(now),
                    bytes: currentTraffic,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                // Update existing entry
                const doc = existingSnapshot.docs[0];
                await doc.ref.update({
                    bytes: firebase.firestore.FieldValue.increment(currentTraffic)
                });
            }
        } catch (error) {
            console.error('Error updating traffic data:', error);
        }
        
        // Update local data
        trafficData.today += currentTraffic;
        trafficData.week += currentTraffic;
        trafficData.month += currentTraffic;
        
        trafficData.history.push({
            time: new Date(),
            bytes: currentTraffic
        });
        
        // Keep last 7 days
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        trafficData.history = trafficData.history.filter(item => 
            item.time.getTime() > sevenDaysAgo
        );
        
        updateTrafficUI();
    }

    // Estimate current traffic based on online users and rooms
    function estimateCurrentTraffic() {
        // Rough estimate: 100KB per minute per active user
        return onlineUsers * 100 * 1024;
    }

    // Update traffic UI
    function updateTrafficUI() {
        if (trafficTodayEl) trafficTodayEl.textContent = formatBytes(trafficData.today);
        if (trafficWeekEl) trafficWeekEl.textContent = formatBytes(trafficData.week);
        if (trafficMonthEl) trafficMonthEl.textContent = formatBytes(trafficData.month);
        if (traffic24hEl) traffic24hEl.textContent = formatBytes(trafficData.today);
    }

    // Format bytes to human readable
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Render users table
    function renderUsersTable(users) {
        let html = '';
        
        users.forEach(doc => {
            const user = doc.data();
            const isBanned = user.banned || false;
            const banExpiry = user.banExpiry ? new Date(user.banExpiry.seconds * 1000) : null;
            const isOnline = user.online || false;
            const roomId = user.currentRoom || '—';
            
            // Check if ban expired
            const banExpired = banExpiry && banExpiry < new Date();
            const effectiveBanned = isBanned && !banExpired;
            
            const rowClass = effectiveBanned ? 'banned' : '';
            
            html += `
                <tr class="${rowClass}" data-user-id="${doc.id}">
                    <td>
                        <strong>${user.displayName || '—'}</strong>
                        ${user.superAdmin ? '<span class="super-admin">👑</span>' : ''}
                    </td>
                    <td>${doc.id}</td>
                    <td>
                        <span class="status-badge ${isOnline ? 'status-online' : 'status-offline'}">
                            ${isOnline ? '🟢 Online' : '⚫ Offline'}
                        </span>
                        ${effectiveBanned ? '<span class="status-badge status-banned">🔨 Бан</span>' : ''}
                        ${banExpiry && !banExpired ? `<br><small>до ${banExpiry.toLocaleString()}</small>` : ''}
                    </td>
                    <td>${formatTimestamp(user.lastSeen)}</td>
                    <td>${roomId}</td>
                    <td>${formatTimestamp(user.createdAt)}</td>
                    <td class="action-buttons">
                        ${renderBanButtons(doc.id, effectiveBanned, banExpiry)}
                    </td>
                </tr>
            `;
        });
        
        usersTableBody.innerHTML = html;
    }

    // Format timestamp
    function formatTimestamp(timestamp) {
        if (!timestamp) return '—';
        const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
        return date.toLocaleString();
    }

    // Render ban buttons
    function renderBanButtons(userId, isBanned, banExpiry) {
        if (isBanned) {
            return `
                <button class="action-btn unban-btn" onclick="adminDashboard.unbanUser('${userId}')">
                    🔓 Разбанить
                </button>
            `;
        } else {
            return `
                <button class="action-btn ban-btn" onclick="adminDashboard.banUser('${userId}')">
                    🔨 Забанить
                </button>
                <button class="action-btn temp-ban-btn" onclick="adminDashboard.tempBanUser('${userId}')">
                    ⏳ На 1 час
                </button>
            `;
        }
    }

    // Render rooms table
    function renderRoomsTable(rooms) {
        let html = '';
        
        rooms.forEach(doc => {
            const room = doc.data();
            const participantCount = room.participants ? room.participants.length : 0;
            
            html += `
                <tr data-room-id="${doc.id}">
                    <td><strong>${room.code || '—'}</strong></td>
                    <td>${room.hostName || '—'}</td>
                    <td>${participantCount}</td>
                    <td>${formatTimestamp(room.createdAt)}</td>
                    <td>${formatTimestamp(room.lastActive)}</td>
                    <td>
                        <button class="action-btn delete-room-btn" onclick="adminDashboard.deleteRoom('${doc.id}')">
                            🗑️ Удалить
                        </button>
                    </td>
                </tr>
            `;
        });
        
        roomsTableBody.innerHTML = html;
    }

    // Filter users by search
    function filterUsers() {
        const searchTerm = searchInput.value.toLowerCase();
        const rows = usersTableBody.querySelectorAll('tr');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    // Ban user permanently
    async function banUser(userId) {
        if (!confirm('Забанить этого пользователя навсегда?')) return;
        
        try {
            await db.collection('users').doc(userId).update({
                banned: true,
                bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
                bannedBy: firebase.auth().currentUser?.uid,
                banExpiry: null
            });
            
            // Kick user if online
            await kickUser(userId);
            
            // Log action
            await logAdminAction('ban_permanent', userId);
            
            showNotification('Пользователь забанен навсегда', 'success');
        } catch (error) {
            console.error('Error banning user:', error);
            showNotification('Ошибка бана', 'error');
        }
    }

    // Temp ban user for 1 hour
    async function tempBanUser(userId) {
        if (!confirm('Забанить пользователя на 1 час?')) return;
        
        const expiry = new Date();
        expiry.setHours(expiry.getHours() + 1);
        
        try {
            await db.collection('users').doc(userId).update({
                banned: true,
                bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
                bannedBy: firebase.auth().currentUser?.uid,
                banExpiry: firebase.firestore.Timestamp.fromDate(expiry)
            });
            
            // Kick user if online
            await kickUser(userId);
            
            // Log action
            await logAdminAction('ban_temporary', userId, { expires: expiry.toISOString() });
            
            showNotification('Пользователь забанен на 1 час', 'success');
        } catch (error) {
            console.error('Error temp banning user:', error);
            showNotification('Ошибка бана', 'error');
        }
    }

    // Unban user
    async function unbanUser(userId) {
        if (!confirm('Разбанить пользователя?')) return;
        
        try {
            await db.collection('users').doc(userId).update({
                banned: false,
                bannedAt: null,
                bannedBy: null,
                banExpiry: null
            });
            
            // Log action
            await logAdminAction('unban', userId);
            
            showNotification('Пользователь разбанен', 'success');
        } catch (error) {
            console.error('Error unbanning user:', error);
            showNotification('Ошибка разбана', 'error');
        }
    }

    // Kick user from all rooms
    async function kickUser(userId) {
        // Find all rooms where user is participant
        const roomsSnapshot = await db.collection('rooms')
            .where('participants', 'array-contains', userId)
            .get();
        
        const batch = db.batch();
        
        roomsSnapshot.docs.forEach(roomDoc => {
            // Remove from participants array
            batch.update(roomDoc.ref, {
                participants: firebase.firestore.FieldValue.arrayRemove(userId)
            });
            
            // Mark as offline in participants subcollection
            batch.update(
                roomDoc.ref.collection('participants').doc(userId),
                { online: false }
            );
        });
        
        await batch.commit();
    }

    // Delete room
    async function deleteRoom(roomId) {
        if (!confirm('Удалить комнату? Все участники будут отключены.')) return;
        
        try {
            // Get room data for logging
            const roomDoc = await db.collection('rooms').doc(roomId).get();
            const roomData = roomDoc.data();
            
            // Delete room and all subcollections
            await deleteCollection(roomDoc.ref.collection('participants'), 50);
            await deleteCollection(roomDoc.ref.collection('messages'), 50);
            await deleteCollection(roomDoc.ref.collection('signaling'), 50);
            await deleteCollection(roomDoc.ref.collection('iceCandidates'), 50);
            
            // Delete the room itself
            await db.collection('rooms').doc(roomId).delete();
            
            // Log action
            await logAdminAction('delete_room', roomId, { 
                code: roomData?.code,
                host: roomData?.hostName
            });
            
            showNotification('Комната удалена', 'success');
        } catch (error) {
            console.error('Error deleting room:', error);
            showNotification('Ошибка удаления комнаты', 'error');
        }
    }

    // Helper to delete a collection in batches
    async function deleteCollection(collectionRef, batchSize) {
        const snapshot = await collectionRef.limit(batchSize).get();
        
        if (snapshot.empty) return;
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        
        // Recursively delete remaining documents
        if (snapshot.size === batchSize) {
            await deleteCollection(collectionRef, batchSize);
        }
    }

    // Log admin action to Firestore
    async function logAdminAction(action, targetId, details = {}) {
        const user = firebase.auth().currentUser;
        if (!user) return;
        
        try {
            await db.collection('admin_logs').add({
                adminId: user.uid,
                adminEmail: user.email,
                action: action,
                targetId: targetId,
                details: details,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                ip: await getClientIP()
            });
        } catch (error) {
            console.error('Error logging admin action:', error);
        }
    }

    // Get client IP
    async function getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch {
            return 'unknown';
        }
    }

    // Update activity chart
    function updateActivityChart(users) {
        const ctx = document.getElementById('activityChart')?.getContext('2d');
        if (!ctx) return;
        
        // Group by hour
        const hours = Array(24).fill(0);
        const now = Date.now();
        
        users.forEach(doc => {
            const user = doc.data();
            if (user.lastSeen) {
                const lastSeen = user.lastSeen.seconds ? 
                    user.lastSeen.seconds * 1000 : 
                    new Date(user.lastSeen).getTime();
                
                const hourDiff = Math.floor((now - lastSeen) / (60 * 60 * 1000));
                if (hourDiff >= 0 && hourDiff < 24) {
                    hours[23 - hourDiff]++;
                }
            }
        });
        
        if (activityChart) {
            activityChart.destroy();
        }
        
        activityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(24).fill(0).map((_, i) => `${i}:00`),
                datasets: [{
                    label: 'Активные пользователи',
                    data: hours,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            display: true,
                            color: 'rgba(0,0,0,0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    // Update rooms chart
    function updateRoomsChart(rooms) {
        const ctx = document.getElementById('roomsChart')?.getContext('2d');
        if (!ctx) return;
        
        if (roomsChart) {
            roomsChart.destroy();
        }
        
        const empty = rooms.filter(r => (r.data().participants?.length || 0) === 0).length;
        const small = rooms.filter(r => {
            const count = r.data().participants?.length || 0;
            return count >= 1 && count <= 2;
        }).length;
        const medium = rooms.filter(r => {
            const count = r.data().participants?.length || 0;
            return count >= 3 && count <= 5;
        }).length;
        const large = rooms.filter(r => (r.data().participants?.length || 0) >= 6).length;
        
        roomsChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Пустые (0)', 'Малые (1-2)', 'Средние (3-5)', 'Большие (6+)'],
                datasets: [{
                    data: [empty, small, medium, large],
                    backgroundColor: [
                        '#cbd5e0',
                        '#667eea',
                        '#48bb78',
                        '#f56565'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    // Update traffic chart
    function updateTrafficChart() {
        const ctx = document.getElementById('trafficChart')?.getContext('2d');
        if (!ctx) return;
        
        if (trafficChart) {
            trafficChart.destroy();
        }
        
        const labels = trafficData.history.map(item => 
            item.time.toLocaleTimeString()
        );
        const data = trafficData.history.map(item => 
            Math.round(item.bytes / 1024) // Convert to KB
        );
        
        trafficChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Трафик (KB)',
                    data: data,
                    backgroundColor: 'rgba(72, 187, 120, 0.6)',
                    borderColor: '#48bb78',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            display: true,
                            color: 'rgba(0,0,0,0.05)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    // Refresh all data
    async function refreshAll() {
        await loadUsers();
        await loadRooms();
        await loadTrafficData();
        await loadBannedUsers();
        showNotification('Данные обновлены', 'success');
    }

    // Show notification
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s reverse';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Public API
    return {
        init,
        banUser,
        tempBanUser,
        unbanUser,
        deleteRoom,
        refreshAll
    };
})();

// Make globally available
window.adminDashboard = adminDashboard;