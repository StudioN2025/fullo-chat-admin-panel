// Admin Dashboard Module
const adminDashboard = (function() {
    let activityChart = null;
    let roomsChart = null;
    let usersListener = null;
    let roomsListener = null;
    let adminsListener = null;
    let logsListener = null;
    
    // Статистика
    let totalUsers = 0;
    let onlineUsers = 0;
    let activeRooms = 0;
    let bannedUsers = 0;
    let currentUser = null;

    // DOM Elements
    const totalUsersEl = document.getElementById('totalUsers');
    const onlineNowEl = document.getElementById('onlineNow');
    const activeRoomsEl = document.getElementById('activeRooms');
    const bannedUsersEl = document.getElementById('bannedUsers');
    const usersTableBody = document.getElementById('usersTableBody');
    const roomsTableBody = document.getElementById('roomsTableBody');
    const adminsTableBody = document.getElementById('adminsTableBody');
    const logsTableBody = document.getElementById('logsTableBody');
    const searchInput = document.getElementById('searchUser');

    // Initialize dashboard
    async function init() {
        currentUser = firebase.auth().currentUser;
        
        // Load initial data
        await loadUsers();
        await loadRooms();
        await loadAdmins();
        await loadLogs();
        
        // Start real-time listeners
        startUsersListener();
        startRoomsListener();
        startAdminsListener();
        startLogsListener();
        
        // Setup search
        if (searchInput) {
            searchInput.addEventListener('input', filterUsers);
        }
        
        // Log dashboard access
        await adminAuth.logAdminAction(currentUser.uid, 'dashboard_access', { 
            email: currentUser.email 
        });
    }

    // Load users
    async function loadUsers() {
        try {
            const snapshot = await db.collection('users').get();
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
            bannedUsersEl.textContent = banned;
            
            renderUsersTable(snapshot.docs);
            updateActivityChart(snapshot.docs);
        } catch (error) {
            console.error('Error loading users:', error);
            showNotification('Ошибка загрузки пользователей', 'error');
        }
    }

    // Load rooms
    async function loadRooms() {
        try {
            const snapshot = await db.collection('rooms')
                .where('active', '==', true)
                .get();
            
            activeRooms = snapshot.size;
            activeRoomsEl.textContent = activeRooms;
            
            renderRoomsTable(snapshot.docs);
            updateRoomsChart(snapshot.docs);
        } catch (error) {
            console.error('Error loading rooms:', error);
        }
    }

    // Load admins
    async function loadAdmins() {
        try {
            const snapshot = await db.collection('admins').get();
            renderAdminsTable(snapshot.docs);
        } catch (error) {
            console.error('Error loading admins:', error);
        }
    }

    // Load logs
    async function loadLogs() {
        try {
            const snapshot = await db.collection('admin_logs')
                .orderBy('timestamp', 'desc')
                .limit(100)
                .get();
            
            renderLogsTable(snapshot.docs);
        } catch (error) {
            console.error('Error loading logs:', error);
        }
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
                bannedUsersEl.textContent = banned;
                
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

    // Start real-time admins listener
    function startAdminsListener() {
        if (adminsListener) adminsListener();
        
        adminsListener = db.collection('admins')
            .onSnapshot((snapshot) => {
                renderAdminsTable(snapshot.docs);
            }, (error) => {
                console.error('Admins listener error:', error);
            });
    }

    // Start real-time logs listener
    function startLogsListener() {
        if (logsListener) logsListener();
        
        logsListener = db.collection('admin_logs')
            .orderBy('timestamp', 'desc')
            .limit(100)
            .onSnapshot((snapshot) => {
                renderLogsTable(snapshot.docs);
            }, (error) => {
                console.error('Logs listener error:', error);
            });
    }

    // Render users table
    function renderUsersTable(users) {
        if (!usersTableBody) return;
        
        if (users.length === 0) {
            usersTableBody.innerHTML = '<tr><td colspan="7" class="loading-row">Нет пользователей</td></tr>';
            return;
        }
        
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
                        ${user.superAdmin ? '<span class="super-admin" title="Супер-администратор">👑</span>' : ''}
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

    // Render rooms table
    function renderRoomsTable(rooms) {
        if (!roomsTableBody) return;
        
        if (rooms.length === 0) {
            roomsTableBody.innerHTML = '<tr><td colspan="6" class="loading-row">Нет активных комнат</td></tr>';
            return;
        }
        
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

    // Render admins table
    function renderAdminsTable(admins) {
        if (!adminsTableBody) return;
        
        if (admins.length === 0) {
            adminsTableBody.innerHTML = '<tr><td colspan="5" class="loading-row">Нет администраторов</td></tr>';
            return;
        }
        
        let html = '';
        const isSuperAdmin = currentUser ? isUserSuperAdmin(currentUser.uid) : false;
        
        admins.forEach(async (doc) => {
            const admin = doc.data();
            
            // Get adder info
            let addedByName = '—';
            if (admin.addedBy) {
                const adderDoc = await db.collection('admins').doc(admin.addedBy).get();
                if (adderDoc.exists) {
                    addedByName = adderDoc.data().email;
                }
            }
            
            html += `
                <tr data-admin-id="${doc.id}">
                    <td>${admin.email || '—'}</td>
                    <td>${formatTimestamp(admin.addedAt)}</td>
                    <td>${addedByName}</td>
                    <td>
                        ${admin.superAdmin ? 
                            '<span class="status-badge status-online">Да 👑</span>' : 
                            '<span class="status-badge status-offline">Нет</span>'}
                    </td>
                    <td>
                        ${(isSuperAdmin || doc.id === currentUser?.uid) && !admin.superAdmin ? 
                            `<button class="action-btn remove-admin-btn" onclick="adminDashboard.removeAdmin('${doc.id}')">
                                🗑️ Удалить
                            </button>` : 
                            '—'}
                    </td>
                </tr>
            `;
        });
        
        // Use Promise.all to handle async operations
        Promise.all(admins.map(async (doc) => {
            const admin = doc.data();
            let addedByName = '—';
            if (admin.addedBy) {
                const adderDoc = await db.collection('admins').doc(admin.addedBy).get();
                if (adderDoc.exists) {
                    addedByName = adderDoc.data().email;
                }
            }
            return { doc, admin, addedByName };
        })).then(results => {
            let finalHtml = '';
            results.forEach(({ doc, admin, addedByName }) => {
                finalHtml += `
                    <tr data-admin-id="${doc.id}">
                        <td>${admin.email || '—'}</td>
                        <td>${formatTimestamp(admin.addedAt)}</td>
                        <td>${addedByName}</td>
                        <td>
                            ${admin.superAdmin ? 
                                '<span class="status-badge status-online">Да 👑</span>' : 
                                '<span class="status-badge status-offline">Нет</span>'}
                        </td>
                        <td>
                            ${(isSuperAdmin || doc.id === currentUser?.uid) && !admin.superAdmin ? 
                                `<button class="action-btn remove-admin-btn" onclick="adminDashboard.removeAdmin('${doc.id}')">
                                    🗑️ Удалить
                                </button>` : 
                                '—'}
                        </td>
                    </tr>
                `;
            });
            adminsTableBody.innerHTML = finalHtml || '<tr><td colspan="5" class="loading-row">Нет администраторов</td></tr>';
        });
    }

    // Render logs table
    function renderLogsTable(logs) {
        if (!logsTableBody) return;
        
        if (logs.length === 0) {
            logsTableBody.innerHTML = '<tr><td colspan="5" class="loading-row">Нет записей</td></tr>';
            return;
        }
        
        let html = '';
        
        logs.forEach(doc => {
            const log = doc.data();
            
            html += `
                <tr>
                    <td>${formatTimestamp(log.timestamp)}</td>
                    <td>${log.details?.email || log.adminId || '—'}</td>
                    <td>${log.action || '—'}</td>
                    <td>${log.targetId || '—'}</td>
                    <td>${log.ip || '—'}</td>
                </tr>
            `;
        });
        
        logsTableBody.innerHTML = html;
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

    // Format timestamp
    function formatTimestamp(timestamp) {
        if (!timestamp) return '—';
        if (timestamp.seconds) {
            return new Date(timestamp.seconds * 1000).toLocaleString();
        }
        if (timestamp instanceof Date) {
            return timestamp.toLocaleString();
        }
        return '—';
    }

    // Filter users by search
    function filterUsers() {
        const searchTerm = searchInput.value.toLowerCase();
        const rows = usersTableBody.querySelectorAll('tr');
        
        rows.forEach(row => {
            if (row.classList.contains('loading-row')) return;
            
            const text = row.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    // Check if user is super admin
    async function isUserSuperAdmin(uid) {
        try {
            const adminDoc = await db.collection('admins').doc(uid).get();
            return adminDoc.exists && adminDoc.data().superAdmin === true;
        } catch (error) {
            console.error('Error checking super admin:', error);
            return false;
        }
    }

    // Ban user permanently
    async function banUser(userId) {
        if (!confirm('Забанить этого пользователя навсегда?')) return;
        
        try {
            await db.collection('users').doc(userId).update({
                banned: true,
                bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
                bannedBy: currentUser?.uid,
                banExpiry: null
            });
            
            // Kick user if online
            await kickUser(userId);
            
            // Log action
            await adminAuth.logAdminAction(currentUser.uid, 'ban_permanent', { 
                targetId: userId,
                email: currentUser.email
            });
            
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
                bannedBy: currentUser?.uid,
                banExpiry: firebase.firestore.Timestamp.fromDate(expiry)
            });
            
            // Kick user if online
            await kickUser(userId);
            
            // Log action
            await adminAuth.logAdminAction(currentUser.uid, 'ban_temporary', { 
                targetId: userId,
                expires: expiry.toISOString(),
                email: currentUser.email
            });
            
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
            await adminAuth.logAdminAction(currentUser.uid, 'unban', { 
                targetId: userId,
                email: currentUser.email
            });
            
            showNotification('Пользователь разбанен', 'success');
        } catch (error) {
            console.error('Error unbanning user:', error);
            showNotification('Ошибка разбана', 'error');
        }
    }

    // Kick user from all rooms
    async function kickUser(userId) {
        try {
            const roomsSnapshot = await db.collection('rooms')
                .where('participants', 'array-contains', userId)
                .get();
            
            const batch = db.batch();
            
            roomsSnapshot.docs.forEach(roomDoc => {
                batch.update(roomDoc.ref, {
                    participants: firebase.firestore.FieldValue.arrayRemove(userId)
                });
                
                batch.update(
                    roomDoc.ref.collection('participants').doc(userId),
                    { online: false }
                );
            });
            
            await batch.commit();
        } catch (error) {
            console.error('Error kicking user:', error);
        }
    }

    // Delete room
    async function deleteRoom(roomId) {
        if (!confirm('Удалить комнату? Все участники будут отключены.')) return;
        
        try {
            const roomDoc = await db.collection('rooms').doc(roomId).get();
            const roomData = roomDoc.data();
            
            // Delete subcollections
            await deleteCollection(roomDoc.ref.collection('participants'), 50);
            await deleteCollection(roomDoc.ref.collection('messages'), 50);
            await deleteCollection(roomDoc.ref.collection('signaling'), 50);
            await deleteCollection(roomDoc.ref.collection('iceCandidates'), 50);
            
            // Delete the room
            await db.collection('rooms').doc(roomId).delete();
            
            // Log action
            await adminAuth.logAdminAction(currentUser.uid, 'delete_room', { 
                roomId: roomId,
                code: roomData?.code,
                host: roomData?.hostName,
                email: currentUser.email
            });
            
            showNotification('Комната удалена', 'success');
        } catch (error) {
            console.error('Error deleting room:', error);
            showNotification('Ошибка удаления комнаты', 'error');
        }
    }

    // Helper to delete a collection
    async function deleteCollection(collectionRef, batchSize) {
        const snapshot = await collectionRef.limit(batchSize).get();
        
        if (snapshot.empty) return;
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        
        if (snapshot.size === batchSize) {
            await deleteCollection(collectionRef, batchSize);
        }
    }

    // Show add admin modal
    function showAddAdminModal() {
        document.getElementById('addAdminModal').classList.remove('hidden');
        document.getElementById('newAdminEmail').value = '';
        document.getElementById('superAdminCheckbox').checked = false;
        document.getElementById('modalError').textContent = '';
    }

    // Hide add admin modal
    function hideAddAdminModal() {
        document.getElementById('addAdminModal').classList.add('hidden');
    }

    // Add new admin
    async function addAdmin() {
        const email = document.getElementById('newAdminEmail').value.trim();
        const isSuperAdmin = document.getElementById('superAdminCheckbox').checked;
        const modalError = document.getElementById('modalError');
        
        if (!email) {
            modalError.textContent = 'Введите email';
            return;
        }
        
        try {
            // Find user by email
            const usersSnapshot = await db.collection('users')
                .where('email', '==', email)
                .get();
            
            if (usersSnapshot.empty) {
                modalError.textContent = 'Пользователь с таким email не найден';
                return;
            }
            
            const userDoc = usersSnapshot.docs[0];
            
            // Check if already admin
            const existingAdmin = await db.collection('admins').doc(userDoc.id).get();
            if (existingAdmin.exists) {
                modalError.textContent = 'Пользователь уже является администратором';
                return;
            }
            
            // Add to admins collection
            await db.collection('admins').doc(userDoc.id).set({
                email: email,
                addedBy: currentUser?.uid,
                addedAt: firebase.firestore.FieldValue.serverTimestamp(),
                superAdmin: isSuperAdmin
            });
            
            // Log action
            await adminAuth.logAdminAction(currentUser.uid, 'add_admin', { 
                targetEmail: email,
                superAdmin: isSuperAdmin,
                email: currentUser.email
            });
            
            hideAddAdminModal();
            showNotification('Администратор добавлен', 'success');
        } catch (error) {
            console.error('Error adding admin:', error);
            modalError.textContent = 'Ошибка добавления администратора';
        }
    }

    // Remove admin
    async function removeAdmin(adminId) {
        if (!confirm('Удалить этого администратора?')) return;
        
        try {
            const adminDoc = await db.collection('admins').doc(adminId).get();
            const adminData = adminDoc.data();
            
            await db.collection('admins').doc(adminId).delete();
            
            // Log action
            await adminAuth.logAdminAction(currentUser.uid, 'remove_admin', { 
                targetId: adminId,
                targetEmail: adminData?.email,
                email: currentUser.email
            });
            
            showNotification('Администратор удален', 'success');
        } catch (error) {
            console.error('Error removing admin:', error);
            showNotification('Ошибка удаления администратора', 'error');
        }
    }

    // Refresh logs
    async function refreshLogs() {
        await loadLogs();
        showNotification('Логи обновлены', 'success');
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
        showAddAdminModal,
        hideAddAdminModal,
        addAdmin,
        removeAdmin,
        refreshLogs
    };
})();

// Make globally available
window.adminDashboard = adminDashboard;
