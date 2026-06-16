
// dashboard.js - MULTI-STAGE APPROVAL VERSION
// Editor: Pending → Reviewed or Rejected (Stage 1)
// Supervisor: Reviewed → Approved or Rejected (Stage 2)
// Admin: Can do anything at any stage
// Viewer: sees ALL logs, read-only
// Submitter: sees OWN logs, read-only

// ===================== TOAST =====================
function showToast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.remove(); }, 3000);
}

// ===================== CURRENT USER =====================
function getCurrentUser() {
  const s = localStorage.getItem('currentUser');
  if (s) return JSON.parse(s);
  return { name: 'Admin', role: 'Admin' };
}
function getCurrentRole() { return getCurrentUser().role || 'Viewer'; }

// ===================== ROLE-BASED ACCESS =====================
function applyRolePermissions() {
  const user = getCurrentUser();
  const role = user.role || 'Viewer';

  const navInfo = document.getElementById('navUserInfo');
  if (navInfo) navInfo.innerHTML = '<strong>' + user.name + '</strong> • ' + role;

  if (role === 'Admin') return;

  if (role === 'Editor') {
    hideEl('userMgmtCard');
    hideEl('bulkDeleteBtn');
    return;
  }

  if (role === 'Supervisor') {
    hideEl('settingsTabBtn');
    hideEl('bulkDeleteBtn');
    return;
  }

  if (role === 'Submitter') {
    hideEl('analyticsTabBtn');
    hideEl('settingsTabBtn');
    hideEl('pendingsTabBtn');
    hideEl('bulkApproveBtn');
    hideEl('bulkRejectBtn');
    hideEl('bulkDeleteBtn');
    hideEl('thCheckboxCol');
    var noticeRole = document.getElementById('viewerNoticeRole');
    if (noticeRole) noticeRole.textContent = 'Submitter';
    var notice = document.getElementById('viewerNotice');
    if (notice) notice.classList.add('visible');
    return;
  }

  if (role === 'Viewer') {
    hideEl('analyticsTabBtn');
    hideEl('settingsTabBtn');
    hideEl('pendingsTabBtn');
    hideEl('bulkApproveBtn');
    hideEl('bulkRejectBtn');
    hideEl('bulkDeleteBtn');
    hideEl('thCheckboxCol');
    var noticeRole = document.getElementById('viewerNoticeRole');
    if (noticeRole) noticeRole.textContent = 'Viewer';
    var notice = document.getElementById('viewerNotice');
    if (notice) notice.classList.add('visible');
  }
}

function hideEl(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// ===================== USER MANAGEMENT =====================
let users = [
  { id: 1, name: 'John Doe', email: 'john@example.com', password: '1234', role: 'Admin' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', password: '1234', role: 'Editor' },
  { id: 3, name: 'Bob Johnson', email: 'bob@example.com', password: '1234', role: 'Viewer' },
  { id: 4, name: 'Mary Wilson', email: 'mary@example.com', password: '1234', role: 'Supervisor' },
  { id: 5, name: 'Tom Garcia', email: 'tom@example.com', password: '1234', role: 'Submitter' }
];
let editingUserId = null;

// ===================== PAGE LOAD =====================
window.addEventListener('DOMContentLoaded', function () {
  console.log('--- DASHBOARD LOADED ---');
  console.log('Current user:', getCurrentUser());
  console.log('Current role:', getCurrentRole());
  console.log('Submissions in storage:', getSnarfSubmissions().length);

  loadUsersFromStorage();
  displayCurrentUser();
  renderUsersTable();
  updateDashboardStats();
  updateAllBadges();
  loadTabVisibilitySettings();
  applyRolePermissions();

  try {
    filterSnarfTable();
    updateSnarfSummary();
    console.log('SNARF table pre-loaded. Filtered results:', snarfFilteredResults.length);
  } catch (e) {
    console.error('SNARF pre-load error:', e);
  }
});

function displayCurrentUser() {
  var el = document.getElementById('welcomeMessage');
  if (el) el.textContent = 'Welcome, ' + getCurrentUser().name + '! 👋';
}

function loadUsersFromStorage() {
  var s = localStorage.getItem('appUsers');
  if (s) users = JSON.parse(s);
  else saveUsersToStorage();
}

function saveUsersToStorage() {
  localStorage.setItem('appUsers', JSON.stringify(users));
}

function renderUsersTable(filterTerm) {
  filterTerm = filterTerm || '';
  var tbody = document.getElementById('userTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  var filtered = users;
  if (filterTerm) filtered = users.filter(function (u) { return [u.name, u.email, u.role].join(' ').toLowerCase().indexOf(filterTerm) !== -1; });
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999;font-style:italic;padding:25px;">No users found.</td></tr>';
  } else {
    filtered.forEach(function (user) {
      tbody.innerHTML += '<tr><td>' + user.name + '</td><td>' + user.email + '</td><td><span class="role-badge role-' + user.role.toLowerCase() + '">' + user.role + '</span></td><td><div class="action-buttons"><button class="edit-btn" onclick="openEditUserModal(' + user.id + ')">Edit</button><button class="delete-btn" onclick="deleteUser(' + user.id + ')">Delete</button></div></td></tr>';
    });
  }
  var badge = document.getElementById('userCountBadge');
  if (badge) badge.textContent = users.length + ' user' + (users.length !== 1 ? 's' : '');
}

function filterUsersTable() {
  var el = document.getElementById('userSearchInput');
  renderUsersTable(el ? el.value.toLowerCase().trim() : '');
}

function openAddUserModal() {
  if (getCurrentRole() !== 'Admin') { showToast('Only admins can manage users.', 'error'); return; }
  editingUserId = null;
  var mt = document.getElementById('modalTitle'); if (mt) mt.textContent = 'Add New User';
  var un = document.getElementById('userName'); if (un) un.value = '';
  var ue = document.getElementById('userEmail'); if (ue) ue.value = '';
  var up = document.getElementById('userPassword'); if (up) up.value = '';
  var ur = document.getElementById('userRole'); if (ur) ur.value = 'Viewer';
  var m = document.getElementById('userModal'); if (m) m.classList.add('active');
}

function openEditUserModal(userId) {
  if (getCurrentRole() !== 'Admin') { showToast('Only admins can manage users.', 'error'); return; }
  var user = users.find(function (u) { return u.id === userId; });
  if (user) {
    editingUserId = userId;
    var mt = document.getElementById('modalTitle'); if (mt) mt.textContent = 'Edit User';
    var un = document.getElementById('userName'); if (un) un.value = user.name;
    var ue = document.getElementById('userEmail'); if (ue) ue.value = user.email;
    var up = document.getElementById('userPassword'); if (up) up.value = user.password;
    var ur = document.getElementById('userRole'); if (ur) ur.value = user.role;
    var m = document.getElementById('userModal'); if (m) m.classList.add('active');
  }
}

function closeUserModal() {
  var m = document.getElementById('userModal'); if (m) m.classList.remove('active');
}

function saveUser() {
  if (getCurrentRole() !== 'Admin') { showToast('Only admins can manage users.', 'error'); return; }
  var unEl = document.getElementById('userName');
  var ueEl = document.getElementById('userEmail');
  var upEl = document.getElementById('userPassword');
  var urEl = document.getElementById('userRole');
  var name = unEl ? unEl.value.trim() : '';
  var email = ueEl ? ueEl.value.trim() : '';
  var password = upEl ? upEl.value.trim() : '';
  var role = urEl ? urEl.value : 'Viewer';
  if (!name || !email || !password) { showToast('Please fill in all fields.', 'error'); return; }
  if (editingUserId) {
    var user = users.find(function (u) { return u.id === editingUserId; });
    if (user) { user.name = name; user.email = email; user.password = password; user.role = role; }
    showToast('User updated successfully!', 'success');
  } else {
    var newId = users.length > 0 ? Math.max.apply(null, users.map(function (u) { return u.id; })) + 1 : 1;
    users.push({ id: newId, name: name, email: email, password: password, role: role });
    showToast('User added successfully!', 'success');
  }
  saveUsersToStorage(); filterUsersTable(); updateDashboardStats(); closeUserModal();
}

function deleteUser(userId) {
  if (getCurrentRole() !== 'Admin') { showToast('Only admins can manage users.', 'error'); return; }
  if (confirm('Are you sure you want to delete this user?')) {
    users = users.filter(function (u) { return u.id !== userId; });
    saveUsersToStorage(); filterUsersTable(); updateDashboardStats();
    showToast('User deleted successfully.', 'error');
  }
}

// ===================== TAB SWITCHING =====================
function switchTab(tabName, btnElement) {
  var role = getCurrentRole();
  if ((role === 'Viewer' || role === 'Submitter') && (tabName === 'analytics' || tabName === 'settings' || tabName === 'pendings')) {
    showToast('You do not have access to this tab.', 'error'); return;
  }
  if (role === 'Supervisor' && tabName === 'settings') {
    showToast('You do not have access to this tab.', 'error'); return;
  }
  document.querySelectorAll('.tab-content').forEach(function (t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
  var tabEl = document.getElementById(tabName);
  if (tabEl) tabEl.classList.add('active');
  if (btnElement) btnElement.classList.add('active');
  if (tabName === 'snarf-form') initializeSnarfForm();
  if (tabName === 'pendings') initializePendings();
  if (tabName === 'home') updateDashboardStats();
  if (tabName === 'settings') filterUsersTable();
}

function logout() {
  showToast('Logging out...', 'info');
  setTimeout(function () { window.location.href = "index.html"; }, 1000);
}

// ===================== TAB VISIBILITY =====================
var tabVisibilityMap = {
  'snarf-form': { tabBtnId: 'snarfTabBtn', toggleId: 'toggleSnarfTab' },
  'analytics': { tabBtnId: 'analyticsTabBtn', toggleId: 'toggleAnalyticsTab' }
};

function toggleTabVisibility(tabName, isVisible) {
  var config = tabVisibilityMap[tabName]; if (!config) return;
  var tabBtn = document.getElementById(config.tabBtnId); if (!tabBtn) return;
  if (isVisible) {
    tabBtn.classList.remove('hidden-tab');
    showToast('Tab is now visible.', 'success');
  } else {
    tabBtn.classList.add('hidden-tab');
    if (tabBtn.classList.contains('active')) switchTab('home', document.querySelector('.tab-btn'));
    showToast('Tab is now hidden.', 'info');
  }
  saveTabVisibilitySettings();
}

function saveTabVisibilitySettings() {
  var s = {};
  for (var t in tabVisibilityMap) {
    var tog = document.getElementById(tabVisibilityMap[t].toggleId);
    if (tog) s[t] = tog.checked;
  }
  localStorage.setItem('tabVisibilitySettings', JSON.stringify(s));
}

function loadTabVisibilitySettings() {
  var stored = localStorage.getItem('tabVisibilitySettings');
  if (!stored) return;
  var s = JSON.parse(stored);
  for (var t in s) {
    var c = tabVisibilityMap[t]; if (!c) continue;
    var tog = document.getElementById(c.toggleId);
    if (tog) tog.checked = s[t];
    var btn = document.getElementById(c.tabBtnId);
    if (btn) {
      if (s[t]) btn.classList.remove('hidden-tab');
      else {
        btn.classList.add('hidden-tab');
        if (btn.classList.contains('active')) switchTab('home', document.querySelector('.tab-btn'));
      }
    }
  }
}

// ===================== BADGES (MULTI-STAGE) =====================
function updateAllBadges() {
  var subs = getSnarfSubmissions();
  var pending = subs.filter(function (s) { return (s.status || 'Pending') === 'Pending'; }).length;
  var reviewed = subs.filter(function (s) { return s.status === 'Reviewed'; }).length;
  var actionNeeded = pending + reviewed;

  var snarfBadge = document.getElementById('pendingBadge');
  if (snarfBadge) {
    if (actionNeeded > 0) { snarfBadge.textContent = actionNeeded; snarfBadge.style.display = 'inline-block'; }
    else { snarfBadge.style.display = 'none'; }
  }

  var role = getCurrentRole();
  var pendingsCount = 0;
  if (role === 'Admin') pendingsCount = pending + reviewed;
  else if (role === 'Editor') pendingsCount = pending;
  else if (role === 'Supervisor') pendingsCount = reviewed;
  else pendingsCount = actionNeeded;

  var pendingsBadge = document.getElementById('pendingsBadge');
  if (pendingsBadge) {
    if (pendingsCount > 0) { pendingsBadge.textContent = pendingsCount; pendingsBadge.style.display = 'inline-block'; }
    else { pendingsBadge.style.display = 'none'; }
  }
}

// ===================== DASHBOARD STATS (MULTI-STAGE) =====================
function updateDashboardStats() {
  var subs = getSnarfSubmissions();
  var pending = subs.filter(function (s) { return (s.status || 'Pending') === 'Pending'; }).length;
  var reviewed = subs.filter(function (s) { return s.status === 'Reviewed'; }).length;
  var approved = subs.filter(function (s) { return s.status === 'Approved'; }).length;
  var rejected = subs.filter(function (s) { return s.status === 'Rejected'; }).length;
  var rate = subs.length > 0 ? Math.round((approved / subs.length) * 100) : 0;
  var el;
  el = document.getElementById('statTotalUsers'); if (el) el.textContent = users.length;
  el = document.getElementById('statTotalSubmissions'); if (el) el.textContent = subs.length;
  el = document.getElementById('statPending'); if (el) el.textContent = pending;
  el = document.getElementById('statReviewed'); if (el) el.textContent = reviewed;
  el = document.getElementById('statApproved'); if (el) el.textContent = approved;
  el = document.getElementById('statRejected'); if (el) el.textContent = rejected;
  el = document.getElementById('statApprovalRate'); if (el) el.textContent = rate + '%';
}

// ===================== SNARF MANAGEMENT =====================
var snarfCurrentPage = 1;
var snarfRowsPerPage = 10;
var snarfFilteredResults = [];

function getSnarfSubmissions() {
  var s = localStorage.getItem("snarfFormSubmissions");
  return s ? JSON.parse(s) : [];
}

function saveSnarfSubmissions(subs) {
  localStorage.setItem("snarfFormSubmissions", JSON.stringify(subs));
}

function refreshAll() {
  updateSnarfSummary();
  updateDashboardStats();
  updateAllBadges();
  filterSnarfTable();
  var pendingsEl = document.getElementById('pendings');
  if (pendingsEl && pendingsEl.classList.contains('active')) filterPendingsTable();
}

function initializeSnarfForm() {
  var searchEl = document.getElementById('snarfSearchInput');
  if (searchEl) searchEl.value = '';
  var filterEl = document.getElementById('snarfStatusFilter');
  if (filterEl) filterEl.value = 'all';
  var sa = document.getElementById('selectAllCheckbox');
  if (sa) sa.checked = false;
  snarfCurrentPage = 1;
  filterSnarfTable();
  updateSnarfSummary();
}

// ===================== SNARF SUMMARY (MULTI-STAGE) =====================
function updateSnarfSummary() {
  var all = getSnarfSubmissions();
  var el;
  el = document.getElementById('summaryTotal'); if (el) el.textContent = all.length;
  el = document.getElementById('summaryPending'); if (el) el.textContent = all.filter(function (s) { return (s.status || 'Pending') === 'Pending'; }).length;
  el = document.getElementById('summaryReviewed'); if (el) el.textContent = all.filter(function (s) { return s.status === 'Reviewed'; }).length;
  el = document.getElementById('summaryApproved'); if (el) el.textContent = all.filter(function (s) { return s.status === 'Approved'; }).length;
  el = document.getElementById('summaryRejected'); if (el) el.textContent = all.filter(function (s) { return s.status === 'Rejected'; }).length;
  updateAllBadges();
}

// ===================== FILTER SNARF TABLE =====================
function filterSnarfTable() {
  var searchEl = document.getElementById("snarfSearchInput");
  var filterEl = document.getElementById("snarfStatusFilter");
  var searchTerm = searchEl ? searchEl.value.toLowerCase().trim() : '';
  var statusFilter = filterEl ? filterEl.value : 'all';
  var results = getSnarfSubmissions();

  var currentUser = getCurrentUser();

  if (currentUser.role === 'Submitter') {
    var userEmail = (currentUser.email || '').toLowerCase().trim();
    var userName = currentUser.name.toLowerCase().trim();
    var userNameParts = userName.split(/\s+/);

    results = results.filter(function (r) {
      if (r.submittedByEmail && userEmail) {
        return r.submittedByEmail.toLowerCase().trim() === userEmail;
      }
      var fn = (r.firstName || '').toLowerCase().trim();
      var ln = (r.lastName || '').toLowerCase().trim();
      var full1 = fn + ' ' + ln;
      var full2 = ln + ' ' + fn;
      var full3 = ln + ', ' + fn;
      if (full1 === userName || full2 === userName || full3 === userName) return true;
      if (userNameParts.length >= 2) {
        var allMatch = true;
        for (var p = 0; p < userNameParts.length; p++) {
          if (full1.indexOf(userNameParts[p]) === -1) { allMatch = false; break; }
        }
        return allMatch;
      }
      return false;
    });
  }

  if (statusFilter !== "all") {
    results = results.filter(function (r) { return (r.status || "Pending") === statusFilter; });
  }

  if (searchTerm) {
    results = results.filter(function (r) {
      return [r.formId, r.lastName, r.firstName, r.mi, r.office, r.telephone, r.date, r.purpose, r.description, r.period, r.fromDate, r.toDate, r.status || "Pending", r.actionedBy || "", r.reviewedBy || ""].join(" ").toLowerCase().indexOf(searchTerm) !== -1;
    });
  }

  snarfFilteredResults = results.slice().reverse();
  snarfCurrentPage = 1;
  renderSnarfPage();
}

// ===================== RENDER SNARF TABLE =====================
function renderSnarfPage() {
  var tbody = document.getElementById("snarfResultsBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  var sa = document.getElementById('selectAllCheckbox');
  if (sa) sa.checked = false;
  updateBulkButtons();

  var role = getCurrentRole();
  var colCount = (role === 'Viewer' || role === 'Submitter') ? 13 : 14;

  if (snarfFilteredResults.length === 0) {
    tbody.innerHTML = '<tr class="no-results-row"><td colspan="' + colCount + '">No matching submissions found.</td></tr>';
    var pag = document.getElementById('snarfPagination');
    if (pag) pag.innerHTML = '';
    return;
  }

  var totalPages = Math.ceil(snarfFilteredResults.length / snarfRowsPerPage);
  var start = (snarfCurrentPage - 1) * snarfRowsPerPage;
  var pageItems = snarfFilteredResults.slice(start, start + snarfRowsPerPage);

  for (var i = 0; i < pageItems.length; i++) {
    addFormResultToTable(pageItems[i]);
  }
  renderPagination(totalPages);
}

function formatActionedAt(isoString) {
  if (!isoString) return '';
  var d = new Date(isoString);
  return (d.getMonth() + 1).toString().padStart(2, '0') + '/' +
    d.getDate().toString().padStart(2, '0') + '/' +
    d.getFullYear() + ' ' +
    d.getHours().toString().padStart(2, '0') + ':' +
    d.getMinutes().toString().padStart(2, '0');
}

function addFormResultToTable(formData) {
  var tbody = document.getElementById("snarfResultsBody");
  if (!tbody) return;
  var row = document.createElement("tr");
  row.setAttribute("data-form-id", formData.formId);
  var status = formData.status || "Pending";
  var role = getCurrentRole();
  var cells = '';

  if (role === 'Viewer' || role === 'Submitter') {
    cells =
      '<td><strong>' + formData.formId + '</strong></td>' +
      '<td>' + formData.lastName + '</td>' +
      '<td>' + formData.firstName + '</td>' +
      '<td>' + formData.mi + '</td>' +
      '<td>' + formData.office + '</td>' +
      '<td>' + formData.telephone + '</td>' +
      '<td>' + formData.date + '</td>' +
      '<td title="' + formData.purpose + '">' + formData.purpose + '</td>' +
      '<td>' + formData.period + '</td>' +
      '<td>' + (formData.fromDate || '') + '</td>' +
      '<td>' + (formData.toDate || '') + '</td>' +
      '<td><span class="status-badge status-' + status.toLowerCase() + '">' + status + '</span></td>' +
      '<td><button class="snarf-view-btn" onclick="viewSnarfDetail(\'' + formData.formId + '\')">👁 View</button></td>';
  } else {
    cells =
      '<td><input type="checkbox" class="row-checkbox" value="' + formData.formId + '" onclick="onRowCheckboxChange()" /></td>' +
      '<td><strong>' + formData.formId + '</strong></td>' +
      '<td>' + formData.lastName + '</td>' +
      '<td>' + formData.firstName + '</td>' +
      '<td>' + formData.mi + '</td>' +
      '<td>' + formData.office + '</td>' +
      '<td>' + formData.telephone + '</td>' +
      '<td>' + formData.date + '</td>' +
      '<td title="' + formData.purpose + '">' + formData.purpose + '</td>' +
      '<td>' + formData.period + '</td>' +
      '<td>' + (formData.fromDate || '') + '</td>' +
      '<td>' + (formData.toDate || '') + '</td>' +
      '<td><span class="status-badge status-' + status.toLowerCase() + '">' + status + '</span></td>' +
      '<td><button class="snarf-view-btn" onclick="viewSnarfDetail(\'' + formData.formId + '\')">👁 View</button></td>';
  }

  row.innerHTML = cells;
  tbody.appendChild(row);
}

// ===================== GENERATE APPROVED ID (INCREMENTAL) =====================
function generateApprovedId(originalId) {
  var year = new Date().getFullYear();
  var subs = getSnarfSubmissions();
  var maxNum = 0;
  subs.forEach(function (s) {
    if (s.status === 'Approved' && s.formId) {
      var match = s.formId.match(/SNARF-\d{4}-(\d{5})$/);
      if (match) {
        var num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  });
  var nextNum = maxNum + 1;
  return 'SNARF-' + year + '-' + nextNum.toString().padStart(5, '0');
}

// ===================== VIEW DETAIL MODAL (MULTI-STAGE) =====================
var currentDetailFormId = null;

function viewSnarfDetail(formId) {
  var data = getSnarfSubmissions().find(function (s) { return s.formId === formId; });
  if (!data) return;
  currentDetailFormId = formId;
  var status = data.status || 'Pending';
  var isActioned = (status === 'Approved' || status === 'Rejected');
  var role = getCurrentRole();

  var canEditConduct = (role === 'Admin' || role === 'Editor') && status !== 'Approved';

  var fields = [
    { label: 'Form ID', value: '<strong>' + data.formId + '</strong>' },
    { label: 'Original Form ID', value: data.originalFormId || data.formId },
    { label: 'Last Name', value: data.lastName },
    { label: 'First Name', value: data.firstName },
    { label: 'M.I.', value: data.mi },
    { label: 'Office/Service/Division', value: data.office },
    { label: 'Telephone Number', value: data.telephone },
    { label: 'Date Submitted', value: data.date },
    { label: 'Purpose of Justification', value: data.purpose },
    { label: 'Detailed Description', value: data.description || 'N/A' },
    { label: 'Period of Use', value: data.period },
    { label: 'From Date', value: data.fromDate || 'N/A' },
    { label: 'To Date', value: data.toDate || 'N/A' },
    { label: 'Status', value: '<span class="status-badge status-' + status.toLowerCase() + '">' + status + '</span>' }
  ];

  var html = '';
  for (var f = 0; f < fields.length; f++) {
    html += '<div class="detail-row"><div class="detail-label">' + fields[f].label + ':</div><div class="detail-value">' + fields[f].value + '</div></div>';
  }

  // Type of Conduct
  var initialConduct = data.initialConduct || false;
  var regularConduct = data.regularConduct || false;
  var asRequested = data.asRequested || false;

  if (canEditConduct) {
    html += '<div class="conduct-section"><h4>📋 Type of Conduct</h4><div class="conduct-checkboxes">' +
      '<div class="conduct-check-item"><input type="checkbox" class="conduct-checkbox" id="editInitialConduct" ' + (initialConduct ? 'checked' : '') + ' /> Initial Conduct</div>' +
      '<div class="conduct-check-item"><input type="checkbox" class="conduct-checkbox" id="editRegularConduct" ' + (regularConduct ? 'checked' : '') + ' /> Regular Conduct</div>' +
      '<div class="conduct-check-item"><input type="checkbox" class="conduct-checkbox" id="editAsRequested" ' + (asRequested ? 'checked' : '') + ' /> As Requested</div>' +
      '</div></div>';
  } else {
    var ci = function (v) { return v ? '<span class="check-icon checked">✔</span>' : '<span class="check-icon unchecked">—</span>'; };
    html += '<div class="conduct-section"><h4>📋 Type of Conduct</h4><div class="conduct-checkboxes">' +
      '<div class="conduct-check-item">' + ci(initialConduct) + ' Initial Conduct</div>' +
      '<div class="conduct-check-item">' + ci(regularConduct) + ' Regular Conduct</div>' +
      '<div class="conduct-check-item">' + ci(asRequested) + ' As Requested</div>' +
      '</div></div>';
  }

  // Subsequent Conducts
  var d1c = data.firstTestCount || '', d1d = data.firstTestDate || '', d2c = data.secondTestCount || '', d2d = data.secondTestDate || '';
  var d3c = data.thirdTestCount || '', d3d = data.thirdTestDate || '', d4c = data.fourthTestCount || '', d4d = data.fourthTestDate || '';
  var h1c = data.firstHoles || '', h1d = data.firstHolesDate || '', h2c = data.secondHoles || '', h2d = data.secondHolesDate || '';
  var h3c = data.thirdHoles || '', h3d = data.thirdHolesDate || '', h4c = data.fourthHoles || '', h4d = data.fourthHolesDate || '';
  var w1c = data.firstWarnings || '', w1d = data.firstWarningsDate || '', w2c = data.secondWarnings || '', w2d = data.secondWarningsDate || '';
  var w3c = data.thirdWarnings || '', w3d = data.thirdWarningsDate || '', w4c = data.fourthWarnings || '', w4d = data.fourthWarningsDate || '';

  var tHead = '<thead><tr><th></th><th>1st</th><th>Date</th><th>2nd</th><th>Date</th><th>3rd</th><th>Date</th><th>4th</th><th>Date</th></tr></thead>';

  if (canEditConduct) {
    html += '<div class="conduct-section" style="margin-top:10px; border-left-color:#f59e0b;">' +
      '<h4>🔁 Subsequent Conducts</h4>' +
      '<table class="subsequent-table">' + tHead + '<tbody>' +
      '<tr><td class="label-cell">No. of test/s:</td>' +
      '<td><input type="text" class="conduct-input" id="edit1stCount" value="' + d1c + '" placeholder="—" /></td>' +
      '<td><input type="date" class="conduct-date-input" id="edit1stDate" value="' + d1d + '" /></td>' +
      '<td><input type="text" class="conduct-input" id="edit2ndCount" value="' + d2c + '" placeholder="—" /></td>' +
      '<td><input type="date" class="conduct-date-input" id="edit2ndDate" value="' + d2d + '" /></td>' +
      '<td><input type="text" class="conduct-input" id="edit3rdCount" value="' + d3c + '" placeholder="—" /></td>' +
      '<td><input type="date" class="conduct-date-input" id="edit3rdDate" value="' + d3d + '" /></td>' +
      '<td><input type="text" class="conduct-input" id="edit4thCount" value="' + d4c + '" placeholder="—" /></td>' +
      '<td><input type="date" class="conduct-date-input" id="edit4thDate" value="' + d4d + '" /></td></tr>' +
      '<tr><td class="label-cell">Number of Holes:</td>' +
      '<td><input type="text" class="conduct-input" id="edit1stHoles" value="' + h1c + '" placeholder="—" /></td>' +
      '<td><input type="date" class="conduct-date-input" id="edit1stHolesDate" value="' + h1d + '" /></td>' +
      '<td><input type="text" class="conduct-input" id="edit2ndHoles" value="' + h2c + '" placeholder="—" /></td>' +
      '<td><input type="date" class="conduct-date-input" id="edit2ndHolesDate" value="' + h2d + '" /></td>' +
      '<td><input type="text" class="conduct-input" id="edit3rdHoles" value="' + h3c + '" placeholder="—" /></td>' +
      '<td><input type="date" class="conduct-date-input" id="edit3rdHolesDate" value="' + h3d + '" /></td>' +
      '<td><input type="text" class="conduct-input" id="edit4thHoles" value="' + h4c + '" placeholder="—" /></td>' +
      '<td><input type="date" class="conduct-date-input" id="edit4thHolesDate" value="' + h4d + '" /></td></tr>' +
      '<tr><td class="label-cell">No. of Security Warnings:</td>' +
      '<td><input type="text" class="conduct-input" id="edit1stWarnings" value="' + w1c + '" placeholder="—" /></td>' +
      '<td><input type="date" class="conduct-date-input" id="edit1stWarningsDate" value="' + w1d + '" /></td>' +
      '<td><input type="text" class="conduct-input" id="edit2ndWarnings" value="' + w2c + '" placeholder="—" /></td>' +
      '<td><input type="date" class="conduct-date-input" id="edit2ndWarningsDate" value="' + w2d + '" /></td>' +
      '<td><input type="text" class="conduct-input" id="edit3rdWarnings" value="' + w3c + '" placeholder="—" /></td>' +
      '<td><input type="date" class="conduct-date-input" id="edit3rdWarningsDate" value="' + w3d + '" /></td>' +
      '<td><input type="text" class="conduct-input" id="edit4thWarnings" value="' + w4c + '" placeholder="—" /></td>' +
      '<td><input type="date" class="conduct-date-input" id="edit4thWarningsDate" value="' + w4d + '" /></td></tr>' +
      '</tbody></table></div>';
  } else {
    html += '<div class="conduct-section" style="margin-top:10px; border-left-color:#f59e0b;">' +
      '<h4>🔁 Subsequent Conducts</h4>' +
      '<table class="subsequent-table">' + tHead + '<tbody>' +
      '<tr><td class="label-cell">No. of test/s:</td><td>' + (d1c || '—') + '</td><td>' + (d1d || '—') + '</td><td>' + (d2c || '—') + '</td><td>' + (d2d || '—') + '</td><td>' + (d3c || '—') + '</td><td>' + (d3d || '—') + '</td><td>' + (d4c || '—') + '</td><td>' + (d4d || '—') + '</td></tr>' +
      '<tr><td class="label-cell">Number of Holes:</td><td>' + (h1c || '—') + '</td><td>' + (h1d || '—') + '</td><td>' + (h2c || '—') + '</td><td>' + (h2d || '—') + '</td><td>' + (h3c || '—') + '</td><td>' + (h3d || '—') + '</td><td>' + (h4c || '—') + '</td><td>' + (h4d || '—') + '</td></tr>' +
      '<tr><td class="label-cell">No. of Security Warnings:</td><td>' + (w1c || '—') + '</td><td>' + (w1d || '—') + '</td><td>' + (w2c || '—') + '</td><td>' + (w2d || '—') + '</td><td>' + (w3c || '—') + '</td><td>' + (w3d || '—') + '</td><td>' + (w4c || '—') + '</td><td>' + (w4d || '—') + '</td></tr>' +
      '</tbody></table></div>';
  }

  // ===== STAGE HISTORY =====
  if (data.stageHistory && data.stageHistory.length > 0) {
    html += '<div class="conduct-section" style="border-left-color:#3b82f6;">';
    html += '<h4>📜 Approval History</h4>';
    for (var sh = 0; sh < data.stageHistory.length; sh++) {
      var stage = data.stageHistory[sh];
      var stageIcon = stage.to === 'Reviewed' ? '🔵' : stage.to === 'Approved' ? '✅' : '❌';
      html += '<div class="detail-row" style="border:none;padding:5px 0;">';
      html += '<div class="detail-label">' + stageIcon + ' ' + stage.from + ' → ' + stage.to + '</div>';
      html += '<div class="detail-value"><strong>' + stage.by + '</strong> (' + stage.role + ') — ' + formatActionedAt(stage.at) + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }

  // Actioned By section
  if (status === 'Reviewed' && data.reviewedBy) {
    html += '<div class="detail-actioned-section reviewed-section"><div style="font-weight:bold;font-size:15px;margin-bottom:8px;">🔵 Reviewed (Stage 1)</div>' +
      '<div class="detail-row" style="border:none;padding:5px 0;"><div class="detail-label">Reviewed By:</div><div class="detail-value"><strong>' + data.reviewedBy + '</strong></div></div>' +
      '<div class="detail-row" style="border:none;padding:5px 0;"><div class="detail-label">Role:</div><div class="detail-value">' + (data.reviewedByRole || 'N/A') + '</div></div>' +
      '<div class="detail-row" style="border:none;padding:5px 0;"><div class="detail-label">Date/Time:</div><div class="detail-value">' + formatActionedAt(data.reviewedAt) + '</div></div>' +
      '<div style="color:#1e40af;font-size:13px;margin-top:8px;">⏳ Awaiting Supervisor approval (Stage 2)</div></div>';
  } else if (isActioned && data.actionedBy) {
    var sc = status === 'Rejected' ? 'rejected' : '';
    var al = status === 'Approved' ? '✅ Approved (Final)' : '❌ Rejected';
    html += '<div class="detail-actioned-section ' + sc + '"><div style="font-weight:bold;font-size:15px;margin-bottom:8px;">' + al + '</div>' +
      '<div class="detail-row" style="border:none;padding:5px 0;"><div class="detail-label">Actioned By:</div><div class="detail-value"><strong>' + data.actionedBy + '</strong></div></div>' +
      '<div class="detail-row" style="border:none;padding:5px 0;"><div class="detail-label">Role:</div><div class="detail-value">' + (data.actionedByRole || 'N/A') + '</div></div>' +
      '<div class="detail-row" style="border:none;padding:5px 0;"><div class="detail-label">Date/Time:</div><div class="detail-value">' + formatActionedAt(data.actionedAt) + '</div></div></div>';
  } else if (!isActioned && status !== 'Reviewed') {
    html += '<div class="detail-actioned-section pending-section"><div style="font-weight:bold;font-size:15px;margin-bottom:4px;">⏳ Pending Review</div><div style="color:#92400e;font-size:13px;">This submission has not been actioned yet.</div></div>';
  }

  var modalBody = document.getElementById('detailModalBody');
  if (modalBody) modalBody.innerHTML = html;

  // ===== MULTI-STAGE ACTION BAR =====
  var actionBarHtml = '';

  if (canEditConduct) actionBarHtml += '<button class="save-conduct-btn" onclick="saveConductFromModal()">💾 Save</button>';

  // EDITOR: Review or Reject PENDING items
  if (role === 'Editor' && status === 'Pending') {
    actionBarHtml += '<button class="detail-approve-btn" style="background-color:#3b82f6;" onclick="reviewFromModal()">🔵 Review</button>';
    actionBarHtml += '<button class="detail-reject-btn" onclick="rejectFromModal()">✘ Reject</button>';
  }

  // SUPERVISOR: Approve or Reject REVIEWED items
  if (role === 'Supervisor' && status === 'Reviewed') {
    actionBarHtml += '<button class="detail-approve-btn" onclick="approveFromModal()">✔ Approve</button>';
    actionBarHtml += '<button class="detail-reject-btn" onclick="rejectFromModal()">✘ Reject</button>';
  }

  // ADMIN: everything at any stage
  if (role === 'Admin') {
    if (status === 'Pending') {
      actionBarHtml += '<button class="detail-approve-btn" style="background-color:#3b82f6;" onclick="reviewFromModal()">🔵 Review</button>';
      actionBarHtml += '<button class="detail-approve-btn" onclick="approveFromModal()">✔ Approve</button>';
      actionBarHtml += '<button class="detail-reject-btn" onclick="rejectFromModal()">✘ Reject</button>';
    } else if (status === 'Reviewed') {
      actionBarHtml += '<button class="detail-approve-btn" onclick="approveFromModal()">✔ Approve</button>';
      actionBarHtml += '<button class="detail-reject-btn" onclick="rejectFromModal()">✘ Reject</button>';
    }
    actionBarHtml += '<button class="detail-delete-btn" onclick="deleteFromModal()">🗑 Delete</button>';
  }

  actionBarHtml += '<button class="detail-close-btn" onclick="closeDetailModal()">Close</button>';

  var actionBar = document.getElementById('detailActionBar');
  if (actionBar) actionBar.innerHTML = actionBarHtml;

  var modal = document.getElementById('detailModal');
  if (modal) modal.classList.add('active');
}

function closeDetailModal() {
  var m = document.getElementById('detailModal');
  if (m) m.classList.remove('active');
  currentDetailFormId = null;
}

function approveFromModal() { if (!currentDetailFormId) return; updateSnarfStatus(currentDetailFormId, 'Approved'); closeDetailModal(); }
function rejectFromModal() { if (!currentDetailFormId) return; updateSnarfStatus(currentDetailFormId, 'Rejected'); closeDetailModal(); }
function reviewFromModal() { if (!currentDetailFormId) return; updateSnarfStatus(currentDetailFormId, 'Reviewed'); closeDetailModal(); }
function deleteFromModal() { if (!currentDetailFormId) return; deleteSnarfSubmission(currentDetailFormId); closeDetailModal(); }

// ===================== SAVE CONDUCT DATA =====================
function saveConductFromModal() {
  if (!currentDetailFormId) return;
  var cu = getCurrentUser();
  if (cu.role !== 'Admin' && cu.role !== 'Editor') { showToast('You do not have permission.', 'error'); return; }
  var subs = getSnarfSubmissions();
  var i = -1;
  for (var x = 0; x < subs.length; x++) { if (subs[x].formId === currentDetailFormId) { i = x; break; } }
  if (i === -1) return;

  var getVal = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
  var getDate = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
  var getChk = function (id) { var el = document.getElementById(id); return el ? el.checked : false; };

  subs[i].initialConduct = getChk('editInitialConduct');
  subs[i].regularConduct = getChk('editRegularConduct');
  subs[i].asRequested = getChk('editAsRequested');
  subs[i].firstTestCount = getVal('edit1stCount');
  subs[i].firstTestDate = getDate('edit1stDate');
  subs[i].secondTestCount = getVal('edit2ndCount');
  subs[i].secondTestDate = getDate('edit2ndDate');
  subs[i].thirdTestCount = getVal('edit3rdCount');
  subs[i].thirdTestDate = getDate('edit3rdDate');
  subs[i].fourthTestCount = getVal('edit4thCount');
  subs[i].fourthTestDate = getDate('edit4thDate');
  subs[i].firstHoles = getVal('edit1stHoles');
  subs[i].firstHolesDate = getDate('edit1stHolesDate');
  subs[i].secondHoles = getVal('edit2ndHoles');
  subs[i].secondHolesDate = getDate('edit2ndHolesDate');
  subs[i].thirdHoles = getVal('edit3rdHoles');
  subs[i].thirdHolesDate = getDate('edit3rdHolesDate');
  subs[i].fourthHoles = getVal('edit4thHoles');
  subs[i].fourthHolesDate = getDate('edit4thHolesDate');
  subs[i].firstWarnings = getVal('edit1stWarnings');
  subs[i].firstWarningsDate = getDate('edit1stWarningsDate');
  subs[i].secondWarnings = getVal('edit2ndWarnings');
  subs[i].secondWarningsDate = getDate('edit2ndWarningsDate');
  subs[i].thirdWarnings = getVal('edit3rdWarnings');
  subs[i].thirdWarningsDate = getDate('edit3rdWarningsDate');
  subs[i].fourthWarnings = getVal('edit4thWarnings');
  subs[i].fourthWarningsDate = getDate('edit4thWarningsDate');

  saveSnarfSubmissions(subs);
  showToast('Conduct data saved for ' + currentDetailFormId + '.', 'success');
}

// ===================== UPDATE STATUS (MULTI-STAGE) =====================
function updateSnarfStatus(formId, newStatus) {
  var cu = getCurrentUser();
  var role = cu.role;
  if (role !== 'Admin' && role !== 'Editor' && role !== 'Supervisor') {
    showToast('You do not have permission.', 'error'); return;
  }
  var subs = getSnarfSubmissions();
  var i = -1;
  for (var x = 0; x < subs.length; x++) { if (subs[x].formId === formId) { i = x; break; } }
  if (i === -1) return;

  var currentStatus = subs[i].status || 'Pending';

  // MULTI-STAGE VALIDATION
  if (role === 'Editor') {
    if (currentStatus !== 'Pending') { showToast('Editors can only review Pending submissions.', 'error'); return; }
    if (newStatus === 'Approved') newStatus = 'Reviewed';
  }
  if (role === 'Supervisor') {
    if (currentStatus !== 'Reviewed') { showToast('Supervisors can only approve/reject Reviewed submissions.', 'error'); return; }
  }

  if (!confirm('Mark submission ' + formId + ' as "' + newStatus + '"?\n\nActioned by: ' + cu.name + ' (' + cu.role + ')')) return;

  subs[i].status = newStatus;
  subs[i].actionedBy = cu.name;
  subs[i].actionedByRole = cu.role;
  subs[i].actionedAt = new Date().toISOString();

  if (!subs[i].stageHistory) subs[i].stageHistory = [];
  subs[i].stageHistory.push({ from: currentStatus, to: newStatus, by: cu.name, role: cu.role, at: new Date().toISOString() });

  if (newStatus === 'Reviewed') {
    subs[i].reviewedBy = cu.name;
    subs[i].reviewedByRole = cu.role;
    subs[i].reviewedAt = new Date().toISOString();
  }

  if (newStatus === 'Approved') {
    subs[i].originalFormId = subs[i].formId;
    subs[i].formId = generateApprovedId(subs[i].formId);
  }

  saveSnarfSubmissions(subs); refreshAll();
  var did = newStatus === 'Approved' ? subs[i].formId : formId;
  var toastType = newStatus === 'Approved' ? 'success' : newStatus === 'Reviewed' ? 'info' : 'warning';
  showToast(did + ' ' + newStatus.toLowerCase() + ' by ' + cu.name + '.', toastType);
}

// ===================== BULK ACTION (MULTI-STAGE) =====================
function bulkAction(action) {
  var ids = getSelectedFormIds();
  if (ids.length === 0) { showToast('No submissions selected.', 'warning'); return; }
  var cu = getCurrentUser();
  var role = cu.role;

  if (action === 'Delete' && role !== 'Admin') { showToast('Only admins can delete.', 'error'); return; }
  if (action !== 'Delete' && role !== 'Admin' && role !== 'Editor' && role !== 'Supervisor') {
    showToast('No permission.', 'error'); return;
  }

  var subs = getSnarfSubmissions();

  if (action === 'Delete') {
    if (!confirm('Delete ' + ids.length + ' submission(s)?\n\nActioned by: ' + cu.name + ' (' + cu.role + ')')) return;
    subs = subs.filter(function (s) { return ids.indexOf(s.formId) === -1; });
    showToast(ids.length + ' submission(s) deleted.', 'error');
  } else {
    var processLabel = action;
    if (role === 'Editor' && action === 'Approved') processLabel = 'Reviewed';
    var label = processLabel.toLowerCase();
    if (!confirm(label + ' ' + ids.length + ' submission(s)?\n\nActioned by: ' + cu.name + ' (' + cu.role + ')')) return;

    var validCount = 0;
    subs.forEach(function (s) {
      if (ids.indexOf(s.formId) === -1) return;
      var currentStatus = s.status || 'Pending';
      var newStatus = null;

      if (role === 'Editor' && currentStatus === 'Pending') {
        newStatus = (action === 'Approved') ? 'Reviewed' : 'Rejected';
      } else if (role === 'Supervisor' && currentStatus === 'Reviewed') {
        newStatus = action;
      } else if (role === 'Admin') {
        if (currentStatus === 'Pending' && action === 'Approved') newStatus = 'Reviewed';
        else if (currentStatus === 'Reviewed' && action === 'Approved') newStatus = 'Approved';
        else if (action === 'Rejected' && (currentStatus === 'Pending' || currentStatus === 'Reviewed')) newStatus = 'Rejected';
      }

      if (newStatus) {
        if (!s.stageHistory) s.stageHistory = [];
        s.stageHistory.push({ from: currentStatus, to: newStatus, by: cu.name, role: cu.role, at: new Date().toISOString() });

        s.status = newStatus;
        s.actionedBy = cu.name;
        s.actionedByRole = cu.role;
        s.actionedAt = new Date().toISOString();

        if (newStatus === 'Reviewed') {
          s.reviewedBy = cu.name;
          s.reviewedByRole = cu.role;
          s.reviewedAt = new Date().toISOString();
        }

        if (newStatus === 'Approved') {
          s.originalFormId = s.formId;
          s.formId = generateApprovedId(s.formId);
        }

        validCount++;
      }
    });

    showToast(validCount + ' submission(s) processed by ' + cu.name + '.', 'success');
  }

  saveSnarfSubmissions(subs); refreshAll();
}

function deleteSnarfSubmission(formId) {
  if (getCurrentRole() !== 'Admin') { showToast('Only admins can delete.', 'error'); return; }
  if (!confirm('Permanently delete ' + formId + '?')) return;
  saveSnarfSubmissions(getSnarfSubmissions().filter(function (s) { return s.formId !== formId; }));
  refreshAll(); showToast(formId + ' deleted.', 'error');
}

// ===================== PAGINATION =====================
function renderPagination(totalPages) {
  var c = document.getElementById('snarfPagination');
  if (!c) return;
  var total = snarfFilteredResults.length;
  var start = (snarfCurrentPage - 1) * snarfRowsPerPage + 1;
  var end = Math.min(snarfCurrentPage * snarfRowsPerPage, total);
  var h = '<div class="pagination-info">Showing ' + start + '–' + end + ' of ' + total + '</div><div class="pagination-buttons">';
  h += '<button class="page-btn" onclick="goToSnarfPage(' + (snarfCurrentPage - 1) + ')" ' + (snarfCurrentPage === 1 ? 'disabled' : '') + '>« Prev</button>';
  for (var i = 1; i <= totalPages; i++) {
    if (totalPages <= 7 || i === 1 || i === totalPages || Math.abs(i - snarfCurrentPage) <= 1)
      h += '<button class="page-btn ' + (i === snarfCurrentPage ? 'active-page' : '') + '" onclick="goToSnarfPage(' + i + ')">' + i + '</button>';
    else if (i === snarfCurrentPage - 2 || i === snarfCurrentPage + 2)
      h += '<button class="page-btn" disabled>...</button>';
  }
  h += '<button class="page-btn" onclick="goToSnarfPage(' + (snarfCurrentPage + 1) + ')" ' + (snarfCurrentPage === totalPages ? 'disabled' : '') + '>Next »</button></div>';
  c.innerHTML = h;
}

function goToSnarfPage(p) {
  var tp = Math.ceil(snarfFilteredResults.length / snarfRowsPerPage);
  if (p < 1 || p > tp) return;
  snarfCurrentPage = p; renderSnarfPage();
}

// ===================== CHECKBOXES =====================
function toggleSelectAll(cb) {
  document.querySelectorAll('.row-checkbox').forEach(function (c) {
    c.checked = cb.checked;
    c.closest('tr').classList.toggle('selected-row', cb.checked);
  });
  updateBulkButtons();
}

function onRowCheckboxChange() {
  var cbs = document.querySelectorAll('.row-checkbox');
  var sa = document.getElementById('selectAllCheckbox');
  var allChecked = true;
  cbs.forEach(function (c) {
    if (!c.checked) allChecked = false;
    c.closest('tr').classList.toggle('selected-row', c.checked);
  });
  if (sa) sa.checked = allChecked;
  updateBulkButtons();
}

function getSelectedFormIds() {
  var ids = [];
  document.querySelectorAll('.row-checkbox:checked').forEach(function (c) { ids.push(c.value); });
  return ids;
}

function updateBulkButtons() {
  var h = getSelectedFormIds().length > 0;
  var ba = document.getElementById('bulkApproveBtn'); if (ba) ba.disabled = !h;
  var br = document.getElementById('bulkRejectBtn'); if (br) br.disabled = !h;
  var bd = document.getElementById('bulkDeleteBtn'); if (bd) bd.disabled = !h;
}

// ===================== EXPORT CSV =====================
function exportSnarfToExcel() {
  var subs = getSnarfSubmissions();
  if (subs.length === 0) { showToast('No submissions to export.', 'warning'); return; }
  var headers = ["Form ID", "Original ID", "Last Name", "First Name", "M.I.", "Office/Division", "Telephone", "Date", "Purpose", "Description", "Period", "From Date", "To Date", "Status", "Reviewed By", "Reviewed At", "Initial Conduct", "Regular Conduct", "As Requested", "1st Test Count", "1st Test Date", "2nd Test Count", "2nd Test Date", "3rd Test Count", "3rd Test Date", "4th Test Count", "4th Test Date", "1st Holes", "1st Holes Date", "2nd Holes", "2nd Holes Date", "3rd Holes", "3rd Holes Date", "4th Holes", "4th Holes Date", "1st Warnings", "1st Warnings Date", "2nd Warnings", "2nd Warnings Date", "3rd Warnings", "3rd Warnings Date", "4th Warnings", "4th Warnings Date", "Actioned By", "Actioned By Role", "Actioned At"];
  var csv = headers.map(function (h) { return '"' + h + '"'; }).join(",") + "\n";
  subs.forEach(function (s) {
    csv += [s.formId, s.originalFormId || s.formId, s.lastName, s.firstName, s.mi, s.office, s.telephone, s.date, s.purpose, s.description, s.period, s.fromDate || '', s.toDate || '', s.status || 'Pending', s.reviewedBy || '', s.reviewedAt ? formatActionedAt(s.reviewedAt) : '', s.initialConduct ? 'Yes' : 'No', s.regularConduct ? 'Yes' : 'No', s.asRequested ? 'Yes' : 'No', s.firstTestCount || '', s.firstTestDate || '', s.secondTestCount || '', s.secondTestDate || '', s.thirdTestCount || '', s.thirdTestDate || '', s.fourthTestCount || '', s.fourthTestDate || '', s.firstHoles || '', s.firstHolesDate || '', s.secondHoles || '', s.secondHolesDate || '', s.thirdHoles || '', s.thirdHolesDate || '', s.fourthHoles || '', s.fourthHolesDate || '', s.firstWarnings || '', s.firstWarningsDate || '', s.secondWarnings || '', s.secondWarningsDate || '', s.thirdWarnings || '', s.thirdWarningsDate || '', s.fourthWarnings || '', s.fourthWarningsDate || '', s.actionedBy || '', s.actionedByRole || '', s.actionedAt ? formatActionedAt(s.actionedAt) : ''].map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(",") + "\n";
  });
  var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  var link = document.createElement("a"); link.href = URL.createObjectURL(blob);
  var now = new Date();
  link.download = 'SNARF_Submissions_' + now.getFullYear() + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0') + '_' + now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0') + '.csv';
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  showToast('Export downloaded successfully!', 'success');
}

// ===================== PENDINGS TAB (MULTI-STAGE) =====================
var pendingsCurrentPage = 1;
var pendingsRowsPerPage = 10;
var pendingsFiltered = [];

function initializePendings() {
  var searchEl = document.getElementById('pendingsSearchInput'); if (searchEl) searchEl.value = '';
  var sa = document.getElementById('pendingsSelectAll'); if (sa) sa.checked = false;
  pendingsCurrentPage = 1; filterPendingsTable();
}

function filterPendingsTable() {
  var searchEl = document.getElementById("pendingsSearchInput");
  var searchTerm = searchEl ? searchEl.value.toLowerCase().trim() : '';
  var role = getCurrentRole();

  var results = getSnarfSubmissions().filter(function (s) {
    var status = s.status || 'Pending';
    if (role === 'Admin') return status === 'Pending' || status === 'Reviewed';
    if (role === 'Editor') return status === 'Pending';
    if (role === 'Supervisor') return status === 'Reviewed';
    return status === 'Pending' || status === 'Reviewed';
  });

  if (searchTerm) {
    results = results.filter(function (r) {
      return [r.formId, r.lastName, r.firstName, r.mi, r.office, r.telephone, r.date, r.purpose, r.description, r.period, r.fromDate, r.toDate].join(" ").toLowerCase().indexOf(searchTerm) !== -1;
    });
  }

  pendingsFiltered = results.slice().reverse();
  pendingsCurrentPage = 1; renderPendingsPage();
  var el = document.getElementById('pendingsTotalCount');
  if (el) el.textContent = pendingsFiltered.length;
}

function renderPendingsPage() {
  var tbody = document.getElementById("pendingsResultsBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  var sa = document.getElementById('pendingsSelectAll'); if (sa) sa.checked = false;
  updatePendingsBulkButtons();
  if (pendingsFiltered.length === 0) {
    tbody.innerHTML = '<tr class="no-results-row"><td colspan="14">🎉 No pending submissions! All caught up.</td></tr>';
    var pag = document.getElementById('pendingsPagination'); if (pag) pag.innerHTML = '';
    return;
  }
  var totalPages = Math.ceil(pendingsFiltered.length / pendingsRowsPerPage);
  var start = (pendingsCurrentPage - 1) * pendingsRowsPerPage;
  var pageItems = pendingsFiltered.slice(start, start + pendingsRowsPerPage);
  for (var i = 0; i < pageItems.length; i++) { addPendingsRow(pageItems[i]); }
  renderPendingsPagination(totalPages);
}

function addPendingsRow(formData) {
  var tbody = document.getElementById("pendingsResultsBody");
  if (!tbody) return;
  var row = document.createElement("tr");
  var status = formData.status || 'Pending';
  row.setAttribute("data-form-id", formData.formId);
  row.innerHTML = '<td><input type="checkbox" class="pendings-checkbox" value="' + formData.formId + '" onclick="onPendingsCheckboxChange()" /></td><td><strong>' + formData.formId + '</strong></td><td>' + formData.lastName + '</td><td>' + formData.firstName + '</td><td>' + formData.mi + '</td><td>' + formData.office + '</td><td>' + formData.telephone + '</td><td>' + formData.date + '</td><td title="' + formData.purpose + '">' + formData.purpose + '</td><td>' + formData.period + '</td><td>' + (formData.fromDate || '') + '</td><td>' + (formData.toDate || '') + '</td><td><span class="status-badge status-' + status.toLowerCase() + '">' + status + '</span></td><td><button class="snarf-view-btn" onclick="viewSnarfDetail(\'' + formData.formId + '\')">👁 View</button></td>';
  tbody.appendChild(row);
}

function pendingsToggleSelectAll(cb) {
  document.querySelectorAll('.pendings-checkbox').forEach(function (c) { c.checked = cb.checked; c.closest('tr').classList.toggle('selected-row', cb.checked); });
  updatePendingsBulkButtons();
}

function onPendingsCheckboxChange() {
  var cbs = document.querySelectorAll('.pendings-checkbox');
  var sa = document.getElementById('pendingsSelectAll');
  var allChecked = true;
  cbs.forEach(function (c) { if (!c.checked) allChecked = false; c.closest('tr').classList.toggle('selected-row', c.checked); });
  if (sa) sa.checked = allChecked;
  updatePendingsBulkButtons();
}

function getPendingsSelectedIds() {
  var ids = [];
  document.querySelectorAll('.pendings-checkbox:checked').forEach(function (c) { ids.push(c.value); });
  return ids;
}

function updatePendingsBulkButtons() {
  var h = getPendingsSelectedIds().length > 0;
  var ba = document.getElementById('pendingsBulkApproveBtn'); if (ba) ba.disabled = !h;
  var br = document.getElementById('pendingsBulkRejectBtn'); if (br) br.disabled = !h;
}

// ===================== PENDINGS BULK ACTION (MULTI-STAGE) =====================
function pendingsBulkAction(action) {
  var ids = getPendingsSelectedIds();
  if (ids.length === 0) { showToast('No submissions selected.', 'warning'); return; }
  var cu = getCurrentUser();
  var role = cu.role;
  if (role !== 'Admin' && role !== 'Editor' && role !== 'Supervisor') { showToast('No permission.', 'error'); return; }

  var processLabel = action;
  if (role === 'Editor' && action === 'Approved') processLabel = 'Reviewed';
  var label = processLabel.toLowerCase();
  if (!confirm(label + ' ' + ids.length + ' submission(s)?\n\nActioned by: ' + cu.name + ' (' + cu.role + ')')) return;

  var subs = getSnarfSubmissions();
  var validCount = 0;

  subs.forEach(function (s) {
    if (ids.indexOf(s.formId) === -1) return;
    var currentStatus = s.status || 'Pending';
    var newStatus = null;

    if (role === 'Editor' && currentStatus === 'Pending') {
      newStatus = (action === 'Approved') ? 'Reviewed' : 'Rejected';
    } else if (role === 'Supervisor' && currentStatus === 'Reviewed') {
      newStatus = action;
    } else if (role === 'Admin') {
      if (currentStatus === 'Pending' && action === 'Approved') newStatus = 'Reviewed';
      else if (currentStatus === 'Reviewed' && action === 'Approved') newStatus = 'Approved';
      else if (action === 'Rejected' && (currentStatus === 'Pending' || currentStatus === 'Reviewed')) newStatus = 'Rejected';
    }

    if (newStatus) {
      if (!s.stageHistory) s.stageHistory = [];
      s.stageHistory.push({ from: currentStatus, to: newStatus, by: cu.name, role: cu.role, at: new Date().toISOString() });

      s.status = newStatus;
      s.actionedBy = cu.name;
      s.actionedByRole = cu.role;
      s.actionedAt = new Date().toISOString();

      if (newStatus === 'Reviewed') {
        s.reviewedBy = cu.name;
        s.reviewedByRole = cu.role;
        s.reviewedAt = new Date().toISOString();
      }

      if (newStatus === 'Approved') {
        s.originalFormId = s.formId;
        s.formId = generateApprovedId(s.formId);
      }

      validCount++;
    }
  });

  saveSnarfSubmissions(subs);
  showToast(validCount + ' submission(s) processed by ' + cu.name + '.', 'success');
  refreshAll();
}

function renderPendingsPagination(totalPages) {
  var c = document.getElementById('pendingsPagination');
  if (!c) return;
  var total = pendingsFiltered.length;
  var start = (pendingsCurrentPage - 1) * pendingsRowsPerPage + 1;
  var end = Math.min(pendingsCurrentPage * pendingsRowsPerPage, total);
  var h = '<div class="pagination-info">Showing ' + start + '–' + end + ' of ' + total + ' pending</div><div class="pagination-buttons">';
  h += '<button class="page-btn" onclick="goToPendingsPage(' + (pendingsCurrentPage - 1) + ')" ' + (pendingsCurrentPage === 1 ? 'disabled' : '') + '>« Prev</button>';
  for (var i = 1; i <= totalPages; i++) {
    if (totalPages <= 7 || i === 1 || i === totalPages || Math.abs(i - pendingsCurrentPage) <= 1)
      h += '<button class="page-btn ' + (i === pendingsCurrentPage ? 'active-page' : '') + '" onclick="goToPendingsPage(' + i + ')">' + i + '</button>';
    else if (i === pendingsCurrentPage - 2 || i === pendingsCurrentPage + 2)
      h += '<button class="page-btn" disabled>...</button>';
  }
  h += '<button class="page-btn" onclick="goToPendingsPage(' + (pendingsCurrentPage + 1) + ')" ' + (pendingsCurrentPage === totalPages ? 'disabled' : '') + '>Next »</button></div>';
  c.innerHTML = h;
}

function goToPendingsPage(p) {
  var tp = Math.ceil(pendingsFiltered.length / pendingsRowsPerPage);
  if (p < 1 || p > tp) return;
  pendingsCurrentPage = p; renderPendingsPage();
}

// ===================== CLOSE MODALS ON BACKDROP =====================
document.querySelectorAll('.modal').forEach(function (m) {
  m.addEventListener('click', function (e) { if (e.target === this) this.classList.remove('active'); });
});
