const fs = require('fs');
const path = require('path');

// Candidate locations for data files (works locally, in Vercel serverless, and monorepo structures)
function resolveFilePath(relativePath) {
  const candidates = [
    path.join(__dirname, '..', relativePath),
    path.join(process.cwd(), relativePath),
    path.join(process.cwd(), '..', relativePath),
    path.join(__dirname, relativePath)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(process.cwd(), relativePath);
}

const DATA_FILE = resolveFilePath('data/data.json');
const USERS_FILE = resolveFilePath('data/users.json');
const AUDIT_FILE = resolveFilePath('data/audit_logs.json');
const FRONTEND_DATA_FILE = resolveFilePath('frontend/assets/data/data.json');

// In-memory cache
let memoryData = null;
let memoryUsers = null;
let memoryAuditLogs = null;

function loadData() {
  if (!memoryData) {
    try {
      const tmpFile = path.join('/tmp', 'data.json');
      if (fs.existsSync(tmpFile)) {
        memoryData = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
      } else if (fs.existsSync(DATA_FILE)) {
        memoryData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      } else if (fs.existsSync(FRONTEND_DATA_FILE)) {
        memoryData = JSON.parse(fs.readFileSync(FRONTEND_DATA_FILE, 'utf-8'));
      } else {
        memoryData = { metadata: {}, beneficiaries: [] };
      }
    } catch (err) {
      console.error('Error reading data.json:', err);
      memoryData = { metadata: {}, beneficiaries: [] };
    }
  }
  return memoryData;
}

function loadUsers() {
  if (!memoryUsers) {
    try {
      if (fs.existsSync(USERS_FILE)) {
        memoryUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      } else {
        memoryUsers = [
          {
            id: "talati_001",
            username: "nikunjdarji",
            password_hash: "$2b$12$lycdKjmZ1u2dW7XmxT.Sn.dk1LqBuT2eax8gR8WrhBbd5iVOP2aY.",
            role: "talati",
            district: "મહેસાણા",
            taluka: "ઊંઝા",
            created_at: new Date().toISOString()
          }
        ];
      }
    } catch (err) {
      console.error('Error reading users.json:', err);
      memoryUsers = [];
    }
  }
  return memoryUsers;
}

function loadAuditLogs() {
  if (!memoryAuditLogs) {
    try {
      if (fs.existsSync(AUDIT_FILE)) {
        memoryAuditLogs = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8'));
      } else {
        memoryAuditLogs = [];
      }
    } catch (err) {
      console.error('Error reading audit_logs.json:', err);
      memoryAuditLogs = [];
    }
  }
  return memoryAuditLogs;
}

function persistData() {
  const content = JSON.stringify(memoryData, null, 2);
  try {
    fs.writeFileSync(DATA_FILE, content, 'utf-8');
  } catch (err) {
    // Read-only filesystem (e.g. Vercel Lambda)
    try {
      fs.writeFileSync(path.join('/tmp', 'data.json'), content, 'utf-8');
    } catch (tmpErr) {}
  }

  // Also sync frontend data.json if writable
  try {
    if (fs.existsSync(path.dirname(FRONTEND_DATA_FILE))) {
      fs.writeFileSync(FRONTEND_DATA_FILE, content, 'utf-8');
    }
  } catch (e) {}
}

function persistAuditLogs() {
  const content = JSON.stringify(memoryAuditLogs, null, 2);
  try {
    fs.writeFileSync(AUDIT_FILE, content, 'utf-8');
  } catch (err) {
    try {
      fs.writeFileSync(path.join('/tmp', 'audit_logs.json'), content, 'utf-8');
    } catch (tmpErr) {}
  }
}

// Data Access API
const DataStore = {
  getMetadata() {
    const data = loadData();
    return data.metadata || {
      district: "મહેસાણા",
      taluka: "ઊંઝા",
      fps_area: "ભરતભાઈ હરગોવનજી બારોટ : 2310 (પળી : 14785 - હંગામી )",
      generated_on: ""
    };
  },

  getBeneficiaries(status) {
    const data = loadData();
    const list = data.beneficiaries || [];
    if (status === 'ONBOARDED') {
      return list.filter(b => b.onboarded === 'Yes');
    } else if (status === 'PENDING') {
      return list.filter(b => b.onboarded === 'No');
    }
    return list;
  },

  getBeneficiary(srNo) {
    const data = loadData();
    const num = parseInt(srNo, 10);
    return (data.beneficiaries || []).find(b => b.sr_no === num) || null;
  },

  updateBeneficiaryOnboarding({ srNo, field, status, version, remarks, clientIp, userId }) {
    if (!['onboarded', 'rc_onboarded'].includes(field)) {
      throw { status: 400, message: 'Invalid field name' };
    }
    if (!['Yes', 'No'].includes(status)) {
      throw { status: 400, message: 'Invalid status value' };
    }

    const data = loadData();
    const num = parseInt(srNo, 10);
    const beneficiary = (data.beneficiaries || []).find(b => b.sr_no === num);

    if (!beneficiary) {
      throw { status: 404, message: 'Beneficiary not found' };
    }

    const currentVersion = beneficiary.version || 0;
    if (version !== undefined && version !== currentVersion) {
      return {
        conflict: true,
        currentVersion,
        currentData: {
          onboarded: beneficiary.onboarded,
          rc_onboarded: beneficiary.rc_onboarded
        }
      };
    }

    const oldStatus = beneficiary[field];
    const newVersion = currentVersion + 1;
    const nowIso = new Date().toISOString();
    const dateField = `${field}_date`;
    const dateVal = status === 'Yes' ? nowIso : null;

    beneficiary[field] = status;
    beneficiary[dateField] = dateVal;
    beneficiary.version = newVersion;

    // Log audit trail
    const auditLogs = loadAuditLogs();
    const nextId = auditLogs.length > 0 ? Math.max(...auditLogs.map(l => l.id || 0)) + 1 : 1;
    auditLogs.push({
      id: nextId,
      user_id: userId,
      action: 'onboarding_update',
      sr_no: num,
      beneficiary_name: beneficiary.name,
      field,
      old_status: oldStatus,
      new_status: status,
      remarks: remarks || '',
      ip: clientIp || 'unknown',
      timestamp: nowIso
    });

    persistData();
    persistAuditLogs();

    return {
      conflict: false,
      data: {
        sr_no: num,
        onboarded: beneficiary.onboarded,
        rc_onboarded: beneficiary.rc_onboarded,
        onboarded_date: beneficiary.onboarded_date,
        rc_onboarded_date: beneficiary.rc_onboarded_date,
        version: newVersion,
        updatedBy: userId,
        updatedAt: nowIso
      }
    };
  },

  getDashboardStats(userId) {
    const data = loadData();
    const beneficiaries = data.beneficiaries || [];
    const total = beneficiaries.length;

    const cards = new Set(beneficiaries.map(b => b.clean_ration_card || b.ration_card));
    const totalCards = cards.size;

    const onboarded = beneficiaries.filter(b => b.onboarded === 'Yes').length;
    const rcOnboarded = beneficiaries.filter(b => b.rc_onboarded === 'Yes').length;

    const onboardedPercent = total > 0 ? (onboarded / total * 100).toFixed(1) : "0.0";
    const rcOnboardedPercent = total > 0 ? (rcOnboarded / total * 100).toFixed(1) : "0.0";

    const auditLogs = loadAuditLogs();
    const userLogs = auditLogs.filter(l => l.user_id === userId);
    const recentActivity = userLogs
      .slice(-5)
      .reverse()
      .map(r => ({
        id: r.id,
        userId: r.user_id,
        action: r.action,
        sr_no: r.sr_no,
        beneficiaryName: r.beneficiary_name,
        field: r.field,
        oldStatus: r.old_status,
        newStatus: r.new_status,
        remarks: r.remarks,
        ip: r.ip,
        timestamp: r.timestamp
      }));

    return {
      total,
      totalCards,
      onboarded,
      onboardedPercent,
      rcOnboarded,
      rcOnboardedPercent,
      pending: total - onboarded,
      recentActivity,
      cachedAt: new Date().toISOString()
    };
  },

  getAuditLogs(userId, limit = 20) {
    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
    const auditLogs = loadAuditLogs();
    const userLogs = auditLogs.filter(l => l.user_id === userId);
    const events = userLogs
      .slice(-safeLimit)
      .reverse()
      .map(evt => ({
        id: evt.id,
        userId: evt.user_id,
        action: evt.action,
        sr_no: evt.sr_no,
        beneficiaryName: evt.beneficiary_name,
        field: evt.field,
        oldStatus: evt.old_status,
        newStatus: evt.new_status,
        remarks: evt.remarks,
        ip: evt.ip,
        timestamp: evt.timestamp
      }));

    return { events };
  },

  getSyncLatest() {
    const data = loadData();
    const beneficiaries = data.beneficiaries || [];
    const overrides = {};

    for (const b of beneficiaries) {
      if (b.onboarded === 'Yes' || b.rc_onboarded === 'Yes' || (b.version && b.version > 0)) {
        overrides[String(b.sr_no)] = {
          onboarded: b.onboarded,
          rc_onboarded: b.rc_onboarded,
          version: b.version || 0
        };
      }
    }

    return {
      overrides,
      syncedAt: new Date().toISOString()
    };
  },

  getUserByUsername(username) {
    if (!username) return null;
    const users = loadUsers();
    return users.find(u => u.username.toLowerCase() === username.trim().toLowerCase()) || null;
  },

  getUserById(id) {
    if (!id) return null;
    const users = loadUsers();
    return users.find(u => u.id === id) || null;
  }
};

module.exports = DataStore;
