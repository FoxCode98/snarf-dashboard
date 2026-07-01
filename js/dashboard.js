
// dashboard.js - DYNAMIC MULTI-STAGE APPROVAL + REJECT REASON + ROLE MANAGER + RECORD LOCKING + SUBMITTER TRACKING
// System roles: Admin, Viewer, Submitter (fixed, cannot be deleted)
// Approval roles: Custom, created/deleted in Role Manager, assigned to stages
// Workflow: Pending → Stage1 → Stage2 → ... → Approved
// Locking: Save → locks record to editor; Admin or owner can unlock
// Ownership: Submitters & Viewers see only their own forms; Admin/Approvers see all

// ===================== CONSTANTS =====================
var SYSTEM_ROLES = ['Admin', 'Viewer', 'Submitter'];

var STAGE_COLORS = [
  { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
  { bg: '#ede9fe', text: '#5b21b6', border: '#a78bfa' },
  { bg: '#ccfbf1', text: '#0f766e', border: '#14b8a6' },
  { bg: '#fce7f3', text: '#9d174d', border: '#ec4899' },
  { bg: '#e0e7ff', text: '#3730a3', border: '#6366f1' },
  { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
  { bg: '#fed7aa', text: '#9a3412', border: '#f97316' }
];

var ROLE_COLORS = [
  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
  { bg: '#ede9fe', text: '#5b21b6', border: '#a78bfa' },
  { bg: '#ecfeff', text: '#155e75', border: '#67e8f9' },
  { bg: '#fff1f2', text: '#9f1239', border: '#fda4af' },
  { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  { bg: '#f0f9ff', text: '#075985', border: '#7dd3fc' },
  { bg: '#fdf2f8', text: '#9d174d', border: '#f9a8d4' }
];

// Track Save before Approve/Reject
var conductSaved = false;

// ===================== SAFE PARSE HELPER =====================
function safeParse(key, fallback) {
  try {
    var s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch (e) {
    console.error('Failed to parse localStorage key "' + key + '":', e);
    return fallback;
  }
}

// ===================== XSS SANITIZATION HELPER =====================
function esc(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

// ===================== WORKFLOW CONFIG =====================
function getWorkflowConfig() {
  var config = safeParse('workflowConfig', null);
  if (!config) {
    return {
      stages: [
        { id: 'stg-default-1', name: 'Review', role: 'Editor', completedStatus: 'Reviewed', order: 1 },
        { id: 'stg-default-2', name: 'Approval', role: 'Supervisor', completedStatus: 'Approved', order: 2 }
      ]
    };
  }
  config.stages.sort(function (a, b) { return a.order - b.order; });
  return config;
}

function saveWorkflowConfig(config) {
  config.stages.forEach(function (stage, i) { stage.order = i + 1; });
  localStorage.setItem('workflowConfig', JSON.stringify(config));
}

// ===================== CUSTOM ROLE STORAGE =====================
function getCustomRoles() {
  var roles = safeParse('customRoles', null);
  if (roles) return roles;

  var config = getWorkflowConfig();
  roles = [];
  config.stages.forEach(function (stage) {
    if (roles.indexOf(stage.role) === -1 && stage.role) roles.push(stage.role);
  });
  saveCustomRoles(roles);
  return roles;
}

function saveCustomRoles(roles) {
  localStorage.setItem('customRoles', JSON.stringify(roles));
}

function addCustomRole(roleName) {
  var roles = getCustomRoles();
  if (roles.indexOf(roleName) === -1) {
    roles.push(roleName);
    saveCustomRoles(roles);
  }
}

function removeCustomRole(roleName) {
  var roles = getCustomRoles();
  roles = roles.filter(function (r) { return r !== roleName; });
  saveCustomRoles(roles);
}

// ===================== ROLE HELPERS =====================
function getAllApprovalRoles() {
  var config = getWorkflowConfig();
  var customRoles = getCustomRoles();
  var roles = [];
  config.stages.forEach(function (stage) {
    if (roles.indexOf(stage.role) === -1 && stage.role) roles.push(stage.role);
  });
  customRoles.forEach(function (r) {
    if (roles.indexOf(r) === -1) roles.push(r);
  });
  return roles;
}

function getAllRoles() {
  var roles = SYSTEM_ROLES.slice();
  getAllApprovalRoles().forEach(function (r) {
    if (roles.indexOf(r) === -1) roles.push(r);
  });
  return roles;
}

function isApprovalRole(role) {
  return getAllApprovalRoles().indexOf(role) !== -1;
}

function getNextStageIndex(submission) {
  var status = submission.status || 'Pending';
  if (status === 'Pending') return 0;
  if (status === 'Approved' || status === 'Rejected') return -1;
  var config = getWorkflowConfig();
  for (var i = 0; i < config.stages.length; i++) {
    if (config.stages[i].completedStatus === status) return i + 1;
  }
  return 0;
}

function getNextStatus(submission) {
  var config = getWorkflowConfig();
  var idx = getNextStageIndex(submission);
  if (idx < 0) return null;
  if (idx === config.stages.length - 1) return 'Approved';
  if (idx >= config.stages.length) return null;
  return config.stages[idx].completedStatus;
}

function canRoleActionSubmission(role, submission) {
  if (role === 'Admin') return true;
  var status = submission.status || 'Pending';
  if (status === 'Approved' || status === 'Rejected') return false;
  var config = getWorkflowConfig();
  var idx = getNextStageIndex(submission);
  if (idx < 0 || idx >= config.stages.length) return false;
  return config.stages[idx].role === role;
}

function getIntermediateStatuses() {
  var config = getWorkflowConfig();
  var statuses = [];
  for (var i = 0; i < config.stages.length - 1; i++) {
    if (statuses.indexOf(config.stages[i].completedStatus) === -1) {
      statuses.push(config.stages[i].completedStatus);
    }
  }
  return statuses;
}

function getAllPossibleStatuses() {
  var config = getWorkflowConfig();
  var statuses = ['Pending'];
  config.stages.forEach(function (stage) {
    if (statuses.indexOf(stage.completedStatus) === -1) statuses.push(stage.completedStatus);
  });
  if (statuses.indexOf('Approved') === -1) statuses.push('Approved');
  statuses.push('Rejected');
  return statuses;
}

function getStageColorIndex(status) {
  var config = getWorkflowConfig();
  for (var i = 0; i < config.stages.length; i++) {
    if (config.stages[i].completedStatus === status) return i;
  }
  return 0;
}

function getStatusBadgeHtml(status) {
  if (status === 'Pending') return '<span class="status-badge status-pending">' + status + '</span>';
  if (status === 'Approved') return '<span class="status-badge status-approved">' + status + '</span>';
  if (status === 'Rejected') return '<span class="status-badge status-rejected">' + status + '</span>';
  var ci = getStageColorIndex(status);
  var c = STAGE_COLORS[ci % STAGE_COLORS.length];
  return '<span class="status-badge" style="background-color:' + c.bg + ';color:' + c.text + ';">' + esc(status) + '</span>';
}

function getRoleBadgeHtml(role) {
  var fixed = { 'Admin': 'role-admin', 'Viewer': 'role-viewer', 'Submitter': 'role-submitter' };
  if (fixed[role]) return '<span class="role-badge ' + fixed[role] + '">' + role + '</span>';
  var config = getWorkflowConfig();
  var idx = -1;
  for (var i = 0; i < config.stages.length; i++) { if (config.stages[i].role === role) { idx = i; break; } }
  if (idx === -1) return '<span class="role-badge role-approval">' + esc(role) + '</span>';
  var c = ROLE_COLORS[idx % ROLE_COLORS.length];
  return '<span class="role-badge" style="background-color:' + c.bg + ';color:' + c.text + ';border:1px solid ' + c.border + ';">' + esc(role) + '</span>';
}

// ===================== TOAST =====================
function showToast(msg, type) {
  type = type || 'success';
  var c = document.getElementById('toastContainer');
  if (!c) return;
  while (c.children.length >= 5) c.firstChild.remove();
  var t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(function () { t.remove(); }, 3000);
}

// ===================== CURRENT USER =====================
function getCurrentUser() {
  var user = safeParse('currentUser', null);
  if (user) return user;
  var firstAdmin = users.find(function (u) { return u.role === 'Admin'; });
  if (firstAdmin) {
    return { name: firstAdmin.name, role: firstAdmin.role, email: firstAdmin.email };
  }
  return { name: 'Admin', role: 'Admin', email: '' };
}
function getCurrentRole() { return getCurrentUser().role || 'Viewer'; }

// ===================== LOCKING HELPERS =====================
function isLocked(sub) {
  return !!(sub && sub.lockedBy);
}

function isLockedByCurrentUser(sub) {
  var cu = getCurrentUser();
  return sub && sub.lockedBy && sub.lockedBy === cu.name;
}

function canUnlock(sub) {
  if (!sub || !sub.lockedBy) return false;
  var cu = getCurrentUser();
  return cu.role === 'Admin' || cu.name === sub.lockedBy;
}

function formatLockTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.toLocaleDateString() + ' ' +
         d.getHours().toString().padStart(2, '0') + ':' +
         d.getMinutes().toString().padStart(2, '0');
}

function unlockSubmission(formId) {
  var subs = getSnarfSubmissions();
  var i = -1;
  for (var x = 0; x < subs.length; x++) {
    if (subs[x].formId === formId) { i = x; break; }
  }
  if (i === -1) return;

  if (!canUnlock(subs[i])) {
    showToast('You are not allowed to unlock this record.', 'error');
    return;
  }

  if (!confirm('Unlock this record? Others will be able to edit it.')) return;

  subs[i].lockedBy = null;
  subs[i].lockedByRole = null;
  subs[i].lockedAt = null;

  saveSnarfSubmissions(subs);
  showToast('Record unlocked.', 'success');
  conductSaved = false;
  refreshAll();
  viewSnarfDetail(formId);
}

// ===================== ROLE-BASED ACCESS (DYNAMIC) =====================
function applyRolePermissions() {
  var user = getCurrentUser();
  var role = user.role || 'Viewer';
  var navInfo = document.getElementById('navUserInfo');
  if (navInfo) navInfo.innerHTML = '<strong>' + esc(user.name) + '</strong> • ' + esc(role);

  if (role === 'Admin') return;

  if (isApprovalRole(role)) {
    hideEl('userMgmtCard');
    hideEl('workflowCard');
    hideEl('settingsTabBtn');
    hideEl('bulkDeleteBtn');
    hideEl('newSnarfFormBtn');
    return;
  }

  if (role === 'Submitter') {
    hideEl('analyticsTabBtn');
    hideEl('settingsTabBtn');
    hideEl('pendingsTabBtn');
    hideEl('bulkApproveBtn');
    hideEl('bulkRejectBtn');
    hideEl('bulkDeleteBtn');
    hideEl('thCheckboxCol');hideEl('importCsvBtn');
    hideEl('snarfSummaryContainer');
    var nr = document.getElementById('viewerNoticeRole'); if (nr) nr.textContent = 'Submitter';
    var n = document.getElementById('viewerNotice'); if (n) n.classList.add('visible');
    return;
  }

  hideEl('analyticsTabBtn');
  hideEl('settingsTabBtn');
  hideEl('pendingsTabBtn');
  hideEl('bulkApproveBtn');
  hideEl('bulkRejectBtn');
  hideEl('bulkDeleteBtn');
  hideEl('thCheckboxCol');
  hideEl('snarfSummaryContainer');
  hideEl('importCsvBtn');
  var nr2 = document.getElementById('viewerNoticeRole'); if (nr2) nr2.textContent = role;
  var n2 = document.getElementById('viewerNotice'); if (n2) n2.classList.add('visible');
}

function hideEl(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }

// ===================== USER MANAGEMENT =====================
var users = [
  { id: 1, name: 'John Doe', email: 'john@example.com', password: '1234', role: 'Admin' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', password: '1234', role: 'Editor' },
  { id: 3, name: 'Bob Johnson', email: 'bob@example.com', password: '1234', role: 'Viewer' },
  { id: 4, name: 'Mary Wilson', email: 'mary@example.com', password: '1234', role: 'Supervisor' },
  { id: 5, name: 'Tom', email: 'tom@example.com', password: '1234', role: 'Submitter' }
];
var editingUserId = null;
var rejectPendingMode = null;
var rejectPendingIds = [];
var rejectPendingSource = null;
var newRoleCallback = null;

// ===================== PAGE LOAD =====================
window.addEventListener('DOMContentLoaded', function () {
  loadUsersFromStorage();
  displayCurrentUser();
  populateRoleDropdown();
  populateStatusFilter();
  renderUsersTable();
  renderWorkflowBuilder();
  updateDashboardStats();
  updateAllBadges();
  loadTabVisibilitySettings();
  applyRolePermissions();
  loadResourcesUI();
  try {
    filterSnarfTable();
    updateSnarfSummary();
  } catch (e) {
    console.error('Init error:', e);
  }
});

function displayCurrentUser() {
  var el = document.getElementById('welcomeMessage');
  if (el) el.textContent = 'Welcome, ' + getCurrentUser().name + '! 👋';
}

// ===================== POPULATE ROLE DROPDOWN =====================
function populateRoleDropdown() {
  var sel = document.getElementById('userRole');
  if (!sel) return;
  var roles = getAllRoles();
  var opts = '';
  roles.forEach(function (r) {
    opts += '<option value="' + esc(r) + '">' + esc(r) + '</option>';
  });
  sel.innerHTML = opts;
}

// ===================== POPULATE STATUS FILTER =====================
function populateStatusFilter() {
  var sel = document.getElementById('snarfStatusFilter');
  if (!sel) return;
  var statuses = getAllPossibleStatuses();
  var opts = '<option value="all">All Status</option>';
  statuses.forEach(function (s) {
    opts += '<option value="' + esc(s) + '">' + esc(s) + '</option>';
  });
  sel.innerHTML = opts;
}

function loadUsersFromStorage() {
  var stored = safeParse('appUsers', null);
  if (stored) users = stored;
  else saveUsersToStorage();
}

function saveUsersToStorage() { localStorage.setItem('appUsers', JSON.stringify(users)); }

// ===================== RENDER USERS TABLE =====================
function renderUsersTable(filterTerm) {
  filterTerm = filterTerm || '';
  var tbody = document.getElementById('userTableBody');
  if (!tbody) return;

  var filtered = users;
  if (filterTerm) {
    filtered = users.filter(function (u) {
      return [u.name, u.email, u.role].join(' ').toLowerCase().indexOf(filterTerm) !== -1;
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#6b7280;font-style:italic;padding:25px;">No users found.</td></tr>';
  } else {
    var rows = '';
    filtered.forEach(function (user) {
      rows += '<tr><td>' + esc(user.name) + '</td><td>' + esc(user.email) + '</td><td>' + getRoleBadgeHtml(user.role) + '</td><td><div class="action-buttons"><button class="edit-btn" onclick="openEditUserModal(' + user.id + ')">Edit</button><button class="delete-btn" onclick="deleteUser(' + user.id + ')">Delete</button></div></td></tr>';
    });
    tbody.innerHTML = rows;
  }

  var badge = document.getElementById('userCountBadge');
  if (badge) badge.textContent = users.length + ' user' + (users.length !== 1 ? 's' : '');
}

function filterUsersTable() {
  var el = document.getElementById('userSearchInput');
  renderUsersTable(el ? el.value.toLowerCase().trim() : '');
}

// ===================== OPEN ADD USER MODAL =====================
function openAddUserModal() {
  if (getCurrentRole() !== 'Admin') { showToast('Only admins can manage users.', 'error'); return; }
  editingUserId = null;
  populateRoleDropdown();
  var mt = document.getElementById('modalTitle'); if (mt) mt.textContent = 'Add New User';
  var un = document.getElementById('userName'); if (un) un.value = '';
  var ue = document.getElementById('userEmail'); if (ue) ue.value = '';
  var up = document.getElementById('userPassword');
  if (up) {
    up.value = '';
    up.placeholder = 'Enter password';
  }
  var ur = document.getElementById('userRole'); if (ur) ur.value = 'Viewer';
  var m = document.getElementById('userModal'); if (m) m.classList.add('active');
  setTimeout(function () { if (un) un.focus(); }, 150);
}

// ===================== OPEN EDIT USER MODAL =====================
function openEditUserModal(userId) {
  if (getCurrentRole() !== 'Admin') { showToast('Only admins can manage users.', 'error'); return; }
  var user = users.find(function (u) { return u.id === userId; });
  if (user) {
    editingUserId = userId;
    populateRoleDropdown();
    var mt = document.getElementById('modalTitle'); if (mt) mt.textContent = 'Edit User';
    var un = document.getElementById('userName'); if (un) un.value = user.name;
    var ue = document.getElementById('userEmail'); if (ue) ue.value = user.email;
    var up = document.getElementById('userPassword');
    if (up) {
      up.value = '';
      up.placeholder = 'Leave blank to keep current password';
    }
    var ur = document.getElementById('userRole'); if (ur) ur.value = user.role;
    var m = document.getElementById('userModal'); if (m) m.classList.add('active');
    setTimeout(function () { if (un) un.focus(); }, 150);
  }
}

function closeUserModal() { var m = document.getElementById('userModal'); if (m) m.classList.remove('active'); }

// ===================== SAVE USER =====================
function saveUser() {
  if (getCurrentRole() !== 'Admin') { showToast('Only admins can manage users.', 'error'); return; }
  var name = (document.getElementById('userName') || {}).value || '';
  var email = (document.getElementById('userEmail') || {}).value || '';
  var password = (document.getElementById('userPassword') || {}).value || '';
  var role = (document.getElementById('userRole') || {}).value || 'Viewer';
  name = name.trim(); email = email.trim(); password = password.trim();

  if (!name || !email) { showToast('Name and email are required.', 'error'); return; }
  if (!editingUserId && !password) { showToast('Password is required for new users.', 'error'); return; }

  var emailLower = email.toLowerCase();
  for (var k = 0; k < users.length; k++) {
    if (users[k].id !== editingUserId && users[k].email.toLowerCase() === emailLower) {
      showToast('Another user already has this email.', 'error');
      return;
    }
  }

  if (editingUserId) {
    var user = users.find(function (u) { return u.id === editingUserId; });
    if (user) {
      var cu = getCurrentUser();
      var wasSelf = ((cu.email && user.email === cu.email) || cu.name === user.name);

      if (user.role === 'Admin' && role !== 'Admin') {
        var admins = users.filter(function (u) { return u.role === 'Admin'; });
        if (admins.length <= 1) {
          showToast('Cannot change role — at least one Admin is required.', 'error');
          return;
        }
      }

      user.name = name;
      user.email = email;
      user.role = role;
      if (password) user.password = password;

      if (wasSelf) {
        localStorage.setItem('currentUser', JSON.stringify({
          name: name, role: role, email: email
        }));
        displayCurrentUser();
        applyRolePermissions();
      }
    }
    showToast('User updated successfully!', 'success');
  } else {
    var newId = users.length > 0 ? Math.max.apply(null, users.map(function (u) { return u.id; })) + 1 : 1;
    users.push({ id: newId, name: name, email: email, password: password, role: role });
    showToast('User added successfully!', 'success');
  }

  saveUsersToStorage(); filterUsersTable(); updateDashboardStats(); renderRoleChips(); closeUserModal();
}

// ===================== DELETE USER =====================
function deleteUser(userId) {
  if (getCurrentRole() !== 'Admin') { showToast('Only admins can manage users.', 'error'); return; }
  var cu = getCurrentUser();
  var target = users.find(function (u) { return u.id === userId; });
  if (!target) return;

  if ((cu.email && target.email === cu.email) || target.name === cu.name) {
    showToast('You cannot delete your own account.', 'error');
    return;
  }

  if (target.role === 'Admin') {
    var admins = users.filter(function (u) { return u.role === 'Admin'; });
    if (admins.length <= 1) {
      showToast('Cannot delete the last Admin account.', 'error');
      return;
    }
  }

  if (confirm('Are you sure you want to delete this user?')) {
    users = users.filter(function (u) { return u.id !== userId; });
    saveUsersToStorage(); filterUsersTable(); updateDashboardStats(); renderRoleChips();
    showToast('User deleted successfully.', 'error');
  }
}

// ===================== WORKFLOW BUILDER =====================
function renderWorkflowBuilder() {
  renderRoleChips();
  renderWorkflowPipeline();
  renderWorkflowStages();
}

function renderWorkflowPipeline() {
  var el = document.getElementById('workflowPipeline');
  if (!el) return;
  var config = getWorkflowConfig();
  var html = '<div class="pipeline-node pipeline-node-pending">📋 Pending</div>';
  config.stages.forEach(function (stage, i) {
    html += '<span class="pipeline-arrow">→</span>';
    var isLast = (i === config.stages.length - 1);
    var cls = isLast ? 'pipeline-node-approved' : 'pipeline-node-stage';
    var icon = isLast ? '✅' : '🔵';
    html += '<div class="pipeline-node ' + cls + '">' + icon + ' ' + esc(stage.completedStatus) + '<br><small style="font-size:10px;opacity:0.8;">' + esc(stage.role) + '</small></div>';
  });
  el.innerHTML = html;
}

function renderWorkflowStages() {
  var el = document.getElementById('workflowStages');
  if (!el) return;
  var config = getWorkflowConfig();
  var approvalRoles = getAllApprovalRoles();
  var html = '';

  config.stages.forEach(function (stage, i) {
    var isLast = (i === config.stages.length - 1);
    html += '<div class="stage-card" data-stage-id="' + esc(stage.id) + '">';
    html += '<div class="stage-number">' + (i + 1) + '</div>';
    html += '<div class="stage-fields">';

    html += '<div class="stage-field"><label>Stage Name</label>';
    html += '<input type="text" value="' + esc(stage.name || '') + '" onchange="onStageFieldChange(\'' + stage.id + '\', \'name\', this.value)" placeholder="e.g., Review" /></div>';

    if (!isLast) {
      html += '<div class="stage-field"><label>Status Label</label>';
      html += '<input type="text" value="' + esc(stage.completedStatus || '') + '" onchange="onStageFieldChange(\'' + stage.id + '\', \'completedStatus\', this.value)" placeholder="e.g., Reviewed" /></div>';
    } else {
      html += '<div class="stage-field"><label>Status Label</label>';
      html += '<input type="text" value="Approved" disabled style="background:#d1fae5;color:#065f46;font-weight:600;" />';
      html += '<span class="last-stage-label">Final</span></div>';
    }

    html += '<div class="stage-field"><label>Assigned Role</label>';
    html += '<select onchange="onStageRoleChange(\'' + stage.id + '\', this.value)">';
    approvalRoles.forEach(function (r) {
      html += '<option value="' + esc(r) + '"' + (stage.role === r ? ' selected' : '') + '>' + esc(r) + '</option>';
    });
    html += '<option value="__new__">+ Create New Role...</option>';
    html += '</select></div>';

    html += '</div>';

    html += '<div class="stage-controls">';
    html += '<button class="stage-ctrl-btn" onclick="moveStage(\'' + stage.id + '\', -1)" title="Move Up"' + (i === 0 ? ' disabled' : '') + '>▲</button>';
    html += '<button class="stage-ctrl-btn" onclick="moveStage(\'' + stage.id + '\', 1)" title="Move Down"' + (i === config.stages.length - 1 ? ' disabled' : '') + '>▼</button>';
    html += '<button class="stage-ctrl-btn delete-stage" onclick="removeStage(\'' + stage.id + '\')" title="Remove Stage"' + (config.stages.length <= 1 ? ' disabled' : '') + '>✕</button>';
    html += '</div>';

    html += '</div>';
  });

  el.innerHTML = html;
}

function onStageFieldChange(stageId, field, value) {
  var config = getWorkflowConfig();
  var stage = config.stages.find(function (s) { return s.id === stageId; });
  if (!stage) return;
  value = value.trim();
  if (!value) { showToast('Field cannot be empty.', 'error'); renderWorkflowBuilder(); return; }

  if (field === 'completedStatus') {
    var reserved = ['Pending', 'Approved', 'Rejected'];
    if (reserved.indexOf(value) !== -1) { showToast('"' + value + '" is a reserved status.', 'error'); renderWorkflowBuilder(); return; }
    var dupe = config.stages.find(function (s) { return s.id !== stageId && s.completedStatus === value; });
    if (dupe) { showToast('Status "' + value + '" is already used.', 'error'); renderWorkflowBuilder(); return; }
  }

  stage[field] = value;
  saveWorkflowConfig(config);
  renderWorkflowBuilder();
}

function onStageRoleChange(stageId, value) {
  if (value === '__new__') {
    newRoleCallback = function (roleName) {
      var config = getWorkflowConfig();
      var stage = config.stages.find(function (s) { return s.id === stageId; });
      if (stage) { stage.role = roleName; saveWorkflowConfig(config); }
      populateRoleDropdown();
      renderWorkflowBuilder();
    };
    openNewRoleModal();
    return;
  }
  var config = getWorkflowConfig();
  var stage = config.stages.find(function (s) { return s.id === stageId; });
  if (stage) { stage.role = value; saveWorkflowConfig(config); }
  renderWorkflowBuilder();
}

function addWorkflowStage() {
  var config = getWorkflowConfig();
  var existingRoles = getAllApprovalRoles();
  var defaultRole = existingRoles.length > 0 ? existingRoles[0] : 'Approver';

  if (existingRoles.length === 0) {
    addCustomRole('Approver');
    defaultRole = 'Approver';
  }

  var stageNum = config.stages.length + 1;
  var newStage = {
    id: 'stg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    name: 'Stage ' + stageNum,
    role: defaultRole,
    completedStatus: 'Stage ' + stageNum + ' Done',
    order: stageNum
  };

  config.stages.splice(config.stages.length - 1, 0, newStage);
  saveWorkflowConfig(config);
  renderWorkflowBuilder();
  populateRoleDropdown();
  populateStatusFilter();
  updateDashboardStats();
  updateSnarfSummary();
  showToast('Stage added. Configure and save.', 'info');
}

function removeStage(stageId) {
  var config = getWorkflowConfig();
  if (config.stages.length <= 1) { showToast('Must have at least one stage.', 'error'); return; }
  if (!confirm('Remove this stage from the workflow?')) return;
  config.stages = config.stages.filter(function (s) { return s.id !== stageId; });
  saveWorkflowConfig(config);
  renderWorkflowBuilder();
  populateRoleDropdown();
  populateStatusFilter();
  showToast('Stage removed.', 'warning');
}

function moveStage(stageId, direction) {
  var config = getWorkflowConfig();
  var idx = -1;
  for (var i = 0; i < config.stages.length; i++) { if (config.stages[i].id === stageId) { idx = i; break; } }
  if (idx === -1) return;
  var newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= config.stages.length) return;
  var temp = config.stages[idx];
  config.stages[idx] = config.stages[newIdx];
  config.stages[newIdx] = temp;
  saveWorkflowConfig(config);
  renderWorkflowBuilder();
}

function saveWorkflow() {
  var config = getWorkflowConfig();

  if (config.stages.length > 0) {
    config.stages[config.stages.length - 1].completedStatus = 'Approved';
  }

  var valid = true;
  config.stages.forEach(function (stage, i) {
    if (!stage.name || !stage.role) valid = false;
    if (i < config.stages.length - 1 && !stage.completedStatus) valid = false;
  });

  if (!valid) {
    showToast('All stages must have a name, role, and status label.', 'error');
    return;
  }

  var statuses = [];
  for (var i = 0; i < config.stages.length; i++) {
    var st = config.stages[i].completedStatus;
    if (statuses.indexOf(st) !== -1) {
      showToast('Duplicate status: "' + st + '". Each stage must have a unique status.', 'error');
      return;
    }
    statuses.push(st);
  }

  saveWorkflowConfig(config);
  populateRoleDropdown();
  populateStatusFilter();
  renderWorkflowBuilder();
  updateDashboardStats();
  updateSnarfSummary();
  updateAllBadges();
  showToast('Workflow saved successfully!', 'success');
}

// ===================== ROLE MANAGER UI =====================
function renderRoleChips() {
  var container = document.getElementById('roleChipsContainer');
  if (!container) return;

  var customRoles = getCustomRoles();
  var config = getWorkflowConfig();
  var html = '';

  SYSTEM_ROLES.forEach(function (role) {
    var userCount = users.filter(function (u) { return u.role === role; }).length;
    html += '<div class="role-chip system-role">';
    html += '<div class="role-chip-info"><span class="role-chip-name">' + role + '</span>';
    html += '<span class="role-chip-label">System · ' + userCount + ' user' + (userCount !== 1 ? 's' : '') + '</span></div>';
    html += '</div>';
  });

  customRoles.forEach(function (role) {
    var stageCount = config.stages.filter(function (s) { return s.role === role; }).length;
    var userCount = users.filter(function (u) { return u.role === role; }).length;
    var usageText = stageCount + ' stage' + (stageCount !== 1 ? 's' : '') + ' · ' + userCount + ' user' + (userCount !== 1 ? 's' : '');

    var idx = -1;
    for (var i = 0; i < config.stages.length; i++) { if (config.stages[i].role === role) { idx = i; break; } }
    var style = '';
    if (idx !== -1) {
      var c = ROLE_COLORS[idx % ROLE_COLORS.length];
      style = ' style="background:' + c.bg + ';color:' + c.text + ';border-color:' + c.border + ';"';
    }

    html += '<div class="role-chip approval-role"' + style + '>';
    html += '<div class="role-chip-info"><span class="role-chip-name">' + esc(role) + '</span>';
    html += '<span class="role-chip-usage">' + usageText + '</span></div>';
    html += '<button class="role-chip-delete" onclick="deleteCustomRole(\'' + role.replace(/'/g, "\\'") + '\')" title="Delete role">✕</button>';
    html += '</div>';
  });

  html += '<button class="add-role-chip" onclick="openNewRoleModalStandalone()">+ Add Role</button>';
  container.innerHTML = html;
}

// ===================== DELETE CUSTOM ROLE =====================
function deleteCustomRole(roleName) {
  var config = getWorkflowConfig();
  var stagesUsing = config.stages.filter(function (s) { return s.role === roleName; });
  var usersUsing = users.filter(function (u) { return u.role === roleName; });

  var warnings = [];
  if (stagesUsing.length > 0) warnings.push('⚠️ ' + stagesUsing.length + ' workflow stage(s) use this role.');
  if (usersUsing.length > 0) warnings.push('👥 ' + usersUsing.length + ' user(s) have this role and will be reassigned to "Viewer".');

  var msg = 'Delete role "' + roleName + '"?\n';
  if (warnings.length > 0) msg += '\n' + warnings.join('\n') + '\n';
  if (stagesUsing.length > 0) msg += '\nStages using this role will be reassigned to the first available approval role (or removed if no other roles exist).';
  msg += '\n\nThis action cannot be undone.';

  if (!confirm(msg)) return;

  if (usersUsing.length > 0) {
    usersUsing.forEach(function (u) { u.role = 'Viewer'; });
    saveUsersToStorage();
  }

  if (stagesUsing.length > 0) {
    var otherRoles = getCustomRoles().filter(function (r) { return r !== roleName; });

    if (otherRoles.length > 0) {
      config.stages.forEach(function (s) {
        if (s.role === roleName) s.role = otherRoles[0];
      });
      saveWorkflowConfig(config);
      showToast('Stages reassigned to "' + otherRoles[0] + '".', 'info');
    } else {
      if (config.stages.length > stagesUsing.length) {
        config.stages = config.stages.filter(function (s) { return s.role !== roleName; });
        saveWorkflowConfig(config);
      } else {
        showToast('Cannot delete — it\'s the only role in the workflow. Add another role first.', 'error');
        return;
      }
    }
  }

  removeCustomRole(roleName);

  populateRoleDropdown();
  populateStatusFilter();
  renderWorkflowBuilder();
  renderUsersTable();
  updateDashboardStats();
  updateAllBadges();
  updateSnarfSummary();

  showToast('Role "' + roleName + '" deleted.', 'warning');
}

// ===================== NEW ROLE MODAL =====================
function openNewRoleModal() {
  var inp = document.getElementById('newRoleName'); if (inp) inp.value = '';
  var m = document.getElementById('newRoleModal'); if (m) m.classList.add('active');
  if (inp) setTimeout(function () { inp.focus(); }, 150);
}

function closeNewRoleModal() {
  var m = document.getElementById('newRoleModal'); if (m) m.classList.remove('active');
}

function openNewRoleModalStandalone() {
  newRoleCallback = function (roleName) {
    addCustomRole(roleName);
    renderRoleChips();
    renderWorkflowBuilder();
    populateRoleDropdown();
  };
  openNewRoleModal();
}

function confirmNewRole() {
  var inp = document.getElementById('newRoleName');
  var name = inp ? inp.value.trim() : '';
  if (!name) { showToast('Role name cannot be empty.', 'error'); return; }

  var reserved = ['Admin', 'Viewer', 'Submitter', 'Pending', 'Approved', 'Rejected'];
  if (reserved.indexOf(name) !== -1) { showToast('"' + name + '" is reserved and cannot be used.', 'error'); return; }

  var allRoles = getAllRoles();
  var customRoles = getCustomRoles();
  if (allRoles.indexOf(name) !== -1 || customRoles.indexOf(name) !== -1) {
    showToast('Role "' + name + '" already exists.', 'error'); return;
  }

  addCustomRole(name);
  closeNewRoleModal();
  showToast('Role "' + name + '" created!', 'success');

  if (newRoleCallback) {
    newRoleCallback(name);
    newRoleCallback = null;
  }
  populateRoleDropdown();
  renderRoleChips();
}

// ===================== TAB SWITCHING =====================
function switchTab(tabName, btnElement) {
  var role = getCurrentRole();
  if ((role === 'Viewer' || role === 'Submitter') && (tabName === 'analytics' || tabName === 'settings' || tabName === 'pendings')) {
    showToast('You do not have access to this tab.', 'error'); return;
  }
  if (isApprovalRole(role) && tabName === 'settings') {
    showToast('You do not have access to this tab.', 'error'); return;
  }
  document.querySelectorAll('.tab-content').forEach(function (t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
  var tabEl = document.getElementById(tabName);
  if (tabEl) tabEl.classList.add('active');
  if (btnElement) btnElement.classList.add('active');
  if (tabName === 'snarf-form') initializeSnarfForm();
  if (tabName === 'pendings') initializePendings();
  if (tabName === 'home') { updateDashboardStats(); updateAllBadges(); }
  if (tabName === 'settings') { filterUsersTable(); renderWorkflowBuilder(); loadResourcesUI(); }
}

// ===================== OPEN SNARF FORM =====================
function openSnarfForm() {
  window.open('snarfform.html', '_blank');
}

// ===================== LOGOUT =====================
function logout() {
  showToast('Logging out...', 'info');
  localStorage.removeItem('currentUser');
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
  if (isVisible) { tabBtn.classList.remove('hidden-tab'); showToast('Tab is now visible.', 'success'); }
  else { tabBtn.classList.add('hidden-tab'); if (tabBtn.classList.contains('active')) switchTab('home', document.querySelector('.tab-btn')); showToast('Tab is now hidden.', 'info'); }
  saveTabVisibilitySettings();
}

function saveTabVisibilitySettings() {
  var s = {};
  for (var t in tabVisibilityMap) { var tog = document.getElementById(tabVisibilityMap[t].toggleId); if (tog) s[t] = tog.checked; }
  localStorage.setItem('tabVisibilitySettings', JSON.stringify(s));
}

function loadTabVisibilitySettings() {
  var s = safeParse('tabVisibilitySettings', null);
  if (!s) return;
  for (var t in s) {
    var c = tabVisibilityMap[t]; if (!c) continue;
    var tog = document.getElementById(c.toggleId); if (tog) tog.checked = s[t];
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

// ===================== BADGES (DYNAMIC) =====================

function updateAllBadges() {
  var subs = getSnarfSubmissions();
  var currentUser = getCurrentUser();
  var role = currentUser.role;

  // ✅ Apply ownership filter for Submitter & Viewer
  if (role === 'Submitter' || role === 'Viewer') {
    var userEmail = (currentUser.email || '').toLowerCase().trim();
    var userName  = (currentUser.name  || '').toLowerCase().trim();

    subs = subs.filter(function (r) {
      var rEmail = (r.submittedByEmail || '').toLowerCase().trim();
      var rName  = (r.submittedByName  || '').toLowerCase().trim();
      if (rEmail && userEmail) return rEmail === userEmail;
      if (rName  && userName)  return rName  === userName;
      return false;
    });
  }

  // Count Pending for badge
  var actionNeeded = 0;
  subs.forEach(function (s) {
    var status = s.status || 'Pending';
    if (status === 'Pending') actionNeeded++;
  });

  var snarfBadge = document.getElementById('pendingBadge');
  if (snarfBadge) {
    if (actionNeeded > 0) { snarfBadge.textContent = actionNeeded; snarfBadge.style.display = 'inline-block'; }
    else { snarfBadge.style.display = 'none'; }
  }

  var pendingsCount = 0;
  subs.forEach(function (s) {
    if ((s.status || 'Pending') === 'Pending') pendingsCount++;
  });

  var pendingsBadge = document.getElementById('pendingsBadge');
  if (pendingsBadge) {
    if (pendingsCount > 0) { pendingsBadge.textContent = pendingsCount; pendingsBadge.style.display = 'inline-block'; }
    else { pendingsBadge.style.display = 'none'; }
  }
}


// ===================== DASHBOARD STATS (DYNAMIC) =====================
function updateDashboardStats() {
  var subs = getSnarfSubmissions();
  var config = getWorkflowConfig();
  var grid = document.getElementById('homeStatsGrid');
  if (!grid) return;

  var pending = subs.filter(function (s) { return (s.status || 'Pending') === 'Pending'; }).length;
  var approved = subs.filter(function (s) { return s.status === 'Approved'; }).length;
  var rejected = subs.filter(function (s) { return s.status === 'Rejected'; }).length;
  var rate = subs.length > 0 ? Math.round((approved / subs.length) * 100) : 0;

  var html = '';
  html += '<div class="card"><div class="card-stat">' + users.length + '</div><h3>Total Users</h3><p>Registered users on the system</p></div>';
  html += '<div class="card"><div class="card-stat">' + subs.length + '</div><h3>SNARF Submissions</h3><p>Total form submissions received</p></div>';
  html += '<div class="card"><div class="card-stat">' + pending + '</div><h3>Pending</h3><p>Submissions awaiting review</p></div>';

  config.stages.forEach(function (stage, i) {
    if (i < config.stages.length - 1) {
      var count = subs.filter(function (s) { return s.status === stage.completedStatus; }).length;
      html += '<div class="card"><div class="card-stat">' + count + '</div><h3>' + esc(stage.completedStatus) + '</h3><p>' + esc(stage.name) + ' by ' + esc(stage.role) + '</p></div>';
    }
  });

  html += '<div class="card"><div class="card-stat">' + approved + '</div><h3>Approved</h3><p>Approved submissions</p></div>';
  html += '<div class="card"><div class="card-stat">' + rejected + '</div><h3>Rejected</h3><p>Rejected submissions</p></div>';
  html += '<div class="card"><div class="card-stat">' + rate + '%</div><h3>Approval Rate</h3><p>Percentage of approved requests</p></div>';

  grid.innerHTML = html;
}

// ===================== SNARF MANAGEMENT =====================
var snarfCurrentPage = 1;
var snarfRowsPerPage = 10;
var snarfFilteredResults = [];

function getSnarfSubmissions() {
  return safeParse('snarfFormSubmissions', []);
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
  var searchEl = document.getElementById('snarfSearchInput'); if (searchEl) searchEl.value = '';
  var filterEl = document.getElementById('snarfStatusFilter'); if (filterEl) filterEl.value = 'all';
  var sa = document.getElementById('selectAllCheckbox'); if (sa) sa.checked = false;
  snarfCurrentPage = 1;
  filterSnarfTable();
  updateSnarfSummary();
}

// ===================== SNARF SUMMARY (DYNAMIC) =====================
function updateSnarfSummary() {
  var all = getSnarfSubmissions();
  var config = getWorkflowConfig();
  var container = document.getElementById('snarfSummaryContainer');
  if (!container) return;

  var pending = all.filter(function (s) { return (s.status || 'Pending') === 'Pending'; }).length;
  var approved = all.filter(function (s) { return s.status === 'Approved'; }).length;
  var rejected = all.filter(function (s) { return s.status === 'Rejected'; }).length;

  var html = '';
  html += '<div class="summary-card summary-total"><span class="summary-count">' + all.length + '</span><span class="summary-label">Total</span></div>';
  html += '<div class="summary-card summary-pending"><span class="summary-count">' + pending + '</span><span class="summary-label">Pending</span></div>';

  config.stages.forEach(function (stage, i) {
    if (i < config.stages.length - 1) {
      var count = all.filter(function (s) { return s.status === stage.completedStatus; }).length;
      var ci = i % STAGE_COLORS.length;
      var c = STAGE_COLORS[ci];
      html += '<div class="summary-card" style="background:' + c.bg + ';border-left:4px solid ' + c.border + ';"><span class="summary-count" style="color:' + c.border + ';">' + count + '</span><span class="summary-label" style="color:' + c.text + ';">' + esc(stage.completedStatus) + '</span></div>';
    }
  });

  html += '<div class="summary-card summary-approved"><span class="summary-count">' + approved + '</span><span class="summary-label">Approved</span></div>';
  html += '<div class="summary-card summary-rejected"><span class="summary-count">' + rejected + '</span><span class="summary-label">Rejected</span></div>';

  container.innerHTML = html;
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

  // ✅ STRICT OWNERSHIP FILTER — Submitter & Viewer see only their own submissions
  if (currentUser.role === 'Submitter' || currentUser.role === 'Viewer') {
    var userEmail = (currentUser.email || '').toLowerCase().trim();
    var userName  = (currentUser.name  || '').toLowerCase().trim();

    results = results.filter(function (r) {
      var rEmail = (r.submittedByEmail || '').toLowerCase().trim();
      var rName  = (r.submittedByName  || '').toLowerCase().trim();

      // Strict ownership match
      if (rEmail && userEmail) return rEmail === userEmail;
      if (rName  && userName)  return rName  === userName;

      // Old submissions without submitter info → hide
      return false;
    });
  }

  if (statusFilter !== "all") results = results.filter(function (r) { return (r.status || "Pending") === statusFilter; });

  if (searchTerm) {
    results = results.filter(function (r) {
      return [r.formId, r.lastName, r.firstName, r.mi, r.office, r.telephone, r.date, r.purpose, r.description, r.period, r.fromDate, r.toDate, r.status || "Pending", r.actionedBy || "", r.lockedBy || "", r.submittedByName || "", r.submittedByEmail || ""].join(" ").toLowerCase().indexOf(searchTerm) !== -1;
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
  var sa = document.getElementById('selectAllCheckbox'); if (sa) sa.checked = false;
  updateBulkButtons();
  var role = getCurrentRole();
  var colCount = (role === 'Viewer' || role === 'Submitter') ? 13 : 14;

  if (snarfFilteredResults.length === 0) {
    tbody.innerHTML = '<tr class="no-results-row"><td colspan="' + colCount + '">No matching submissions found.</td></tr>';
    var pag = document.getElementById('snarfPagination'); if (pag) pag.innerHTML = '';
    return;
  }

  var totalPages = Math.ceil(snarfFilteredResults.length / snarfRowsPerPage);
  var start = (snarfCurrentPage - 1) * snarfRowsPerPage;
  var pageItems = snarfFilteredResults.slice(start, start + snarfRowsPerPage);
  for (var i = 0; i < pageItems.length; i++) addFormResultToTable(pageItems[i]);
  renderPagination(totalPages);
}

function formatActionedAt(isoString) {
  if (!isoString) return '';
  var d = new Date(isoString);
  return (d.getMonth() + 1).toString().padStart(2, '0') + '/' + d.getDate().toString().padStart(2, '0') + '/' + d.getFullYear() + ' ' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function addFormResultToTable(formData) {
  var tbody = document.getElementById("snarfResultsBody");
  if (!tbody) return;
  var row = document.createElement("tr");
  row.setAttribute("data-form-id", formData.formId);
  var status = formData.status || "Pending";
  var role = getCurrentRole();
  var statusHtml = getStatusBadgeHtml(status);
  var lockHtml = formData.lockedBy
    ? '<br><small style="color:#92400e;font-weight:600;">🔒 ' + esc(formData.lockedBy) + '</small>'
    : '';

  var fId = esc(formData.formId);
  var ln = esc(formData.lastName);
  var fn = esc(formData.firstName);
  var mi = esc(formData.mi);
  var of = esc(formData.office);
  var tel = esc(formData.telephone);
  var dt = esc(formData.date);
  var pur = esc(formData.purpose);
  var per = esc(formData.period);
  var fd = esc(formData.fromDate || '');
  var td2 = esc(formData.toDate || '');
  var cells = '';

  if (role === 'Viewer' || role === 'Submitter') {
    cells = '<td><strong>' + fId + '</strong></td><td>' + ln + '</td><td>' + fn + '</td><td>' + mi + '</td><td>' + of + '</td><td>' + tel + '</td><td>' + dt + '</td><td title="' + pur + '">' + pur + '</td><td>' + per + '</td><td>' + fd + '</td><td>' + td2 + '</td><td>' + statusHtml + lockHtml + '</td><td><button class="snarf-view-btn" onclick="viewSnarfDetail(\'' + formData.formId + '\')">👁 View</button></td>';
  } else {
    cells = '<td><input type="checkbox" class="row-checkbox" value="' + fId + '" onclick="onRowCheckboxChange()" /></td><td><strong>' + fId + '</strong></td><td>' + ln + '</td><td>' + fn + '</td><td>' + mi + '</td><td>' + of + '</td><td>' + tel + '</td><td>' + dt + '</td><td title="' + pur + '">' + pur + '</td><td>' + per + '</td><td>' + fd + '</td><td>' + td2 + '</td><td>' + statusHtml + lockHtml + '</td><td><button class="snarf-view-btn" onclick="viewSnarfDetail(\'' + formData.formId + '\')">👁 View</button></td>';
  }
  row.innerHTML = cells;
  tbody.appendChild(row);
}

// ===================== ATTACHMENTS RENDERING =====================
function renderAttachmentsHtml(attachments) {
  var data = getSnarfSubmissions().find(function (s) { return s.formId === currentDetailFormId; });
  var canManage = false;
  if (data) {
    var status = data.status || 'Pending';
    var isLockedStatus = (status === 'Approved' || status === 'Rejected');
    var role = getCurrentRole();
    var canAction = canRoleActionSubmission(role, data);
    var locked = isLocked(data);
    var lockedByMe = isLockedByCurrentUser(data);
    var lockBlocks = locked && !lockedByMe && role !== 'Admin';
    canManage = !isLockedStatus && (role === 'Admin' || canAction) && !lockBlocks;
  }

  var html = '';
  var count = (attachments && attachments.length) ? attachments.length : 0;

  if (count === 0) {
    html += '<div style="color:#6b7280;font-style:italic;font-size:13px;">No attachments.</div>';
  } else {
    html += '<div class="attachments-list">';
    attachments.forEach(function (f, i) {
      var ext = (f.ext || '').toLowerCase();
      var iconClass = 'image', icon = '🖼️';
      if (ext === 'pdf') { iconClass = 'pdf'; icon = '📄'; }
      else if (ext === 'pptx') { iconClass = 'pptx'; icon = '📊'; }

      var sizeText = f.size > 1024 * 1024
        ? (f.size / 1024 / 1024).toFixed(2) + ' MB'
        : (f.size / 1024).toFixed(1) + ' KB';

      var canView = (ext === 'pdf' || ext === 'jpeg' || ext === 'jpg' || ext === 'png');

      html += '<div class="attachment-item">';
      html += '<div class="attachment-icon ' + iconClass + '">' + icon + '</div>';
      html += '<div class="attachment-info"><div class="attachment-name">' + esc(f.name) + '</div>';
      html += '<div class="attachment-size">' + sizeText + '</div></div>';
      html += '<div class="attachment-actions">';
      if (canView) {
        html += '<button type="button" class="attachment-btn attachment-btn-view" onclick="viewAttachment(\'' + currentDetailFormId + '\', ' + i + ')">👁 View</button>';
      }
      html += '<button type="button" class="attachment-btn attachment-btn-download" onclick="downloadAttachment(\'' + currentDetailFormId + '\', ' + i + ')">⬇ Download</button>';
      if (canManage) {
        html += '<button type="button" class="attachment-btn attachment-btn-replace" onclick="triggerReplaceAttachment(' + i + ')">🔄 Replace</button>';
        html += '<button type="button" class="attachment-btn attachment-btn-download" style="background:#ef4444;" onmouseover="this.style.background=\'#dc2626\'" onmouseout="this.style.background=\'#ef4444\'" onclick="removeAttachmentFromSubmission(' + i + ')">🗑 Remove</button>';
      }
      html += '</div></div>';
    });
    html += '</div>';
  }

  if (canManage) {
    var MAX = 3;
    var atLimit = count >= MAX;
    html += '<div class="add-attachment-section">';
    html += '<input type="file" id="addAttachmentInput" accept=".pdf,.pptx,.jpeg,.jpg,.png" style="display:none;" onchange="onAddAttachmentSelected(event)" />';
    html += '<input type="file" id="replaceAttachmentInput" accept=".pdf,.pptx,.jpeg,.jpg,.png" style="display:none;" onchange="onReplaceAttachmentSelected(event)" />';
    if (atLimit) {
      html += '<button type="button" class="add-attachment-btn" disabled>+ Add More (Maximum reached)</button>';
      html += '<div class="attachment-hint">Maximum ' + MAX + ' files. Remove or replace existing files to add more.</div>';
    } else {
      html += '<button type="button" class="add-attachment-btn" onclick="document.getElementById(\'addAttachmentInput\').click()">+ Add More Files</button>';
      html += '<div class="attachment-hint">Allowed: PDF, PPTX, JPEG, PNG • Max 2MB each • ' + count + ' of ' + MAX + ' used</div>';
    }
    html += '</div>';
  }

  return html;
}

// ===================== ATTACHMENT MANAGEMENT =====================
var replaceAttachmentIndex = -1;
var ATTACHMENT_MAX_SIZE = 2 * 1024 * 1024;
var ATTACHMENT_MAX_COUNT = 3;
var ATTACHMENT_ALLOWED_EXT = ['pdf', 'pptx', 'jpeg', 'jpg', 'png'];

function validateAttachmentFile(file) {
  if (!file) return 'No file selected.';
  var ext = file.name.split('.').pop().toLowerCase();
  if (ATTACHMENT_ALLOWED_EXT.indexOf(ext) === -1) {
    return '"' + file.name + '" type not allowed. Use PDF, PPTX, JPEG, or PNG.';
  }
  if (file.size > ATTACHMENT_MAX_SIZE) {
    return '"' + file.name + '" exceeds 2MB limit.';
  }
  return null;
}

function readFileAsAttachment(file, onSuccess) {
  var ext = file.name.split('.').pop().toLowerCase();
  var reader = new FileReader();
  reader.onload = function (e) {
    onSuccess({
      name: file.name,
      size: file.size,
      type: file.type || ext,
      ext: ext,
      dataUrl: e.target.result
    });
  };
  reader.onerror = function () {
    showToast('Failed to read "' + file.name + '".', 'error');
  };
  reader.readAsDataURL(file);
}

function onAddAttachmentSelected(event) {
  var file = event.target.files[0];
  event.target.value = '';
  if (!file || !currentDetailFormId) return;

  var error = validateAttachmentFile(file);
  if (error) { showToast(error, 'error'); return; }

  var subs = getSnarfSubmissions();
  var i = -1;
  for (var x = 0; x < subs.length; x++) {
    if (subs[x].formId === currentDetailFormId) { i = x; break; }
  }
  if (i === -1) return;

  subs[i].attachments = subs[i].attachments || [];
  if (subs[i].attachments.length >= ATTACHMENT_MAX_COUNT) {
    showToast('Maximum ' + ATTACHMENT_MAX_COUNT + ' attachments reached.', 'error');
    return;
  }

  readFileAsAttachment(file, function (newFile) {
    subs[i].attachments.push(newFile);
    try {
      saveSnarfSubmissions(subs);
      showToast('Attachment added.', 'success');
      viewSnarfDetail(currentDetailFormId);
    } catch (e) {
      showToast('Storage full. Remove some files first.', 'error');
    }
  });
}

function triggerReplaceAttachment(index) {
  replaceAttachmentIndex = index;
  var inp = document.getElementById('replaceAttachmentInput');
  if (inp) inp.click();
}

function onReplaceAttachmentSelected(event) {
  var file = event.target.files[0];
  event.target.value = '';
  if (!file || !currentDetailFormId || replaceAttachmentIndex < 0) return;

  var error = validateAttachmentFile(file);
  if (error) { showToast(error, 'error'); replaceAttachmentIndex = -1; return; }

  var subs = getSnarfSubmissions();
  var i = -1;
  for (var x = 0; x < subs.length; x++) {
    if (subs[x].formId === currentDetailFormId) { i = x; break; }
  }
  if (i === -1) { replaceAttachmentIndex = -1; return; }

  if (!subs[i].attachments || !subs[i].attachments[replaceAttachmentIndex]) {
    replaceAttachmentIndex = -1;
    return;
  }

  var oldName = subs[i].attachments[replaceAttachmentIndex].name;

  readFileAsAttachment(file, function (newFile) {
    subs[i].attachments[replaceAttachmentIndex] = newFile;
    try {
      saveSnarfSubmissions(subs);
      showToast('Replaced "' + oldName + '" with "' + newFile.name + '".', 'success');
      replaceAttachmentIndex = -1;
      viewSnarfDetail(currentDetailFormId);
    } catch (e) {
      showToast('Storage full. Remove some files first.', 'error');
      replaceAttachmentIndex = -1;
    }
  });
}

function removeAttachmentFromSubmission(index) {
  if (!currentDetailFormId) return;
  var subs = getSnarfSubmissions();
  var i = -1;
  for (var x = 0; x < subs.length; x++) {
    if (subs[x].formId === currentDetailFormId) { i = x; break; }
  }
  if (i === -1 || !subs[i].attachments || !subs[i].attachments[index]) return;

  var name = subs[i].attachments[index].name;
  if (!confirm('Remove "' + name + '"? This cannot be undone.')) return;

  subs[i].attachments.splice(index, 1);
  saveSnarfSubmissions(subs);
  showToast('Removed "' + name + '".', 'warning');
  viewSnarfDetail(currentDetailFormId);
}


function viewAttachment(formId, index) {
  var data = getSnarfSubmissions().find(function (s) { return s.formId === formId; });
  if (!data || !data.attachments || !data.attachments[index]) return;

  var f = data.attachments[index];
  var win = window.open('', '_blank');
  if (!win) { showToast('Pop-up blocked. Allow pop-ups to view.', 'error'); return; }

  var ext = (f.ext || '').toLowerCase();
  var bodyContent = '';

  if (ext === 'pdf') {
    bodyContent =
      '<iframe src="' + f.dataUrl + '" ' +
              'width="100%" height="100%" ' +
              'style="border:none;"></iframe>';
  } else {
    bodyContent =
      '<img src="' + f.dataUrl + '" ' +
            'alt="' + esc(f.name) + '" ' +
            'style="max-width:100%;max-height:100vh;" />';
  }

  win.document.open();
  win.document.write(
    '<!DOCTYPE html>' +
    '<html>' +
      '<head>' +
        '<title>' + esc(f.name) + '</title>' +
        '<style>' +
          'html,body{margin:0;padding:0;height:100%;background:#111;}' +
          'body{display:flex;align-items:center;justify-content:center;}' +
        '</style>' +
      '</head>' +
      '<body>' + bodyContent + '</body>' +
    '</html>'
  );
  win.document.close();
}


function downloadAttachment(formId, index) {
  var data = getSnarfSubmissions().find(function (s) { return s.formId === formId; });
  if (!data || !data.attachments || !data.attachments[index]) return;
  var f = data.attachments[index];
  var link = document.createElement('a');
  link.href = f.dataUrl;
  link.download = f.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ===================== GENERATE APPROVED ID =====================
function generateApprovedId(originalId, liveSubs) {
  var year = new Date().getFullYear();
  var subs = liveSubs || getSnarfSubmissions();
  var maxNum = 0;
  subs.forEach(function (s) {
    if (s.status === 'Approved' && s.formId) {
      if (s.formId === originalId || s.originalFormId === originalId) return;
      var match = s.formId.match(/SNARF-\d{4}-(\d{5})$/);
      if (match) {
        var num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  });
  return 'SNARF-' + year + '-' + (maxNum + 1).toString().padStart(5, '0');
}

// ===================== VIEW DETAIL MODAL (DYNAMIC) =====================
var currentDetailFormId = null;

function viewSnarfDetail(formId) {
  if (currentDetailFormId !== formId) {
    conductSaved = false;
  }

  var data = getSnarfSubmissions().find(function (s) { return s.formId === formId; });
  if (!data) return;
  currentDetailFormId = formId;
  var status = data.status || 'Pending';
  var isActioned = (status === 'Approved' || status === 'Rejected');
  var role = getCurrentRole();
  var canAction = canRoleActionSubmission(role, data);

  var locked = isLocked(data);
  var lockedByMe = isLockedByCurrentUser(data);

  if (locked && !lockedByMe && role !== 'Admin') {
    canAction = false;
  }

  var canEditConduct = (role === 'Admin' || canAction) && status !== 'Approved'
    && (!locked || lockedByMe || role === 'Admin');

  // Build fields array - Submitted By visible only for Admin / approval roles
  var fields = [
    { label: 'Form ID', value: '<strong>' + esc(data.formId) + '</strong>' },
    { label: 'Original Form ID', value: esc(data.originalFormId || data.formId) }
  ];

  // Show submitter info only to Admin or approval roles
  if (role === 'Admin' || isApprovalRole(role)) {
    fields.push({
      label: 'Submitted By',
      value: '<strong>' + esc(data.submittedByName || 'Unknown') + '</strong>'
            + (data.submittedByEmail ? ' &lt;' + esc(data.submittedByEmail) + '&gt;' : '')
    });
  }

  fields = fields.concat([
    { label: 'Last Name', value: esc(data.lastName) },
    { label: 'First Name', value: esc(data.firstName) },
    { label: 'M.I.', value: esc(data.mi) },
    { label: 'Office/Service/Division', value: esc(data.office) },
    { label: 'Telephone Number', value: esc(data.telephone) },
    { label: 'Date Submitted', value: esc(data.date) },
    { label: 'Purpose of Justification', value: esc(data.purpose) },
    { label: 'Detailed Description', value: esc(data.description || 'N/A') },
    { label: 'Period of Use', value: esc(data.period) },
    { label: 'From Date', value: esc(data.fromDate || 'N/A') },
    { label: 'To Date', value: esc(data.toDate || 'N/A') },
    { label: 'Status', value: getStatusBadgeHtml(status) }
  ]);

  var html = '';

  if (locked) {
    var bannerColor = lockedByMe ? '#d1fae5' : '#fef3c7';
    var borderColor = lockedByMe ? '#10b981' : '#f59e0b';
    var textColor = lockedByMe ? '#065f46' : '#92400e';
    var icon = lockedByMe ? '✏️' : '🔒';
    var msg = lockedByMe
      ? 'You are currently working on this record'
      : 'Currently being worked on by <strong>' + esc(data.lockedBy) + '</strong> (' + esc(data.lockedByRole || 'N/A') + ')';

    html += '<div style="background:' + bannerColor + ';border-left:4px solid ' + borderColor + ';padding:10px 14px;margin-bottom:12px;border-radius:6px;color:' + textColor + ';font-weight:600;">' +
      icon + ' ' + msg +
      ' since ' + formatLockTime(data.lockedAt) +
      '</div>';
  }

  for (var f = 0; f < fields.length; f++) {
    html += '<div class="detail-row"><div class="detail-label">' + fields[f].label + ':</div><div class="detail-value">' + fields[f].value + '</div></div>';
  }

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
      '<div class="conduct-check-item">' + ci(asRequested) + ' As Requested</div></div></div>';
  }

  var d1c = esc(data.firstTestCount || ''),  d1d = esc(data.firstTestDate || '');
  var d2c = esc(data.secondTestCount || ''), d2d = esc(data.secondTestDate || '');
  var d3c = esc(data.thirdTestCount || ''),  d3d = esc(data.thirdTestDate || '');
  var d4c = esc(data.fourthTestCount || ''), d4d = esc(data.fourthTestDate || '');
  var h1c = esc(data.firstHoles || ''),  h1d = esc(data.firstHolesDate || '');
  var h2c = esc(data.secondHoles || ''), h2d = esc(data.secondHolesDate || '');
  var h3c = esc(data.thirdHoles || ''),  h3d = esc(data.thirdHolesDate || '');
  var h4c = esc(data.fourthHoles || ''), h4d = esc(data.fourthHolesDate || '');
  var w1c = esc(data.firstWarnings || ''),  w1d = esc(data.firstWarningsDate || '');
  var w2c = esc(data.secondWarnings || ''), w2d = esc(data.secondWarningsDate || '');
  var w3c = esc(data.thirdWarnings || ''),  w3d = esc(data.thirdWarningsDate || '');
  var w4c = esc(data.fourthWarnings || ''), w4d = esc(data.fourthWarningsDate || '');
  var tHead = '<thead><tr><th></th><th>1st</th><th>Date</th><th>2nd</th><th>Date</th><th>3rd</th><th>Date</th><th>4th</th><th>Date</th></tr></thead>';

  if (canEditConduct) {
    html += '<div class="conduct-section" style="margin-top:10px; border-left-color:#f59e0b;"><h4>🔁 Subsequent Conducts</h4><table class="subsequent-table">' + tHead + '<tbody>' +
      '<tr><td class="label-cell">No. of test/s:</td><td><input type="text" class="conduct-input" id="edit1stCount" value="' + d1c + '" placeholder="—" /></td><td><input type="date" class="conduct-date-input" id="edit1stDate" value="' + d1d + '" /></td><td><input type="text" class="conduct-input" id="edit2ndCount" value="' + d2c + '" placeholder="—" /></td><td><input type="date" class="conduct-date-input" id="edit2ndDate" value="' + d2d + '" /></td><td><input type="text" class="conduct-input" id="edit3rdCount" value="' + d3c + '" placeholder="—" /></td><td><input type="date" class="conduct-date-input" id="edit3rdDate" value="' + d3d + '" /></td><td><input type="text" class="conduct-input" id="edit4thCount" value="' + d4c + '" placeholder="—" /></td><td><input type="date" class="conduct-date-input" id="edit4thDate" value="' + d4d + '" /></td></tr>' +
      '<tr><td class="label-cell">Number of Holes:</td><td><input type="text" class="conduct-input" id="edit1stHoles" value="' + h1c + '" placeholder="—" /></td><td><input type="date" class="conduct-date-input" id="edit1stHolesDate" value="' + h1d + '" /></td><td><input type="text" class="conduct-input" id="edit2ndHoles" value="' + h2c + '" placeholder="—" /></td><td><input type="date" class="conduct-date-input" id="edit2ndHolesDate" value="' + h2d + '" /></td><td><input type="text" class="conduct-input" id="edit3rdHoles" value="' + h3c + '" placeholder="—" /></td><td><input type="date" class="conduct-date-input" id="edit3rdHolesDate" value="' + h3d + '" /></td><td><input type="text" class="conduct-input" id="edit4thHoles" value="' + h4c + '" placeholder="—" /></td><td><input type="date" class="conduct-date-input" id="edit4thHolesDate" value="' + h4d + '" /></td></tr>' +
      '<tr><td class="label-cell">No. of Security Warnings:</td><td><input type="text" class="conduct-input" id="edit1stWarnings" value="' + w1c + '" placeholder="—" /></td><td><input type="date" class="conduct-date-input" id="edit1stWarningsDate" value="' + w1d + '" /></td><td><input type="text" class="conduct-input" id="edit2ndWarnings" value="' + w2c + '" placeholder="—" /></td><td><input type="date" class="conduct-date-input" id="edit2ndWarningsDate" value="' + w2d + '" /></td><td><input type="text" class="conduct-input" id="edit3rdWarnings" value="' + w3c + '" placeholder="—" /></td><td><input type="date" class="conduct-date-input" id="edit3rdWarningsDate" value="' + w3d + '" /></td><td><input type="text" class="conduct-input" id="edit4thWarnings" value="' + w4c + '" placeholder="—" /></td><td><input type="date" class="conduct-date-input" id="edit4thWarningsDate" value="' + w4d + '" /></td></tr>' +
      '</tbody></table></div>';
  } else {
    html += '<div class="conduct-section" style="margin-top:10px; border-left-color:#f59e0b;"><h4>🔁 Subsequent Conducts</h4><table class="subsequent-table">' + tHead + '<tbody>' +
      '<tr><td class="label-cell">No. of test/s:</td><td>' + (d1c || '—') + '</td><td>' + (d1d || '—') + '</td><td>' + (d2c || '—') + '</td><td>' + (d2d || '—') + '</td><td>' + (d3c || '—') + '</td><td>' + (d3d || '—') + '</td><td>' + (d4c || '—') + '</td><td>' + (d4d || '—') + '</td></tr>' +
      '<tr><td class="label-cell">Number of Holes:</td><td>' + (h1c || '—') + '</td><td>' + (h1d || '—') + '</td><td>' + (h2c || '—') + '</td><td>' + (h2d || '—') + '</td><td>' + (h3c || '—') + '</td><td>' + (h3d || '—') + '</td><td>' + (h4c || '—') + '</td><td>' + (h4d || '—') + '</td></tr>' +
      '<tr><td class="label-cell">No. of Security Warnings:</td><td>' + (w1c || '—') + '</td><td>' + (w1d || '—') + '</td><td>' + (w2c || '—') + '</td><td>' + (w2d || '—') + '</td><td>' + (w3c || '—') + '</td><td>' + (w3d || '—') + '</td><td>' + (w4c || '—') + '</td><td>' + (w4d || '—') + '</td></tr>' +
      '</tbody></table></div>';
  }

  if (data.stageHistory && data.stageHistory.length > 0) {
    html += '<div class="conduct-section" style="border-left-color:#3b82f6;"><h4>📜 Approval History</h4>';
    for (var sh = 0; sh < data.stageHistory.length; sh++) {
      var stage = data.stageHistory[sh];
      var stageIcon = stage.to === 'Approved' ? '✅' : stage.to === 'Rejected' ? '❌' : '🔵';
      html += '<div class="detail-row" style="border:none;padding:5px 0;"><div class="detail-label">' + stageIcon + ' ' + esc(stage.from) + ' → ' + esc(stage.to) + '</div><div class="detail-value"><strong>' + esc(stage.by) + '</strong> (' + esc(stage.role) + ') — ' + formatActionedAt(stage.at) + '</div></div>';
      if (stage.to === 'Rejected' && (stage.reason || stage.category)) {
        html += '<div class="stage-reason-text">';
        if (stage.category) html += '<span class="rejection-category-badge">' + esc(stage.category) + '</span> ';
        html += esc(stage.reason || 'No reason provided.') + '</div>';
      }
    }
    html += '</div>';
  }

  html += '<div class="conduct-section" style="border-left-color:#6366f1;"><h4>📎 Attachments</h4>';
  html += renderAttachmentsHtml(data.attachments);
  html += '</div>';

  if (isActioned && data.actionedBy) {
    var sc = status === 'Rejected' ? 'rejected' : '';
    var al = status === 'Approved' ? '✅ Approved (Final)' : '❌ Rejected';
    html += '<div class="detail-actioned-section ' + sc + '"><div style="font-weight:bold;font-size:15px;margin-bottom:8px;">' + al + '</div>' +
      '<div class="detail-row" style="border:none;padding:5px 0;"><div class="detail-label">Actioned By:</div><div class="detail-value"><strong>' + esc(data.actionedBy) + '</strong></div></div>' +
      '<div class="detail-row" style="border:none;padding:5px 0;"><div class="detail-label">Role:</div><div class="detail-value">' + esc(data.actionedByRole || 'N/A') + '</div></div>' +
      '<div class="detail-row" style="border:none;padding:5px 0;"><div class="detail-label">Date/Time:</div><div class="detail-value">' + formatActionedAt(data.actionedAt) + '</div></div></div>';
    if (status === 'Rejected' && (data.rejectReason || data.rejectCategory)) {
      html += '<div class="rejection-reason-display"><h4>📝 Rejection Reason</h4>';
      if (data.rejectCategory) html += '<div class="rejection-category-badge">' + esc(data.rejectCategory) + '</div>';
      html += '<div class="rejection-reason-text">' + esc(data.rejectReason || 'No reason provided.') + '</div></div>';
    }
  } else if (!isActioned) {
    var nextStatus = getNextStatus(data);
    var wfConfig = getWorkflowConfig();
    var idx = getNextStageIndex(data);
    var waitingRole = (idx >= 0 && idx < wfConfig.stages.length) ? wfConfig.stages[idx].role : 'N/A';
    var sectionClass = status === 'Pending' ? 'pending-section' : 'reviewed-section';
    html += '<div class="detail-actioned-section ' + sectionClass + '"><div style="font-weight:bold;font-size:15px;margin-bottom:4px;">⏳ ' + esc(status) + '</div><div style="color:#92400e;font-size:13px;">Awaiting action from <strong>' + esc(waitingRole) + '</strong>' + (nextStatus ? ' → ' + esc(nextStatus) : '') + '</div></div>';
  }

  var modalBody = document.getElementById('detailModalBody');
  if (modalBody) modalBody.innerHTML = html;

  var actionBarHtml = '';
  if (canEditConduct) actionBarHtml += '<button class="save-conduct-btn" onclick="saveConductFromModal()">💾 Save</button>';

  if (canAction && !isActioned && conductSaved) {
    var nextSt = getNextStatus(data);
    if (nextSt) {
      var btnLabel = nextSt === 'Approved' ? '✔ Approve' : '🔵 ' + esc(nextSt);
      var btnColor = nextSt === 'Approved' ? '' : ' style="background-color:#3b82f6;"';
      actionBarHtml += '<button class="detail-approve-btn"' + btnColor + ' onclick="advanceFromModal()">' + btnLabel + '</button>';
    }
    actionBarHtml += '<button class="detail-reject-btn" onclick="rejectFromModal()">✘ Reject</button>';
  }

  if (locked && canUnlock(data)) {
    actionBarHtml += '<button class="detail-close-btn" style="background:#f59e0b;" onclick="unlockSubmission(\'' + currentDetailFormId + '\')">🔓 Unlock</button>';
  }

  if (role === 'Admin') actionBarHtml += '<button class="detail-delete-btn" onclick="deleteFromModal()">🗑 Delete</button>';
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
  conductSaved = false;
}
function advanceFromModal() { if (!currentDetailFormId) return; advanceSubmission(currentDetailFormId); closeDetailModal(); }
function deleteFromModal() { if (!currentDetailFormId) return; deleteSnarfSubmission(currentDetailFormId); closeDetailModal(); }
function rejectFromModal() { if (!currentDetailFormId) return; openRejectModal('single', currentDetailFormId, 'snarf'); }

// ===================== REJECT REASON MODAL =====================
function openRejectModal(mode, ids, source) {
  rejectPendingMode = mode;
  rejectPendingIds = Array.isArray(ids) ? ids : [ids];
  rejectPendingSource = source || 'snarf';
  var cat = document.getElementById('rejectCategory'); if (cat) cat.value = '';
  var txt = document.getElementById('rejectReasonText'); if (txt) { txt.value = ''; txt.classList.remove('error'); }
  var count = document.getElementById('rejectCharCount'); if (count) { count.textContent = '0 / 500'; count.className = 'reject-char-count'; }
  var valMsg = document.getElementById('rejectValidationMsg'); if (valMsg) valMsg.classList.remove('visible');
  var confirmBtn = document.getElementById('rejectConfirmBtn'); if (confirmBtn) confirmBtn.disabled = true;
  var info = document.getElementById('rejectTargetInfo');
  if (info) {
    if (rejectPendingIds.length === 1) info.innerHTML = 'Rejecting: <strong>' + esc(rejectPendingIds[0]) + '</strong>';
    else info.innerHTML = 'Rejecting <strong>' + rejectPendingIds.length + ' submission(s)</strong>';
  }
  var modal = document.getElementById('rejectReasonModal'); if (modal) modal.classList.add('active');
  if (txt) setTimeout(function () { txt.focus(); }, 150);
}

function closeRejectModal() {
  var modal = document.getElementById('rejectReasonModal'); if (modal) modal.classList.remove('active');
  rejectPendingMode = null; rejectPendingIds = []; rejectPendingSource = null;
}


function onRejectReasonInput() {
  var txt = document.getElementById('rejectReasonText');
  var count = document.getElementById('rejectCharCount');
  var confirmBtn = document.getElementById('rejectConfirmBtn');
  var valMsg = document.getElementById('rejectValidationMsg');
  if (!txt) return;
  var len = txt.value.trim().length;
  var rawLen = txt.value.length;
  var max = 500;
  if (rawLen > max) { txt.value = txt.value.substring(0, max); rawLen = max; len = txt.value.trim().length; }
  if (count) { count.textContent = rawLen + ' / ' + max; count.className = 'reject-char-count'; if (rawLen >= max * 0.9) count.classList.add('at-limit'); else if (rawLen >= max * 0.7) count.classList.add('near-limit'); }
  if (confirmBtn) confirmBtn.disabled = (len === 0);
  if (txt.classList.contains('error') && len > 0) { txt.classList.remove('error'); if (valMsg) valMsg.classList.remove('visible'); }
}

function confirmReject() {
  var txt = document.getElementById('rejectReasonText');
  var cat = document.getElementById('rejectCategory');
  var valMsg = document.getElementById('rejectValidationMsg');
  var reason = txt ? txt.value.trim() : '';
  var category = cat ? cat.value : '';
  if (!reason) { if (txt) { txt.classList.add('error'); txt.focus(); } if (valMsg) valMsg.classList.add('visible'); return; }
  var mode = rejectPendingMode; var ids = rejectPendingIds.slice(); var source = rejectPendingSource;
  closeRejectModal();
  if (mode === 'single' && ids.length === 1) { rejectSubmission(ids[0], reason, category); closeDetailModal(); }
  else if (mode === 'bulk') processBulkReject(ids, reason, category, source);
}

// ===================== ADVANCE SUBMISSION (DYNAMIC) =====================
function advanceSubmission(formId) {
  var cu = getCurrentUser();
  var role = cu.role;
  var subs = getSnarfSubmissions();
  var i = -1;
  for (var x = 0; x < subs.length; x++) { if (subs[x].formId === formId) { i = x; break; } }
  if (i === -1) return;

  if (!canRoleActionSubmission(role, subs[i])) { showToast('You cannot action this submission at its current stage.', 'error'); return; }

  if (isLocked(subs[i]) && !isLockedByCurrentUser(subs[i]) && role !== 'Admin') {
    showToast('Record is locked by ' + subs[i].lockedBy + '. Cannot advance.', 'error');
    return;
  }

  var nextSt = getNextStatus(subs[i]);
  if (!nextSt) { showToast('No next stage available.', 'error'); return; }

  var currentStatus = subs[i].status || 'Pending';
  if (!confirm('Advance submission ' + formId + ' to "' + nextSt + '"?\n\nActioned by: ' + cu.name + ' (' + cu.role + ')')) return;

  if (!subs[i].stageHistory) subs[i].stageHistory = [];
  subs[i].stageHistory.push({ from: currentStatus, to: nextSt, by: cu.name, role: cu.role, at: new Date().toISOString() });

  subs[i].status = nextSt;
  subs[i].actionedBy = cu.name;
  subs[i].actionedByRole = cu.role;
  subs[i].actionedAt = new Date().toISOString();

  subs[i].lockedBy = null;
  subs[i].lockedByRole = null;
  subs[i].lockedAt = null;

  if (nextSt === 'Approved') {
    subs[i].originalFormId = subs[i].formId;
    subs[i].formId = generateApprovedId(subs[i].originalFormId, subs);
  }

  saveSnarfSubmissions(subs); refreshAll();
  var did = nextSt === 'Approved' ? subs[i].formId : formId;
  var toastType = nextSt === 'Approved' ? 'success' : 'info';
  showToast(did + ' → ' + nextSt + ' by ' + cu.name + '.', toastType);
}

// ===================== REJECT SUBMISSION =====================
function rejectSubmission(formId, reason, category) {
  var cu = getCurrentUser();
  var role = cu.role;
  var subs = getSnarfSubmissions();
  var i = -1;
  for (var x = 0; x < subs.length; x++) { if (subs[x].formId === formId) { i = x; break; } }
  if (i === -1) return;

  if (!canRoleActionSubmission(role, subs[i])) { showToast('You cannot action this submission.', 'error'); return; }

  if (isLocked(subs[i]) && !isLockedByCurrentUser(subs[i]) && role !== 'Admin') {
    showToast('Record is locked by ' + subs[i].lockedBy + '. Cannot reject.', 'error');
    return;
  }

  var currentStatus = subs[i].status || 'Pending';
  if (!confirm('Reject submission ' + formId + '?\n\nActioned by: ' + cu.name + ' (' + cu.role + ')')) return;

  if (!subs[i].stageHistory) subs[i].stageHistory = [];
  subs[i].stageHistory.push({ from: currentStatus, to: 'Rejected', by: cu.name, role: cu.role, at: new Date().toISOString(), reason: reason, category: category });

  subs[i].status = 'Rejected';
  subs[i].actionedBy = cu.name;
  subs[i].actionedByRole = cu.role;
  subs[i].actionedAt = new Date().toISOString();
  subs[i].rejectReason = reason;
  subs[i].rejectCategory = category;

  subs[i].lockedBy = null;
  subs[i].lockedByRole = null;
  subs[i].lockedAt = null;

  saveSnarfSubmissions(subs); refreshAll();
  showToast(formId + ' rejected by ' + cu.name + '.', 'warning');
}

function processBulkReject(ids, reason, category, source) {
  var cu = getCurrentUser();
  var role = cu.role;
  if (!confirm('Reject ' + ids.length + ' submission(s)?\n\nActioned by: ' + cu.name + ' (' + cu.role + ')')) return;
  var subs = getSnarfSubmissions();
  var validCount = 0;
  subs.forEach(function (s) {
    if (ids.indexOf(s.formId) === -1) return;
    if (!canRoleActionSubmission(role, s)) return;
    if (isLocked(s) && s.lockedBy !== cu.name && role !== 'Admin') return;

    var currentStatus = s.status || 'Pending';
    if (!s.stageHistory) s.stageHistory = [];
    s.stageHistory.push({ from: currentStatus, to: 'Rejected', by: cu.name, role: cu.role, at: new Date().toISOString(), reason: reason, category: category });
    s.status = 'Rejected'; s.actionedBy = cu.name; s.actionedByRole = cu.role; s.actionedAt = new Date().toISOString();
    s.rejectReason = reason; s.rejectCategory = category;
    s.lockedBy = null; s.lockedByRole = null; s.lockedAt = null;
    validCount++;
  });
  saveSnarfSubmissions(subs);
  showToast(validCount + ' submission(s) rejected by ' + cu.name + '.', 'warning');
  refreshAll();
}

// ===================== SAVE CONDUCT DATA =====================
function saveConductFromModal() {
  if (!currentDetailFormId) return;
  var cu = getCurrentUser();
  var subs = getSnarfSubmissions();
  var i = -1;
  for (var x = 0; x < subs.length; x++) { if (subs[x].formId === currentDetailFormId) { i = x; break; } }
  if (i === -1) return;

  var role = getCurrentRole();
  if (isLocked(subs[i]) && !isLockedByCurrentUser(subs[i]) && role !== 'Admin') {
    showToast('Record is locked by ' + subs[i].lockedBy + '. Cannot save.', 'error');
    return;
  }

  var getVal = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
  var getDate = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
  var getChk = function (id) { var el = document.getElementById(id); return el ? el.checked : false; };

  subs[i].initialConduct = getChk('editInitialConduct');
  subs[i].regularConduct = getChk('editRegularConduct');
  subs[i].asRequested = getChk('editAsRequested');
  subs[i].firstTestCount = getVal('edit1stCount'); subs[i].firstTestDate = getDate('edit1stDate');
  subs[i].secondTestCount = getVal('edit2ndCount'); subs[i].secondTestDate = getDate('edit2ndDate');
  subs[i].thirdTestCount = getVal('edit3rdCount'); subs[i].thirdTestDate = getDate('edit3rdDate');
  subs[i].fourthTestCount = getVal('edit4thCount'); subs[i].fourthTestDate = getDate('edit4thDate');
  subs[i].firstHoles = getVal('edit1stHoles'); subs[i].firstHolesDate = getDate('edit1stHolesDate');
  subs[i].secondHoles = getVal('edit2ndHoles'); subs[i].secondHolesDate = getDate('edit2ndHolesDate');
  subs[i].thirdHoles = getVal('edit3rdHoles'); subs[i].thirdHolesDate = getDate('edit3rdHolesDate');
  subs[i].fourthHoles = getVal('edit4thHoles'); subs[i].fourthHolesDate = getDate('edit4thHolesDate');
  subs[i].firstWarnings = getVal('edit1stWarnings'); subs[i].firstWarningsDate = getDate('edit1stWarningsDate');
  subs[i].secondWarnings = getVal('edit2ndWarnings'); subs[i].secondWarningsDate = getDate('edit2ndWarningsDate');
  subs[i].thirdWarnings = getVal('edit3rdWarnings'); subs[i].thirdWarningsDate = getDate('edit3rdWarningsDate');
  subs[i].fourthWarnings = getVal('edit4thWarnings'); subs[i].fourthWarningsDate = getDate('edit4thWarningsDate');

  subs[i].lockedBy = cu.name;
  subs[i].lockedByRole = cu.role;
  subs[i].lockedAt = new Date().toISOString();

  saveSnarfSubmissions(subs);
  showToast('Saved and locked to ' + cu.name + '.', 'success');

  conductSaved = true;
  refreshAll();
  viewSnarfDetail(currentDetailFormId);
}

// ===================== BULK ACTION (DYNAMIC) =====================
function bulkAction(action) {
  var ids = getSelectedFormIds();
  if (ids.length === 0) { showToast('No submissions selected.', 'warning'); return; }
  var cu = getCurrentUser(); var role = cu.role;
  if (action === 'Delete' && role !== 'Admin') { showToast('Only admins can delete.', 'error'); return; }
  if (action === 'Rejected') { openRejectModal('bulk', ids, 'snarf'); return; }

  var subs = getSnarfSubmissions();

  if (action === 'Delete') {
    if (!confirm('Delete ' + ids.length + ' submission(s)?')) return;
    subs = subs.filter(function (s) { return ids.indexOf(s.formId) === -1; });
    saveSnarfSubmissions(subs); refreshAll();
    showToast(ids.length + ' submission(s) deleted.', 'error'); return;
  }

  if (!confirm('Advance ' + ids.length + ' submission(s)?\n\nActioned by: ' + cu.name + ' (' + cu.role + ')')) return;
  var validCount = 0;
  var skippedLocked = 0;
  subs.forEach(function (s) {
    if (ids.indexOf(s.formId) === -1) return;
    if (!canRoleActionSubmission(role, s)) return;

    if (isLocked(s) && s.lockedBy !== cu.name && role !== 'Admin') {
      skippedLocked++;
      return;
    }

    var nextSt = getNextStatus(s);
    if (!nextSt) return;
    var currentStatus = s.status || 'Pending';
    if (!s.stageHistory) s.stageHistory = [];
    s.stageHistory.push({ from: currentStatus, to: nextSt, by: cu.name, role: cu.role, at: new Date().toISOString() });
    s.status = nextSt; s.actionedBy = cu.name; s.actionedByRole = cu.role; s.actionedAt = new Date().toISOString();
    s.lockedBy = null; s.lockedByRole = null; s.lockedAt = null;
    if (nextSt === 'Approved') { s.originalFormId = s.formId; s.formId = generateApprovedId(s.originalFormId, subs); }
    validCount++;
  });
  saveSnarfSubmissions(subs);
  var msg = validCount + ' submission(s) advanced by ' + cu.name + '.';
  if (skippedLocked > 0) msg += ' (' + skippedLocked + ' skipped — locked by others)';
  showToast(msg, 'success');
  refreshAll();
}

function deleteSnarfSubmission(formId) {
  if (getCurrentRole() !== 'Admin') { showToast('Only admins can delete.', 'error'); return; }
  if (!confirm('Permanently delete ' + formId + '?')) return;
  saveSnarfSubmissions(getSnarfSubmissions().filter(function (s) { return s.formId !== formId; }));
  refreshAll(); showToast(formId + ' deleted.', 'error');
}

// ===================== PAGINATION =====================
function renderPagination(totalPages) {
  var c = document.getElementById('snarfPagination'); if (!c) return;
  var total = snarfFilteredResults.length;
  var start = (snarfCurrentPage - 1) * snarfRowsPerPage + 1;
  var end = Math.min(snarfCurrentPage * snarfRowsPerPage, total);
  var h = '<div class="pagination-info">Showing ' + start + '–' + end + ' of ' + total + '</div><div class="pagination-buttons">';
  h += '<button class="page-btn" onclick="goToSnarfPage(' + (snarfCurrentPage - 1) + ')" ' + (snarfCurrentPage === 1 ? 'disabled' : '') + '>« Prev</button>';
  for (var i = 1; i <= totalPages; i++) {
    if (totalPages <= 7 || i === 1 || i === totalPages || Math.abs(i - snarfCurrentPage) <= 1)
      h += '<button class="page-btn ' + (i === snarfCurrentPage ? 'active-page' : '') + '" onclick="goToSnarfPage(' + i + ')">' + i + '</button>';
    else if (i === snarfCurrentPage - 2 || i === snarfCurrentPage + 2) h += '<button class="page-btn" disabled>...</button>';
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
  document.querySelectorAll('.row-checkbox').forEach(function (c) { c.checked = cb.checked; c.closest('tr').classList.toggle('selected-row', cb.checked); });
  updateBulkButtons();
}

function onRowCheckboxChange() {
  var cbs = document.querySelectorAll('.row-checkbox');
  var sa = document.getElementById('selectAllCheckbox');
  var allChecked = cbs.length > 0;
  cbs.forEach(function (c) { if (!c.checked) allChecked = false; c.closest('tr').classList.toggle('selected-row', c.checked); });
  if (sa) sa.checked = allChecked;
  updateBulkButtons();
}

function getSelectedFormIds() {
  var ids = []; document.querySelectorAll('.row-checkbox:checked').forEach(function (c) { ids.push(c.value); }); return ids;
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
  var headers = ["Form ID", "Original ID", "Submitted By Name", "Submitted By Email", "Last Name", "First Name", "M.I.", "Office/Division", "Telephone", "Date", "Purpose", "Description", "Period", "From Date", "To Date", "Status", "Reject Category", "Reject Reason", "Initial Conduct", "Regular Conduct", "As Requested", "1st Test Count", "1st Test Date", "2nd Test Count", "2nd Test Date", "3rd Test Count", "3rd Test Date", "4th Test Count", "4th Test Date", "1st Holes", "1st Holes Date", "2nd Holes", "2nd Holes Date", "3rd Holes", "3rd Holes Date", "4th Holes", "4th Holes Date", "1st Warnings", "1st Warnings Date", "2nd Warnings", "2nd Warnings Date", "3rd Warnings", "3rd Warnings Date", "4th Warnings", "4th Warnings Date", "Actioned By", "Actioned By Role", "Actioned At", "Locked By", "Locked By Role", "Locked At"];
  var csv = headers.map(function (h) { return '"' + h + '"'; }).join(",") + "\n";
  subs.forEach(function (s) {
    csv += [
      s.formId, s.originalFormId || s.formId, s.submittedByName || '', s.submittedByEmail || '',
      s.lastName, s.firstName, s.mi, s.office, s.telephone, s.date, s.purpose, s.description, s.period, s.fromDate || '', s.toDate || '',
      s.status || 'Pending', s.rejectCategory || '', s.rejectReason || '',
      s.initialConduct ? 'Yes' : 'No', s.regularConduct ? 'Yes' : 'No', s.asRequested ? 'Yes' : 'No',
      s.firstTestCount || '', s.firstTestDate || '', s.secondTestCount || '', s.secondTestDate || '', s.thirdTestCount || '', s.thirdTestDate || '', s.fourthTestCount || '', s.fourthTestDate || '',
      s.firstHoles || '', s.firstHolesDate || '', s.secondHoles || '', s.secondHolesDate || '', s.thirdHoles || '', s.thirdHolesDate || '', s.fourthHoles || '', s.fourthHolesDate || '',
      s.firstWarnings || '', s.firstWarningsDate || '', s.secondWarnings || '', s.secondWarningsDate || '', s.thirdWarnings || '', s.thirdWarningsDate || '', s.fourthWarnings || '', s.fourthWarningsDate || '',
      s.actionedBy || '', s.actionedByRole || '', s.actionedAt ? formatActionedAt(s.actionedAt) : '',
      s.lockedBy || '', s.lockedByRole || '', s.lockedAt ? formatActionedAt(s.lockedAt) : ''
    ].map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(",") + "\n";
  });
  var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  var link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  var now = new Date();
  link.download = 'SNARF_Submissions_' + now.getFullYear() + (now.getMonth() + 1).toString().padStart(2, '0') + now.getDate().toString().padStart(2, '0') + '_' + now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0') + '.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Export downloaded successfully!', 'success');
}


// ===================== IMPORT FROM CSV (DISASTER RECOVERY) =====================
function importSnarfFromCsv(event) {
  if (getCurrentRole() !== 'Admin') {
    showToast('Only Admin can import data.', 'error');
    return;
  }

  var file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  if (!confirm('Importing will MERGE submissions from the CSV.\n\n• Existing records with same Form ID will be UPDATED\n• New records will be ADDED\n\nContinue?')) return;

  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var text = e.target.result;

      // Remove BOM if present
      if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);

      var rows = parseCsv(text);
      if (rows.length < 2) {
        showToast('CSV is empty or invalid.', 'error');
        return;
      }

      var headers = rows[0];
      var existing = getSnarfSubmissions();
      var existingMap = {};
      existing.forEach(function (s) { existingMap[s.formId] = s; });

      var added = 0, updated = 0, skipped = 0;

      for (var i = 1; i < rows.length; i++) {
        var row = rows[i];
        if (!row || row.length < 2) continue;

        var sub = {};
        headers.forEach(function (h, j) {
          sub[csvHeaderToKey(h)] = row[j] || '';
        });

        if (!sub.formId) { skipped++; continue; }

        // Normalize fields
        sub.initialConduct = sub.initialConduct === 'Yes';
        sub.regularConduct = sub.regularConduct === 'Yes';
        sub.asRequested = sub.asRequested === 'Yes';
        sub.attachments = sub.attachments || [];
        sub.stageHistory = sub.stageHistory || [];

        if (existingMap[sub.formId]) {
          // Merge — preserve attachments + stageHistory from existing
          var old = existingMap[sub.formId];
          sub.attachments = old.attachments || [];
          sub.stageHistory = old.stageHistory || [];
          existingMap[sub.formId] = sub;
          updated++;
        } else {
          existingMap[sub.formId] = sub;
          added++;
        }
      }

      // Save merged
      var merged = Object.keys(existingMap).map(function (k) { return existingMap[k]; });
      saveSnarfSubmissions(merged);

      showToast('Import complete! ✅ ' + added + ' added, ' + updated + ' updated, ' + skipped + ' skipped.', 'success');
      refreshAll();

    } catch (err) {
      console.error('CSV import error:', err);
      showToast('Failed to import CSV. Check file format.', 'error');
    }
  };
  reader.onerror = function () {
    showToast('Failed to read file.', 'error');
  };
  reader.readAsText(file);
}

// ===================== CSV PARSER (handles quoted values) =====================
function parseCsv(text) {
  var rows = [];
  var row = [];
  var cur = '';
  var inQuotes = false;

  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    var next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cur);
        cur = '';
      } else if (ch === '\n') {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = '';
      } else if (ch === '\r') {
        // ignore
      } else {
        cur += ch;
      }
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

// ===================== MAP CSV HEADERS → submission keys =====================
function csvHeaderToKey(h) {
  var map = {
    "Form ID": "formId",
    "Original ID": "originalFormId",
    "Submitted By Name": "submittedByName",
    "Submitted By Email": "submittedByEmail",
    "Last Name": "lastName",
    "First Name": "firstName",
    "M.I.": "mi",
    "Office/Division": "office",
    "Telephone": "telephone",
    "Date": "date",
    "Purpose": "purpose",
    "Description": "description",
    "Period": "period",
    "From Date": "fromDate",
    "To Date": "toDate",
    "Status": "status",
    "Reject Category": "rejectCategory",
    "Reject Reason": "rejectReason",
    "Initial Conduct": "initialConduct",
    "Regular Conduct": "regularConduct",
    "As Requested": "asRequested",
    "1st Test Count": "firstTestCount",
    "1st Test Date": "firstTestDate",
    "2nd Test Count": "secondTestCount",
    "2nd Test Date": "secondTestDate",
    "3rd Test Count": "thirdTestCount",
    "3rd Test Date": "thirdTestDate",
    "4th Test Count": "fourthTestCount",
    "4th Test Date": "fourthTestDate",
    "1st Holes": "firstHoles",
    "1st Holes Date": "firstHolesDate",
    "2nd Holes": "secondHoles",
    "2nd Holes Date": "secondHolesDate",
    "3rd Holes": "thirdHoles",
    "3rd Holes Date": "thirdHolesDate",
    "4th Holes": "fourthHoles",
    "4th Holes Date": "fourthHolesDate",
    "1st Warnings": "firstWarnings",
    "1st Warnings Date": "firstWarningsDate",
    "2nd Warnings": "secondWarnings",
    "2nd Warnings Date": "secondWarningsDate",
    "3rd Warnings": "thirdWarnings",
    "3rd Warnings Date": "thirdWarningsDate",
    "4th Warnings": "fourthWarnings",
    "4th Warnings Date": "fourthWarningsDate",
    "Actioned By": "actionedBy",
    "Actioned By Role": "actionedByRole",
    "Actioned At": "actionedAt",
    "Locked By": "lockedBy",
    "Locked By Role": "lockedByRole",
    "Locked At": "lockedAt"
  };
  return map[h] || h;
}


// ===================== PENDINGS TAB (DYNAMIC) =====================
var pendingsCurrentPage = 1;
var pendingsRowsPerPage = 10;
var pendingsFiltered = [];

function initializePendings() {
  var searchEl = document.getElementById('pendingsSearchInput'); if (searchEl) searchEl.value = '';
  var sa = document.getElementById('pendingsSelectAll'); if (sa) sa.checked = false;
  pendingsCurrentPage = 1;
  filterPendingsTable();
}

function filterPendingsTable() {
  var searchEl = document.getElementById("pendingsSearchInput");
  var searchTerm = searchEl ? searchEl.value.toLowerCase().trim() : '';
  var role = getCurrentRole();

  var results = getSnarfSubmissions().filter(function (s) {
    return (s.status || 'Pending') === 'Pending';
  });

  if (searchTerm) {
    results = results.filter(function (r) {
      return [r.formId, r.lastName, r.firstName, r.mi, r.office, r.telephone, r.date, r.purpose, r.description, r.period, r.fromDate, r.toDate, r.lockedBy || "", r.submittedByName || ""].join(" ").toLowerCase().indexOf(searchTerm) !== -1;
    });
  }

  pendingsFiltered = results.slice().reverse();
  pendingsCurrentPage = 1;
  renderPendingsPage();
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
  for (var i = 0; i < pageItems.length; i++) addPendingsRow(pageItems[i]);
  renderPendingsPagination(totalPages);
}

function addPendingsRow(formData) {
  var tbody = document.getElementById("pendingsResultsBody"); if (!tbody) return;
  var row = document.createElement("tr");
  var status = formData.status || 'Pending';
  row.setAttribute("data-form-id", formData.formId);
  var fId = esc(formData.formId);
  var ln = esc(formData.lastName);
  var fn = esc(formData.firstName);
  var mi = esc(formData.mi);
  var of = esc(formData.office);
  var tel = esc(formData.telephone);
  var dt = esc(formData.date);
  var pur = esc(formData.purpose);
  var per = esc(formData.period);
  var fd = esc(formData.fromDate || '');
  var td2 = esc(formData.toDate || '');
  var lockHtml = formData.lockedBy
    ? '<br><small style="color:#92400e;font-weight:600;">🔒 ' + esc(formData.lockedBy) + '</small>'
    : '';
  row.innerHTML = '<td><input type="checkbox" class="pendings-checkbox" value="' + fId + '" onclick="onPendingsCheckboxChange()" /></td><td><strong>' + fId + '</strong></td><td>' + ln + '</td><td>' + fn + '</td><td>' + mi + '</td><td>' + of + '</td><td>' + tel + '</td><td>' + dt + '</td><td title="' + pur + '">' + pur + '</td><td>' + per + '</td><td>' + fd + '</td><td>' + td2 + '</td><td>' + getStatusBadgeHtml(status) + lockHtml + '</td><td><button class="snarf-view-btn" onclick="viewSnarfDetail(\'' + formData.formId + '\')">👁 View</button></td>';
  tbody.appendChild(row);
}

function pendingsToggleSelectAll(cb) {
  document.querySelectorAll('.pendings-checkbox').forEach(function (c) { c.checked = cb.checked; c.closest('tr').classList.toggle('selected-row', cb.checked); });
  updatePendingsBulkButtons();
}

function onPendingsCheckboxChange() {
  var cbs = document.querySelectorAll('.pendings-checkbox');
  var sa = document.getElementById('pendingsSelectAll');
  var allChecked = cbs.length > 0;
  cbs.forEach(function (c) { if (!c.checked) allChecked = false; c.closest('tr').classList.toggle('selected-row', c.checked); });
  if (sa) sa.checked = allChecked;
  updatePendingsBulkButtons();
}

function getPendingsSelectedIds() {
  var ids = []; document.querySelectorAll('.pendings-checkbox:checked').forEach(function (c) { ids.push(c.value); }); return ids;
}

function updatePendingsBulkButtons() {
  var h = getPendingsSelectedIds().length > 0;
  var ba = document.getElementById('pendingsBulkApproveBtn'); if (ba) ba.disabled = !h;
  var br = document.getElementById('pendingsBulkRejectBtn'); if (br) br.disabled = !h;
}

function pendingsBulkAction(action) {
  var ids = getPendingsSelectedIds();
  if (ids.length === 0) { showToast('No submissions selected.', 'warning'); return; }
  var cu = getCurrentUser(); var role = cu.role;

  if (action === 'Rejected') { openRejectModal('bulk', ids, 'pendings'); return; }

  if (!confirm('Advance ' + ids.length + ' submission(s)?\n\nActioned by: ' + cu.name + ' (' + cu.role + ')')) return;
  var subs = getSnarfSubmissions();
  var validCount = 0;
  var skippedLocked = 0;
  subs.forEach(function (s) {
    if (ids.indexOf(s.formId) === -1) return;
    if (!canRoleActionSubmission(role, s)) return;

    if (isLocked(s) && s.lockedBy !== cu.name && role !== 'Admin') {
      skippedLocked++;
      return;
    }

    var nextSt = getNextStatus(s);
    if (!nextSt) return;
    var currentStatus = s.status || 'Pending';
    if (!s.stageHistory) s.stageHistory = [];
    s.stageHistory.push({ from: currentStatus, to: nextSt, by: cu.name, role: cu.role, at: new Date().toISOString() });
    s.status = nextSt; s.actionedBy = cu.name; s.actionedByRole = cu.role; s.actionedAt = new Date().toISOString();
    s.lockedBy = null; s.lockedByRole = null; s.lockedAt = null;
    if (nextSt === 'Approved') { s.originalFormId = s.formId; s.formId = generateApprovedId(s.originalFormId, subs); }
    validCount++;
  });
  saveSnarfSubmissions(subs);
  var msg = validCount + ' submission(s) advanced by ' + cu.name + '.';
  if (skippedLocked > 0) msg += ' (' + skippedLocked + ' skipped — locked by others)';
  showToast(msg, 'success');
  refreshAll();
}

function renderPendingsPagination(totalPages) {
  var c = document.getElementById('pendingsPagination'); if (!c) return;
  var total = pendingsFiltered.length;
  var start = (pendingsCurrentPage - 1) * pendingsRowsPerPage + 1;
  var end = Math.min(pendingsCurrentPage * pendingsRowsPerPage, total);
  var h = '<div class="pagination-info">Showing ' + start + '–' + end + ' of ' + total + ' pending</div><div class="pagination-buttons">';
  h += '<button class="page-btn" onclick="goToPendingsPage(' + (pendingsCurrentPage - 1) + ')" ' + (pendingsCurrentPage === 1 ? 'disabled' : '') + '>« Prev</button>';
  for (var i = 1; i <= totalPages; i++) {
    if (totalPages <= 7 || i === 1 || i === totalPages || Math.abs(i - pendingsCurrentPage) <= 1)
      h += '<button class="page-btn ' + (i === pendingsCurrentPage ? 'active-page' : '') + '" onclick="goToPendingsPage(' + i + ')">' + i + '</button>';
    else if (i === pendingsCurrentPage - 2 || i === pendingsCurrentPage + 2) h += '<button class="page-btn" disabled>...</button>';
  }
  h += '<button class="page-btn" onclick="goToPendingsPage(' + (pendingsCurrentPage + 1) + ')" ' + (pendingsCurrentPage === totalPages ? 'disabled' : '') + '>Next »</button></div>';
  c.innerHTML = h;
}

function goToPendingsPage(p) {
  var tp = Math.ceil(pendingsFiltered.length / pendingsRowsPerPage);
  if (p < 1 || p > tp) return;
  pendingsCurrentPage = p; renderPendingsPage();
}

// ===================== CLOSE MODALS ON BACKDROP (DELEGATED) =====================
document.addEventListener('click', function (e) {
  if (e.target && e.target.classList && e.target.classList.contains('modal') && e.target.classList.contains('active')) {
    e.target.classList.remove('active');
  }
});

// ===================== SEARCH DEBOUNCE =====================
var _snarfSearchTimer, _pendingsSearchTimer, _usersSearchTimer;

function debouncedFilterSnarf() {
  clearTimeout(_snarfSearchTimer);
  _snarfSearchTimer = setTimeout(filterSnarfTable, 200);
}

function debouncedFilterPendings() {
  clearTimeout(_pendingsSearchTimer);
  _pendingsSearchTimer = setTimeout(filterPendingsTable, 200);
}

function debouncedFilterUsers() {
  clearTimeout(_usersSearchTimer);
  _usersSearchTimer = setTimeout(filterUsersTable, 200);
}

// ===================== PROFILE EDIT =====================
function openProfileModal() {
  var cu = getCurrentUser();
  var fullUser = users.find(function (u) {
    return (cu.email && u.email === cu.email) || u.name === cu.name;
  });

  var nameEl = document.getElementById('profileName');
  var emailEl = document.getElementById('profileEmail');
  var curEl = document.getElementById('profileCurrentPassword');
  var newEl = document.getElementById('profileNewPassword');
  var confEl = document.getElementById('profileConfirmPassword');
  var valMsg = document.getElementById('profileValidationMsg');
  var strength = document.getElementById('profilePasswordStrength');

  if (nameEl) nameEl.value = cu.name || '';
  if (emailEl) emailEl.value = (fullUser && fullUser.email) || cu.email || '';
  if (curEl) curEl.value = '';
  if (newEl) newEl.value = '';
  if (confEl) confEl.value = '';
  if (valMsg) { valMsg.textContent = ''; valMsg.classList.remove('visible'); }
  if (strength) { strength.style.display = 'none'; strength.textContent = ''; }

  var m = document.getElementById('profileModal');
  if (m) m.classList.add('active');
  setTimeout(function () { if (nameEl) nameEl.focus(); }, 150);
}

function closeProfileModal() {
  var m = document.getElementById('profileModal');
  if (m) m.classList.remove('active');
}

function onProfilePasswordInput() {
  var newEl = document.getElementById('profileNewPassword');
  var strength = document.getElementById('profilePasswordStrength');
  if (!newEl || !strength) return;
  var val = newEl.value;
  if (!val) { strength.style.display = 'none'; return; }
  strength.style.display = 'block';
  var score = 0;
  if (val.length >= 4) score++;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
  if (/\d/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  var labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  var colors = ['#ef4444', '#f59e0b', '#eab308', '#84cc16', '#10b981'];
  var idx = Math.min(score, 4);
  strength.textContent = '🔒 Strength: ' + labels[idx];
  strength.style.color = colors[idx];
  strength.style.fontSize = '12px';
  strength.style.fontWeight = '600';
  strength.style.marginTop = '4px';
}

function saveProfile() {
  var cu = getCurrentUser();
  var nameEl = document.getElementById('profileName');
  var curEl = document.getElementById('profileCurrentPassword');
  var newEl = document.getElementById('profileNewPassword');
  var confEl = document.getElementById('profileConfirmPassword');
  var valMsg = document.getElementById('profileValidationMsg');

  var newName = nameEl ? nameEl.value.trim() : '';
  var curPwd = curEl ? curEl.value : '';
  var newPwd = newEl ? newEl.value : '';
  var confPwd = confEl ? confEl.value : '';

  var showError = function (msg) {
    if (valMsg) {
      valMsg.textContent = '⚠ ' + msg;
      valMsg.classList.add('visible');
      valMsg.style.color = '#dc2626';
    }
  };

  if (!newName) { showError('Name cannot be empty.'); if (nameEl) nameEl.focus(); return; }
  if (!curPwd) { showError('Current password is required to save changes.'); if (curEl) curEl.focus(); return; }

  var idx = -1;
  for (var i = 0; i < users.length; i++) {
    if ((cu.email && users[i].email === cu.email) || users[i].name === cu.name) {
      idx = i; break;
    }
  }
  if (idx === -1) { showError('Could not locate your user account.'); return; }

  if (users[idx].password !== curPwd) {
    showError('Current password is incorrect.');
    if (curEl) { curEl.focus(); curEl.select(); }
    return;
  }

  if (newPwd) {
    if (newPwd.length < 4) { showError('New password must be at least 4 characters.'); if (newEl) newEl.focus(); return; }
    if (newPwd !== confPwd) { showError('New password and confirmation do not match.'); if (confEl) { confEl.focus(); confEl.select(); } return; }
    if (newPwd === curPwd) { showError('New password must be different from the current password.'); if (newEl) newEl.focus(); return; }
  }

  var nameLower = newName.toLowerCase();
  for (var j = 0; j < users.length; j++) {
    if (j !== idx && users[j].name.toLowerCase() === nameLower) {
      showError('Another user already has this name.');
      if (nameEl) nameEl.focus();
      return;
    }
  }

  users[idx].name = newName;
  if (newPwd) users[idx].password = newPwd;
  saveUsersToStorage();

  var updatedCurrent = {
    name: newName,
    role: users[idx].role,
    email: users[idx].email
  };
  localStorage.setItem('currentUser', JSON.stringify(updatedCurrent));

  displayCurrentUser();
  applyRolePermissions();
  filterUsersTable();
  renderRoleChips();

  closeProfileModal();

  var msg = newPwd
    ? 'Profile updated! Name and password changed successfully.'
    : 'Profile updated! Name changed successfully.';
  showToast(msg, 'success');
}

// ===================== GLOBAL ESCAPE-TO-CLOSE FOR MODALS =====================
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  var open = document.querySelector('.modal.active');
  if (!open) return;
  var id = open.id;
  if (id === 'userModal') closeUserModal();
  else if (id === 'rejectReasonModal') closeRejectModal();
  else if (id === 'newRoleModal') closeNewRoleModal();
  else if (id === 'profileModal') closeProfileModal();
  else if (id === 'detailModal') closeDetailModal();
});

// ===================== AUTO-REFRESH ON FOCUS =====================
window.addEventListener('focus', function () {
  var active = document.querySelector('.tab-content.active');
  if (active && active.id === 'snarf-form') {
    filterSnarfTable();
    updateSnarfSummary();
    updateAllBadges();
  }
});

// ===================== LANDING PAGE RESOURCES =====================
var pendingResourceFile = null;

function getResourcesData() {
  return safeParse('landingResources', { announcement: '', files: [] });
}

function saveResourcesData(data) {
  try {
    localStorage.setItem('landingResources', JSON.stringify(data));
    return true;
  } catch (e) {
    showToast('Storage full. Remove old resources first.', 'error');
    return false;
  }
}

function loadResourcesUI() {
  var data = getResourcesData();
  var ann = document.getElementById('landingAnnouncement');
  if (ann) ann.value = data.announcement || '';
  renderResourcesList();
}

function saveAnnouncement() {
  var ann = document.getElementById('landingAnnouncement');
  var data = getResourcesData();
  data.announcement = ann ? ann.value.trim() : '';
  if (saveResourcesData(data)) {
    showToast('Announcement saved!', 'success');
  }
}

function onResourceFileSelected(event) {
  var file = event.target.files[0];
  var label = document.getElementById('resourceFileName');
  var btn = document.getElementById('addResourceBtn');

  if (!file) {
    pendingResourceFile = null;
    if (label) label.textContent = 'No file selected (max 3MB)';
    if (btn) btn.disabled = true;
    return;
  }

  var MAX = 3 * 1024 * 1024;
  if (file.size > MAX) {
    showToast('File exceeds 3MB limit.', 'error');
    event.target.value = '';
    return;
  }

  var reader = new FileReader();
  reader.onload = function (e) {
    var ext = file.name.split('.').pop().toLowerCase();
    pendingResourceFile = {
      name: file.name,
      size: file.size,
      type: file.type || ext,
      ext: ext,
      dataUrl: e.target.result
    };
    if (label) {
      var kb = (file.size / 1024).toFixed(1);
      var sizeText = file.size > 1024 * 1024
        ? (file.size / 1024 / 1024).toFixed(2) + ' MB'
        : kb + ' KB';
      label.textContent = file.name + ' (' + sizeText + ')';
      label.style.color = '#4f46e5';
    }
    if (btn) btn.disabled = false;
  };
  reader.onerror = function () {
    showToast('Failed to read file.', 'error');
  };
  reader.readAsDataURL(file);
}

function addResource() {
  if (!pendingResourceFile) { showToast('Please choose a file first.', 'error'); return; }

  var descEl = document.getElementById('resourceDescription');
  var description = descEl ? descEl.value.trim() : '';

  var cu = getCurrentUser();
  var data = getResourcesData();
  data.files = data.files || [];
  data.files.push({
    id: 'res-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    name: pendingResourceFile.name,
    size: pendingResourceFile.size,
    ext: pendingResourceFile.ext,
    type: pendingResourceFile.type,
    dataUrl: pendingResourceFile.dataUrl,
    description: description,
    uploadedBy: cu.name,
    uploadedAt: new Date().toISOString()
  });

  if (saveResourcesData(data)) {
    showToast('Resource added!', 'success');
    pendingResourceFile = null;
    var fileInput = document.getElementById('resourceFileInput');
    if (fileInput) fileInput.value = '';
    var label = document.getElementById('resourceFileName');
    if (label) { label.textContent = 'No file selected (max 3MB)'; label.style.color = '#6b7280'; }
    if (descEl) descEl.value = '';
    var addBtn = document.getElementById('addResourceBtn');
    if (addBtn) addBtn.disabled = true;
    renderResourcesList();
  }
}

function deleteResource(id) {
  if (!confirm('Delete this resource? End users will no longer see it.')) return;
  var data = getResourcesData();
  data.files = (data.files || []).filter(function (f) { return f.id !== id; });
  if (saveResourcesData(data)) {
    showToast('Resource deleted.', 'warning');
    renderResourcesList();
  }
}

function renderResourcesList() {
  var container = document.getElementById('resourcesList');
  var badge = document.getElementById('resourceCountBadge');
  if (!container) return;

  var data = getResourcesData();
  var files = data.files || [];

  if (badge) badge.textContent = '(' + files.length + ')';

  if (files.length === 0) {
    container.innerHTML = '<div style="color:#94a3b8;font-style:italic;font-size:13px;padding:12px;text-align:center;">No resources uploaded yet.</div>';
    return;
  }

  var html = '';
  files.forEach(function (f) {
    var ext = (f.ext || '').toLowerCase();
    var iconClass = 'other', icon = '📄';
    if (ext === 'pdf') { iconClass = 'pdf'; icon = '📄'; }
    else if (ext === 'xlsx' || ext === 'xls') { iconClass = 'xls'; icon = '📊'; }
    else if (ext === 'docx' || ext === 'doc') { iconClass = 'doc'; icon = '📝'; }
    else if (ext === 'pptx' || ext === 'ppt') { iconClass = 'ppt'; icon = '📈'; }
    else if (ext === 'jpeg' || ext === 'jpg' || ext === 'png') { iconClass = 'img'; icon = '🖼️'; }

    var sizeText = f.size > 1024 * 1024
      ? (f.size / 1024 / 1024).toFixed(2) + ' MB'
      : (f.size / 1024).toFixed(1) + ' KB';

    var when = f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString() : '';

    html += '<div class="resource-item-admin">' +
      '<div class="res-icon ' + iconClass + '">' + icon + '</div>' +
      '<div class="res-info">' +
        '<div class="res-name">' + esc(f.name) + '</div>' +
        (f.description ? '<div class="res-desc">' + esc(f.description) + '</div>' : '') +
        '<div class="res-meta">' + sizeText + ' • ' + esc(f.uploadedBy || 'Unknown') + ' • ' + esc(when) + '</div>' +
      '</div>' +
      '<button class="res-delete" onclick="deleteResource(\'' + f.id + '\')">🗑 Delete</button>' +
    '</div>';
  });
  container.innerHTML = html;
}
