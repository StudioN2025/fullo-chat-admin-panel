// Admin Authentication Module
const adminAuth = (function() {
    // DOM Elements
    const authContainer = document.getElementById('authContainer');
    const adminPanel = document.getElementById('adminPanel');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const adminEmailSpan = document.getElementById('adminEmail');

    // Check auth state
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            // Check if user is admin in Firestore
            const isAdmin = await checkIfAdmin(user.uid);
            
            if (isAdmin) {
                // Admin is logged in
                showAdminPanel(user);
                await adminDashboard.init();
                
                // Log admin login
                await logAdminAction(user.uid, 'login');
            } else {
                // Not admin - logout and show error
                await firebase.auth().signOut();
                showAuthContainer();
                showError('У вас нет прав администратора');
            }
        } else {
            // Not logged in
            showAuthContainer();
        }
    });

    // Check if user is admin in Firestore
    async function checkIfAdmin(uid) {
        try {
            const adminDoc = await db.collection('admins').doc(uid).get();
            return adminDoc.exists;
        } catch (error) {
            console.error('Error checking admin status:', error);
            return false;
        }
    }

    // Log admin actions
    async function logAdminAction(adminId, action, details = {}) {
        try {
            await db.collection('admin_logs').add({
                adminId: adminId,
                action: action,
                details: details,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                ip: await getClientIP()
            });
        } catch (error) {
            console.error('Error logging admin action:', error);
        }
    }

    // Get client IP (using ipify.org)
    async function getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch {
            return 'unknown';
        }
    }

    function showAuthContainer() {
        authContainer.classList.remove('hidden');
        adminPanel.classList.add('hidden');
        clearMessages();
    }

    function showAdminPanel(user) {
        authContainer.classList.add('hidden');
        adminPanel.classList.remove('hidden');
        adminEmailSpan.textContent = user.email;
        clearMessages();
    }

    function clearMessages() {
        errorMessage.textContent = '';
        successMessage.textContent = '';
    }

    function showError(text) {
        errorMessage.textContent = text;
        successMessage.textContent = '';
    }

    function showSuccess(text) {
        successMessage.textContent = text;
        errorMessage.textContent = '';
    }

    // Login function
    async function login() {
        const email = document.getElementById('emailInput').value.trim();
        const password = document.getElementById('passwordInput').value;

        if (!email || !password) {
            showError('Введите email и пароль');
            return;
        }

        try {
            await firebase.auth().signInWithEmailAndPassword(email, password);
            showSuccess('Вход выполнен успешно');
        } catch (error) {
            console.error('Login error:', error);
            
            switch (error.code) {
                case 'auth/invalid-email':
                    showError('Неверный формат email');
                    break;
                case 'auth/user-disabled':
                    showError('Пользователь заблокирован');
                    break;
                case 'auth/user-not-found':
                    showError('Пользователь не найден');
                    break;
                case 'auth/wrong-password':
                    showError('Неверный пароль');
                    break;
                default:
                    showError('Ошибка входа: ' + error.message);
            }
        }
    }

    // Logout function
    async function logout() {
        try {
            const user = firebase.auth().currentUser;
            if (user) {
                await logAdminAction(user.uid, 'logout');
            }
            await firebase.auth().signOut();
            showSuccess('Выход выполнен');
        } catch (error) {
            showError('Ошибка выхода: ' + error.message);
        }
    }

    // Add new admin (only for existing admins)
    async function addAdmin(email) {
        try {
            // Find user by email
            const userSnapshot = await db.collection('users')
                .where('email', '==', email)
                .get();
            
            if (userSnapshot.empty) {
                showError('Пользователь не найден');
                return;
            }
            
            const userDoc = userSnapshot.docs[0];
            
            // Add to admins collection
            await db.collection('admins').doc(userDoc.id).set({
                email: email,
                addedBy: firebase.auth().currentUser?.uid,
                addedAt: firebase.firestore.FieldValue.serverTimestamp(),
                superAdmin: false
            });
            
            showSuccess('Администратор добавлен');
        } catch (error) {
            console.error('Error adding admin:', error);
            showError('Ошибка добавления администратора');
        }
    }

    // Remove admin
    async function removeAdmin(uid) {
        try {
            await db.collection('admins').doc(uid).delete();
            showSuccess('Администратор удален');
        } catch (error) {
            console.error('Error removing admin:', error);
            showError('Ошибка удаления администратора');
        }
    }

    return {
        login,
        logout,
        addAdmin,
        removeAdmin
    };
})();

// Make globally available
window.adminAuth = adminAuth;