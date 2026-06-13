// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDDrg8IoQ47x6M29_h1yFdmT8y4Ks-dgsM",
    authDomain: "data-3be96.firebaseapp.com",
    projectId: "data-3be96",
    storageBucket: "data-3be96.firebasestorage.app",
    messagingSenderId: "788223478248",
    appId: "1:788223478248:web:cf9281af0dfe29644bfc5d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Master Admin Account (Hidden)
const MASTER_EMAIL = "admin_acce@orders.com";

// Global Variables
let currentUser = null;
let userRole = "user";
let allOrders = [];
let currentFilter = 'all';
let editCountToday = 0;
let printCountToday = 0;
let lastPrintAllTime = 0;
let lastResetDate = new Date().toDateString();
let editingOrderId = null;

// ========== User Data Management ==========
function resetDailyCounts() {
    const today = new Date().toDateString();
    if (today !== lastResetDate && currentUser) {
        editCountToday = 0;
        printCountToday = 0;
        lastResetDate = today;
        localStorage.setItem(`editCount_${currentUser.uid}`, '0');
        localStorage.setItem(`printCount_${currentUser.uid}`, '0');
    }
}

function loadUserData() {
    if (!currentUser) return;
    
    if (currentUser.email === MASTER_EMAIL) {
        userRole = "master";
    } else {
        const savedRole = localStorage.getItem(`role_${currentUser.uid}`);
        const savedExpiry = localStorage.getItem(`expiry_${currentUser.uid}`);
        const savedPremium = localStorage.getItem(`premium_${currentUser.uid}`);
        
        if (savedRole === 'admin' && savedExpiry && parseInt(savedExpiry) > Date.now()) {
            userRole = "admin";
        } else if (savedPremium === 'true') {
            userRole = "premium";
        } else {
            userRole = "user";
        }
    }
    
    editCountToday = parseInt(localStorage.getItem(`editCount_${currentUser.uid}`) || '0');
    printCountToday = parseInt(localStorage.getItem(`printCount_${currentUser.uid}`) || '0');
    lastPrintAllTime = parseInt(localStorage.getItem(`lastPrintAll_${currentUser.uid}`) || '0');
    resetDailyCounts();
    updateUI();
}

function updateUI() {
    const roleBadge = document.getElementById('userRoleBadge');
    const printAllBtn = document.getElementById('printAllBtn');
    
    if (userRole === 'master') {
        roleBadge.innerHTML = '<i class="fas fa-crown"></i> المالك';
        roleBadge.style.background = "linear-gradient(135deg, #ffd700, #ff8c00)";
        printAllBtn.style.display = 'inline-flex';
    } else if (userRole === 'admin') {
        roleBadge.innerHTML = '<i class="fas fa-user-shield"></i> مشرف';
        roleBadge.style.background = "linear-gradient(135deg, #f093fb, #f5576c)";
        printAllBtn.style.display = 'inline-flex';
    } else if (userRole === 'premium') {
        roleBadge.innerHTML = '<i class="fas fa-gem"></i> مميز';
        roleBadge.style.background = "linear-gradient(135deg, #ffd700, #ff8c00)";
        printAllBtn.style.display = 'inline-flex';
    } else {
        roleBadge.innerHTML = '<i class="fas fa-user"></i> عضو عادي';
        roleBadge.style.background = "#28a745";
        printAllBtn.style.display = 'none';
    }
    
    let remaining = 0;
    if (userRole === 'premium') {
        remaining = Math.max(0, 7 - (editCountToday + printCountToday));
    } else if (userRole === 'user') {
        remaining = Math.max(0, 2 - editCountToday);
    } else {
        remaining = "∞";
    }
    document.getElementById('usageCount').innerHTML = remaining;
}

// ========== Permission Checks ==========
function canEdit() {
    if (userRole === 'master' || userRole === 'admin') return true;
    if (userRole === 'premium') return (editCountToday + printCountToday) < 7;
    if (userRole === 'user') return editCountToday < 2;
    return false;
}

function canPrint() {
    if (userRole === 'master' || userRole === 'admin') return true;
    if (userRole === 'premium') return (editCountToday + printCountToday) < 7;
    if (userRole === 'user') return printCountToday < 1;
    return false;
}

function canPrintAll() {
    if (userRole === 'master' || userRole === 'admin') return true;
    if (userRole === 'premium') {
        const hoursSince = (Date.now() - lastPrintAllTime) / (1000 * 60 * 60);
        return hoursSince >= 5;
    }
    return false;
}

function incrementEditCount() {
    editCountToday++;
    localStorage.setItem(`editCount_${currentUser.uid}`, editCountToday.toString());
    updateUI();
}

function incrementPrintCount() {
    printCountToday++;
    localStorage.setItem(`printCount_${currentUser.uid}`, printCountToday.toString());
    updateUI();
}

function setPrintAllTime() {
    lastPrintAllTime = Date.now();
    localStorage.setItem(`lastPrintAll_${currentUser.uid}`, lastPrintAllTime.toString());
}

// ========== Upgrade Request ==========
function requestUpgrade(packageType) {
    const upgradeRequests = JSON.parse(localStorage.getItem('upgradeRequests') || '[]');
    upgradeRequests.push({
        email: currentUser.email,
        uid: currentUser.uid,
        package: packageType,
        date: new Date().toISOString()
    });
    localStorage.setItem('upgradeRequests', JSON.stringify(upgradeRequests));
    window.open('https://www.instagram.com/mrsdfor/', '_blank');
    showAlert('✅ تم إرسال طلب التحويل! سيتم مراجعة طلبك خلال 24 ساعة', 'success');
    closeUpgradeModal();
}

// ========== Orders CRUD Operations ==========
async function loadOrders() {
    if (!currentUser) return;
    
    try {
        const snapshot = await db.collection('orders').where('userId', '==', currentUser.uid).orderBy('date', 'desc').get();
        
        if (!snapshot.empty) {
            allOrders = [];
            snapshot.forEach(doc => {
                allOrders.push({ id: doc.id, ...doc.data() });
            });
            localStorage.setItem(`orders_${currentUser.uid}`, JSON.stringify(allOrders));
        } else {
            const localOrders = JSON.parse(localStorage.getItem(`orders_${currentUser.uid}`) || '[]');
            allOrders = localOrders;
        }
    } catch (error) {
        const localOrders = JSON.parse(localStorage.getItem(`orders_${currentUser.uid}`) || '[]');
        allOrders = localOrders;
        showAlert('⚠️ تم التحميل من الجهاز', 'warning');
    }
    
    updateStats();
    filterOrders();
}

function updateStats() {
    const total = allOrders.length;
    const revenue = allOrders.filter(o => o.status !== 'ملغي' && (o.totalPrice || 0) > 0).reduce((s, o) => s + (o.totalPrice || 0), 0);
    document.getElementById('totalOrders').textContent = total;
    document.getElementById('totalRevenue').textContent = revenue.toFixed(2);
}

async function addOrder() {
    if (!currentUser) { showAlert('الرجاء تسجيل الدخول', 'error'); return; }
    
    const productName = document.getElementById('productName').value.trim();
    if (!productName) { showAlert('⚠️ الرجاء إدخال اسم المنتج', 'error'); return; }
    
    const orderData = {
        userId: currentUser.uid,
        customerName: document.getElementById('customerName').value.trim() || null,
        productName: productName,
        quantity: parseInt(document.getElementById('quantity').value) || 1,
        totalPrice: parseFloat(document.getElementById('totalPrice').value) || 0,
        status: document.getElementById('status').value,
        notes: document.getElementById('notes').value.trim(),
        date: new Date().toISOString()
    };
    
    try {
        const docRef = await db.collection('orders').add(orderData);
        orderData.id = docRef.id;
        showAlert('✅ تم حفظ الطلب في السحاب', 'success');
    } catch (error) {
        orderData.id = Date.now().toString();
        const localOrders = JSON.parse(localStorage.getItem(`orders_${currentUser.uid}`) || '[]');
        localOrders.unshift(orderData);
        localStorage.setItem(`orders_${currentUser.uid}`, JSON.stringify(localOrders));
        showAlert('⚠️ تم الحفظ محلياً', 'warning');
    }
    
    // Clear form
    document.getElementById('customerName').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('quantity').value = '1';
    document.getElementById('totalPrice').value = '';
    document.getElementById('notes').value = '';
    
    await loadOrders();
}

async function updateStatus(orderId, newStatus) {
    try {
        await db.collection('orders').doc(orderId).update({ status: newStatus });
        showAlert('✅ تم تحديث الحالة', 'success');
    } catch (error) {
        const index = allOrders.findIndex(o => o.id === orderId);
        if (index !== -1) {
            allOrders[index].status = newStatus;
            localStorage.setItem(`orders_${currentUser.uid}`, JSON.stringify(allOrders));
            showAlert('✅ تم التحديث محلياً', 'success');
        }
    }
    await loadOrders();
}

async function deleteOrder(orderId) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا الطلب؟')) return;
    
    try {
        await db.collection('orders').doc(orderId).delete();
        showAlert('✅ تم الحذف من السحاب', 'success');
    } catch (error) {
        const newOrders = allOrders.filter(o => o.id !== orderId);
        localStorage.setItem(`orders_${currentUser.uid}`, JSON.stringify(newOrders));
        showAlert('✅ تم الحذف محلياً', 'success');
    }
    await loadOrders();
}

function startEdit(order) {
    if (!canEdit()) {
        showAlert(`⚠️ لقد استنفذت محاولات التعديل اليوم`, 'error');
        return;
    }
    editingOrderId = order.id;
    document.getElementById('customerName').value = order.customerName || '';
    document.getElementById('productName').value = order.productName || '';
    document.getElementById('quantity').value = order.quantity || 1;
    document.getElementById('totalPrice').value = order.totalPrice || 0;
    document.getElementById('status').value = order.status || 'جديد';
    document.getElementById('notes').value = order.notes || '';
    document.querySelector('.form-section h3').innerHTML = '<i class="fas fa-edit"></i> تعديل الطلب';
    document.getElementById('saveOrderBtn').innerHTML = '<i class="fas fa-s
