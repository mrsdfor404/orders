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
    document.getElementById('saveOrderBtn').innerHTML = '<i class="fas fa-save"></i> حفظ التعديل';
    document.getElementById('saveOrderBtn').setAttribute('onclick', 'saveEdit()');
}

async function saveEdit() {
    if (!editingOrderId) return;
    
    const updatedOrder = {
        customerName: document.getElementById('customerName').value.trim(),
        productName: document.getElementById('productName').value.trim(),
        quantity: parseInt(document.getElementById('quantity').value),
        totalPrice: parseFloat(document.getElementById('totalPrice').value),
        status: document.getElementById('status').value,
        notes: document.getElementById('notes').value.trim()
    };
    
    try {
        await db.collection('orders').doc(editingOrderId).update(updatedOrder);
        incrementEditCount();
        showAlert('✅ تم تعديل الطلب بنجاح', 'success');
    } catch (error) {
        const index = allOrders.findIndex(o => o.id === editingOrderId);
        if (index !== -1) {
            allOrders[index] = { ...allOrders[index], ...updatedOrder };
            localStorage.setItem(`orders_${currentUser.uid}`, JSON.stringify(allOrders));
            incrementEditCount();
            showAlert('✅ تم التعديل محلياً', 'success');
        }
    }
    
    cancelEdit();
    await loadOrders();
}

function cancelEdit() {
    editingOrderId = null;
    document.getElementById('customerName').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('quantity').value = '1';
    document.getElementById('totalPrice').value = '';
    document.getElementById('status').value = 'جديد';
    document.getElementById('notes').value = '';
    document.querySelector('.form-section h3').innerHTML = '<i class="fas fa-plus-circle"></i> إضافة طلب جديد';
    document.getElementById('saveOrderBtn').innerHTML = '<i class="fas fa-save"></i> حفظ الطلب';
    document.getElementById('saveOrderBtn').setAttribute('onclick', 'addOrder()');
}

// ========== Print Functions ==========
function printOrder(orderId) {
    if (!canPrint()) {
        showAlert(`⚠️ لقد استنفذت محاولات الطباعة اليوم`, 'error');
        return;
    }
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;
    incrementPrintCount();
    
    const printWindow = window.open('', '_blank', 'width=400,height=500');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>فاتورة الطلب</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: monospace; padding: 15px; direction: rtl; text-align: center; }
                hr { border-top: 1px dashed #000; }
            </style>
        </head>
        <body>
            <h3>OrderMaster Pro</h3>
            <hr>
            <p>رقم: ${order.id.slice(0,8)}</p>
            <p>التاريخ: ${new Date().toLocaleString('ar-EG')}</p>
            <hr>
            <p>المنتج: ${order.productName}</p>
            <p>الكمية: ${order.quantity}</p>
            <p>السعر: ${order.totalPrice} $</p>
            ${order.customerName ? `<p>العميل: ${order.customerName}</p>` : ''}
            <p>الحالة: ${order.status}</p>
            <hr>
            <p>شكراً لتسوقكم</p>
            <script>window.print(); setTimeout(() => window.close(), 1000);<\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function printAllOrders() {
    if (!canPrintAll()) {
        if (userRole === 'premium') showAlert('⚠️ يمكنك طباعة الكل مرة كل 5 ساعات فقط', 'error');
        else showAlert('⚠️ هذه الخاصية متاحة فقط للأعضاء المميزين', 'error');
        return;
    }
    if (allOrders.length === 0) { showAlert('لا توجد طلبات للطباعة', 'error'); return; }
    setPrintAllTime();
    
    let html = `<!DOCTYPE html><html><head><title>تقرير جميع الطلبات</title><meta charset="UTF-8">
        <style>body{font-family:monospace;padding:15px;direction:rtl;}hr{border-top:1px dashed #000;}</style>
        </head><body><h3>تقرير جميع الطلبات</h3><hr>`;
    
    allOrders.forEach((o, i) => {
        html += `<p><strong>#${i+1}</strong> | ${o.productName} | ${o.quantity} × ${o.totalPrice}$ | ${o.status}</p>`;
    });
    
    html += `<hr><p>إجمالي الإيرادات: ${allOrders.filter(o=>o.status!=='ملغي'&&o.totalPrice>0).reduce((s,o)=>s+o.totalPrice,0)}$</p>
        <p>التاريخ: ${new Date().toLocaleString('ar-EG')}</p>
        <script>window.print();setTimeout(()=>window.close(),1000);<\/script></body></html>`;
    
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
}

// ========== UI Functions ==========
function filterOrders() {
    let filtered = [...allOrders];
    if (currentFilter !== 'all') filtered = allOrders.filter(o => o.status === currentFilter);
    
    const search = document.getElementById('searchInput').value.toLowerCase();
    if (search) filtered = filtered.filter(o => 
        (o.customerName?.toLowerCase().includes(search) || o.productName?.toLowerCase().includes(search))
    );
    
    renderOrders(filtered);
}

function renderOrders(orders) {
    const tbody = document.getElementById('ordersList');
    if (orders.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="8">📭 لا توجد طلبات</td></tr>'; 
        return; 
    }
    
    tbody.innerHTML = orders.map(order => {
        const statusClass = order.status === 'جديد' ? 'status-new' : 
                           order.status === 'قيد التنفيذ' ? 'status-progress' : 
                           order.status === 'تم التسليم' ? 'status-delivered' : 'status-cancelled';
        
        let dateStr = '-';
        if (order.date) {
            if (order.date.toDate) dateStr = order.date.toDate().toLocaleDateString('ar-EG');
            else if (typeof order.date === 'string') dateStr = new Date(order.date).toLocaleDateString('ar-EG');
        }
        
        let actions = `<button class="action-btn delete-btn" onclick="deleteOrder('${order.id}')"><i class="fas fa-trash"></i> حذف</button>`;
        if (canEdit()) {
            actions = `<button class="action-btn edit-btn" onclick='startEdit(${JSON.stringify(order).replace(/'/g, "\\'")})'><i class="fas fa-edit"></i> تعديل</button> ${actions}`;
        }
        if (canPrint()) {
            actions = `<button class="action-btn print-btn" onclick="printOrder('${order.id}')"><i class="fas fa-print"></i> طباعة</button> ${actions}`;
        }
        
        return `<tr>
            <td>${order.id.slice(0,6)}</td>
            <td>${order.customerName || '—'}</td>
            <td>${order.productName}</td>
            <td>${order.quantity}</td>
            <td>${order.totalPrice}$</td>
            <td>
                <span class="status-badge ${statusClass}">${order.status}</span><br>
                <select onchange="updateStatus('${order.id}', this.value)" style="margin-top:5px;font-size:11px;padding:3px;">
                    <option ${order.status==='جديد' ? 'selected' : ''}>جديد</option>
                    <option ${order.status==='قيد التنفيذ' ? 'selected' : ''}>قيد التنفيذ</option>
                    <option ${order.status==='تم التسليم' ? 'selected' : ''}>تم التسليم</option>
                    <option ${order.status==='ملغي' ? 'selected' : ''}>ملغي</option>
                </select>
            </td>
            <td>${dateStr}</td>
            <td>${actions}</td>
        </tr>`;
    }).join('');
}

function setFilter(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterOrders();
}

function exportToCSV() {
    let csv = "ID,العميل,المنتج,الكمية,السعر,الحالة,التاريخ\n";
    allOrders.forEach(o => csv += `${o.id},${o.customerName||''},${o.productName},${o.quantity},${o.totalPrice},${o.status},${o.date}\n`);
    const blob = new Blob(["\uFEFF" + csv], {type: 'text/csv'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `orders_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    showAlert('✅ تم التصدير', 'success');
}

// ========== Auth Functions ==========
async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    if (!email || !password) { 
        errorDiv.textContent = '⚠️ أدخل البريد وكلمة المرور'; 
        errorDiv.style.display = 'block'; 
        return; 
    }
    errorDiv.style.display = 'none';
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        showAlert('✅ تم تسجيل الدخول بنجاح', 'success');
    } catch(e) { 
        errorDiv.textContent = '❌ ' + (e.message === 'auth/invalid-credential' ? 'البريد أو كلمة المرور غير صحيحة' : e.message); 
        errorDiv.style.display = 'block'; 
    }
}

async function signup() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    if (!email) { 
        errorDiv.textContent = '⚠️ أدخل البريد الإلكتروني'; 
        errorDiv.style.display = 'block'; 
        return; 
    }
    if (!password || password.length < 6) { 
        errorDiv.textContent = '⚠️ كلمة المرور يجب أن تكون 6 أحرف على الأقل'; 
        errorDiv.style.display = 'block'; 
        return; 
    }
    errorDiv.style.display = 'none';
    
    try {
        await auth.createUserWithEmailAndPassword(email, password);
        showAlert('✅ تم إنشاء الحساب بنجاح!', 'success');
    } catch(e) { 
        errorDiv.textContent = '❌ ' + (e.message === 'auth/email-already-in-use' ? 'البريد الإلكتروني مستخدم بالفعل' : e.message); 
        errorDiv.style.display = 'block'; 
    }
}

async function logout() { 
    await auth.signOut();
    showAlert('✅ تم تسجيل الخروج', 'success');
}

function openSettings() { 
    showAlert('🔧 يمكنك تغيير كلمة المرور من إعدادات Firebase', 'success'); 
}

function openUpgradeModal() { 
    document.getElementById('upgradeModal').style.display = 'flex'; 
}

function closeUpgradeModal() { 
    document.getElementById('upgradeModal').style.display = 'none'; 
}

function showAlert(msg, type) {
    const alertDiv = document.getElementById('alert');
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    alertDiv.innerHTML = `<i class="fas ${icon}"></i> ${msg}`;
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.display = 'block';
    setTimeout(() => alertDiv.style.display = 'none', 3000);
}

// ========== Auth State Listener ==========
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        loadUserData();
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        document.getElementById('userNameDisplay').innerHTML = `<i class="fas fa-user-circle"></i> ${user.email.split('@')[0]}`;
        document.getElementById('userEmailDisplay').innerHTML = user.email;
        await loadOrders();
    } else {
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('mainContent').style.display = 'none';
    }
});
