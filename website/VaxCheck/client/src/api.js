const API_BASE = '/api/v1';

function getAuthHeaders() {
  const token = localStorage.getItem('vax_user_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || `HTTP error ${response.status}`);
  }

  // If backend returns ApiResponse envelope { statusCode, data, message, success }
  if (data && typeof data === 'object' && 'data' in data && 'success' in data) {
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
      return { ...data.data, _message: data.message };
    }
    return data.data;
  }

  return data;
}

export const api = {
  // Auth
  async login(username, password) {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    const token = res.token || res.data?.token;
    const user = res.user || res.data?.user;
    if (token) {
      localStorage.setItem('vax_user_token', token);
      localStorage.setItem('vax_user_profile', JSON.stringify(user));
    }
    return res;
  },

  async registerAdmin(adminData) {
    const res = await request('/auth/register-admin', {
      method: 'POST',
      body: JSON.stringify(adminData)
    });
    const token = res.token || res.data?.token;
    const user = res.user || res.data?.user;
    if (token) {
      localStorage.setItem('vax_user_token', token);
      localStorage.setItem('vax_user_profile', JSON.stringify(user));
    }
    return res;
  },

  async registerWorker(workerData) {
    // Returns 202 Accepted with pending_approval:true instead of a token.
    // Do NOT store any session token — worker must wait for admin approval.
    const res = await request('/auth/register-worker', {
      method: 'POST',
      body: JSON.stringify(workerData)
    });
    return res; // { pending_approval, worker_name, supervisor_name, ... }
  },

  async getAdmins() {
    return request('/auth/admins');
  },

  async googleLogin(payload) {
    const res = await request('/auth/google', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const token = res.token || res.data?.token;
    const user = res.user || res.data?.user;
    if (token) {
      localStorage.setItem('vax_user_token', token);
      localStorage.setItem('vax_user_profile', JSON.stringify(user));
    }
    return res;
  },

  logout() {
    localStorage.removeItem('vax_user_token');
    localStorage.removeItem('vax_user_profile');
  },

  getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('vax_user_profile') || 'null');
    } catch {
      return null;
    }
  },

  async getMe() {
    return request('/auth/me');
  },

  async getWorkers(params = {}) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        searchParams.append(k, v);
      }
    });
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return request(`/auth/workers${qs}`);
  },

  // Clinics
  async getClinics() {
    return request('/clinics');
  },

  // Devices
  async getDevices(clinicId = '') {
    const q = clinicId ? `?clinic_id=${clinicId}` : '';
    return request(`/devices${q}`);
  },

  async getDeviceStatus(deviceId) {
    return request(`/devices/${deviceId}/status`);
  },

  async registerDevice(deviceData) {
    return request('/devices', {
      method: 'POST',
      body: JSON.stringify(deviceData)
    });
  },

  async startRemoteTest(deviceId, vialBatchId, workerId) {
    return request(`/devices/${deviceId}/start_test`, {
      method: 'POST',
      body: JSON.stringify({ vial_batch_id: vialBatchId, worker_id: workerId })
    });
  },

  // Genuine ESP32 Endpoint (supports live and offline queue)
  async submitDeviceTest(payload, deviceToken) {
    return request('/tests', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deviceToken}`
      },
      body: JSON.stringify(payload)
    });
  },

  async pollCommands(deviceId, deviceToken) {
    return request(`/devices/${deviceId}/pending_commands`, {
      headers: { 'Authorization': `Bearer ${deviceToken}` }
    });
  },

  async ackCommand(deviceId, commandId, deviceToken, status = 'COMPLETED') {
    return request(`/devices/${deviceId}/commands/${commandId}/ack`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${deviceToken}` },
      body: JSON.stringify({ status })
    });
  },

  // Tests
  async getTests(params = {}) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        searchParams.append(k, v);
      }
    });
    return request(`/tests?${searchParams.toString()}`);
  },

  async getTestDetail(testId) {
    return request(`/tests/${testId}`);
  },

  // Batches
  async getBatches() {
    return request('/batches');
  },

  async getBatchDetail(batchId) {
    return request(`/batches/${encodeURIComponent(batchId)}`);
  },

  // Stats
  async getStatsOverview(clinicId = '') {
    const q = clinicId ? `?clinic_id=${clinicId}` : '';
    return request(`/stats/overview${q}`);
  },

  // Worker Approval Flow
  async getPendingWorkers() {
    return request('/auth/pending-workers');
  },

  async approveWorker(workerId) {
    return request(`/auth/workers/${workerId}/approve`, { method: 'POST' });
  },

  async rejectWorker(workerId, reason = '') {
    return request(`/auth/workers/${workerId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // ── Hardware (ESP32 Real Integration) ──────────────────────────────────
  async getHardwareStatus() {
    return request('/hardware/status');
  },

  async connectHardware(port = null) {
    return request('/hardware/connect', {
      method: 'POST',
      body: JSON.stringify({ port }),
    });
  },

  async disconnectHardware() {
    return request('/hardware/disconnect', {
      method: 'POST',
    });
  },

  async triggerStrike(vialBatchId, vaccineName, strikesCount = 3, workerId = null, delayS = 1.2) {
    return request('/hardware/strike', {
      method: 'POST',
      body: JSON.stringify({
        vial_batch_id: vialBatchId,
        vaccine_name: vaccineName,
        strikes_count: strikesCount,
        worker_id: workerId,
        delay_s: delayS,
      }),
    });
  },

  async analyzeWav(wavPath) {
    return request('/hardware/analyze-wav', {
      method: 'POST',
      body: JSON.stringify({ wav_path: wavPath }),
    });
  },
};
