/**
 * controllers/auth.controller.js
 *
 * Handles: login, logout, get current user, list workers, create user,
 *          worker registration approval flow, and email notifications.
 */

import { User } from '../models/User.model.js';
import { Clinic } from '../models/Clinic.model.js';
import { Test } from '../models/Test.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { USER_ROLES } from '../constants.js';
import { validateEmailDomain } from '../utils/emailValidator.js';
import {
  sendWorkerRequestToAdmin,
  sendWorkerApprovalEmail,
  sendWorkerRejectionEmail,
} from '../utils/emailService.js';

/**
 * POST /api/v1/auth/login
 * Validates credentials (by username or email) and returns a signed JWT.
 */
const login = asyncHandler(async (req, res) => {
  const identifier = (req.body.username || req.body.email || '').trim().toLowerCase();
  const { password } = req.body;

  if (!identifier || !password) {
    throw new ApiError(400, 'Username/Email and password are required');
  }

  // Select passwordHash explicitly (it is `select: false` by default)
  const user = await User.findOne({
    $or: [{ username: identifier }, { email: identifier }],
  })
    .select('+passwordHash')
    .populate('clinic', 'name location');

  if (!user) {
    throw new ApiError(401, 'Invalid username/email or password');
  }

  // Check account lifecycle status before verifying password
  if (user.accountStatus === 'pending') {
    throw new ApiError(
      403,
      'Your registration request is pending approval by your administrator. You will receive an email once approved.'
    );
  }

  if (user.accountStatus === 'rejected') {
    const reason = user.rejectionReason
      ? ` Reason: ${user.rejectionReason}`
      : ' Please contact your facility administrator for more information.';
    throw new ApiError(403, `Your registration request was not approved.${reason}`);
  }

  if (!user.isActive) {
    throw new ApiError(401, 'This account has been deactivated. Contact your administrator.');
  }

  const isPasswordCorrect = await user.isPasswordCorrect(password);
  if (!isPasswordCorrect) {
    throw new ApiError(401, 'Invalid username/email or password');
  }

  const token = user.generateAccessToken();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email || null,
          full_name: user.fullName,
          role: user.role,
          mobile_no: user.mobileNo || null,
          address: user.address || null,
          clinic_id: user.clinic?._id || null,
          clinic_name: user.clinic?.name || user.clinicName || null,
          supervisor_admin_id: user.supervisorAdmin || null,
          supervisor_admin_name: user.supervisorAdminName || null,
          avatar: user.avatar || null,
        },
      },
      'Login successful'
    )
  );
});

/**
 * POST /api/v1/auth/logout
 * Client-side JWT invalidation — server-side just acknowledges.
 */
const logout = asyncHandler(async (_req, res) => {
  return res.status(200).json(
    new ApiResponse(200, {}, 'Logged out successfully')
  );
});

/**
 * GET /api/v1/auth/me
 * Returns the currently authenticated user's profile.
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('clinic', 'name location');

  if (!user) throw new ApiError(404, 'User not found');

  return res.status(200).json(
    new ApiResponse(200, {
      id: user._id,
      username: user.username,
      email: user.email || null,
      full_name: user.fullName,
      role: user.role,
      mobile_no: user.mobileNo || null,
      address: user.address || null,
      clinic_id: user.clinic?._id || null,
      clinic_name: user.clinic?.name || user.clinicName || null,
      clinic_location: user.clinic?.location || user.address || null,
      supervisor_admin_id: user.supervisorAdmin || null,
      supervisor_admin_name: user.supervisorAdminName || null,
      created_at: user.createdAt,
      avatar: user.avatar || null,
    })
  );
});

/**
 * GET /api/v1/auth/workers
 * Lists healthcare workers. Supports filtering by supervising admin, clinic, or search query.
 */
const listWorkers = asyncHandler(async (req, res) => {
  const { underMe, adminId, clinicId, search, status } = req.query;

  // Base query: workers only, active/approved accounts only (excludes pending requests)
  const filter = {
    role: USER_ROLES.WORKER,
    accountStatus: status ? status : { $nin: ['pending', 'rejected'] },
  };

  const adminFilters = [];
  if (underMe === 'true') {
    if (req.user?._id) {
      adminFilters.push({ supervisorAdmin: req.user._id });
    }
    if (req.user?.fullName) {
      adminFilters.push({
        supervisorAdminName: { $regex: new RegExp(`^${req.user.fullName.trim()}$`, 'i') },
      });
    }
    // Also include workers in same clinic if supervisorAdmin is unset
    if (req.user?.clinic) {
      adminFilters.push({
        clinic: req.user.clinic,
        supervisorAdmin: null,
      });
    }
  } else if (adminId) {
    adminFilters.push({ supervisorAdmin: adminId });
  }

  if (adminFilters.length > 0) {
    filter.$or = adminFilters;
  }

  if (clinicId) {
    filter.clinic = clinicId;
  }

  if (search) {
    const sRegex = new RegExp(search.trim(), 'i');
    const searchConditions = [
      { fullName: sRegex },
      { username: sRegex },
      { email: sRegex },
      { clinicName: sRegex },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
      delete filter.$or;
    } else {
      filter.$or = searchConditions;
    }
  }

  const workers = await User.find(filter)
    .sort({ createdAt: -1 })
    .populate('clinic', 'name location');

  // Aggregate total tests conducted by each worker
  const testCounts = await Test.aggregate([
    { $match: { worker: { $ne: null } } },
    { $group: { _id: '$worker', count: { $sum: 1 }, lastTestedAt: { $max: '$testedAt' } } },
  ]).catch(() => []);

  const testStatsMap = new Map();
  testCounts.forEach((t) => {
    testStatsMap.set(t._id.toString(), { count: t.count, lastTestedAt: t.lastTestedAt });
  });

  const formatted = workers.map((u) => {
    const stats = testStatsMap.get(u._id.toString()) || { count: 0, lastTestedAt: null };
    const isDirectlySupervised = req.user
      ? Boolean(
          (u.supervisorAdmin && u.supervisorAdmin.toString() === req.user._id.toString()) ||
          (u.supervisorAdminName && req.user.fullName && u.supervisorAdminName.toLowerCase() === req.user.fullName.toLowerCase())
        )
      : false;

    return {
      id: u._id,
      username: u.username,
      full_name: u.fullName,
      email: u.email || null,
      mobile_no: u.mobileNo || null,
      address: u.address || null,
      role: u.role,
      clinic_id: u.clinic?._id || null,
      clinic_name: u.clinic?.name || u.clinicName || null,
      clinic_location: u.clinic?.location || null,
      supervisor_admin_id: u.supervisorAdmin || null,
      supervisor_admin_name: u.supervisorAdminName || null,
      is_supervised_by_me: isDirectlySupervised,
      is_active: u.isActive,
      account_status: u.accountStatus || 'active',
      created_at: u.createdAt,
      avatar: u.avatar || null,
      tests_count: stats.count,
      last_tested_at: stats.lastTestedAt,
    };
  });

  return res.status(200).json(new ApiResponse(200, formatted, 'Workers fetched successfully'));
});

/**
 * POST /api/v1/auth/users
 * Admin creates a new worker / admin account.
 */
const createUser = asyncHandler(async (req, res) => {
  const { username, password, full_name, role = 'worker', clinic_id } = req.body;

  if (!username || !password || !full_name) {
    throw new ApiError(400, 'username, password, and full_name are required');
  }

  const existing = await User.findOne({ username: username.toLowerCase() });
  if (existing) {
    throw new ApiError(409, 'Username already exists');
  }

  let clinic = null;
  if (clinic_id) {
    clinic = await Clinic.findById(clinic_id);
    if (!clinic) throw new ApiError(404, 'Clinic not found');
  }

  const user = await User.create({
    username: username.toLowerCase().trim(),
    passwordHash: password,   // pre-save hook will hash this
    fullName: full_name,
    role,
    clinic: clinic?._id || null,
  });

  return res.status(201).json(
    new ApiResponse(201, {
      id: user._id,
      username: user.username,
      full_name: user.fullName,
      role: user.role,
      clinic_id: clinic?._id || null,
    }, 'User created successfully')
  );
});

/**
 * POST /api/v1/auth/register-admin
 * Admin self-registration with name, mobile no, gmail address, clinic, address, password.
 */
const registerAdmin = asyncHandler(async (req, res) => {
  const { name, fullName, mobileNo, email, clinicName, address, password } = req.body;
  const finalName = (name || fullName || '').trim();
  const finalMobile = (mobileNo || '').trim();
  const finalEmail = (email || '').trim().toLowerCase();
  const finalClinic = (clinicName || '').trim();
  const finalAddress = (address || '').trim();

  if (!finalName) throw new ApiError(400, 'Full name is required');
  if (!finalMobile) throw new ApiError(400, 'Mobile number is required');
  if (!finalEmail) throw new ApiError(400, 'Email is required');
  if (!finalClinic) throw new ApiError(400, 'Clinic name is required');
  if (!finalAddress) throw new ApiError(400, 'Facility/Clinic address is required');
  if (!password || password.length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters long');
  }

  // Validate that email strictly ends with @gmail.com
  const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
  if (!gmailRegex.test(finalEmail)) {
    throw new ApiError(400, 'Registration restricted: Email must be a valid @gmail.com address');
  }

  // Validate that the email domain actually exists (MX record check)
  const domainCheck = await validateEmailDomain(finalEmail);
  if (!domainCheck.valid) {
    throw new ApiError(400, domainCheck.reason);
  }

  // Check if email or username already registered
  const existingUser = await User.findOne({
    $or: [{ email: finalEmail }, { username: finalEmail }],
  });
  if (existingUser) {
    throw new ApiError(409, 'An account with this email address already exists');
  }

  // Find or create clinic
  let clinic = await Clinic.findOne({ name: { $regex: new RegExp(`^${finalClinic}$`, 'i') } });
  if (!clinic) {
    clinic = await Clinic.create({
      name: finalClinic,
      location: finalAddress,
    });
  }

  // Generate a unique username based on the email prefix
  const baseUsername = finalEmail.split('@')[0];
  let uniqueUsername = baseUsername;
  let counter = 1;
  while (await User.findOne({ username: uniqueUsername })) {
    uniqueUsername = `${baseUsername}${counter}`;
    counter++;
  }

  // Create the admin user in MongoDB
  const user = await User.create({
    username: uniqueUsername,
    email: finalEmail,
    fullName: finalName,
    mobileNo: finalMobile,
    address: finalAddress,
    clinicName: finalClinic,
    clinic: clinic._id,
    role: USER_ROLES.ADMIN,
    passwordHash: password, // pre-save hook will hash this
  });

  const token = user.generateAccessToken();

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          full_name: user.fullName,
          role: user.role,
          mobile_no: user.mobileNo,
          address: user.address,
          clinic_id: clinic._id,
          clinic_name: clinic.name,
        },
      },
      'Administrator registered successfully'
    )
  );
});

/**
 * POST /api/v1/auth/google
 * Authenticates with Google credentials or OAuth profile.
 * The `role` field in the request body indicates which portal is calling:
 *   - 'admin'  → Admin portal (default if omitted)
 *   - 'worker' → Worker portal
 */
const googleAuth = asyncHandler(async (req, res) => {
  const { credential, email, name, picture, sub, googleId, role: requestedRole } = req.body;

  // Determine which portal made this request
  const portalRole = (requestedRole === USER_ROLES.WORKER) ? USER_ROLES.WORKER : USER_ROLES.ADMIN;

  let userEmail = email;
  let userName = name;
  let userGoogleId = sub || googleId;
  let userAvatar = picture;

  // If a Google JWT credential was provided, decode its payload
  if (credential && typeof credential === 'string' && credential.includes('.')) {
    try {
      const parts = credential.split('.');
      if (parts.length >= 2) {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
        const parsed = JSON.parse(jsonPayload);
        userEmail = parsed.email || userEmail;
        userName = parsed.name || userName;
        userGoogleId = parsed.sub || userGoogleId;
        userAvatar = parsed.picture || userAvatar;
      }
    } catch (err) {
      console.warn('Could not decode Google JWT credential, falling back to payload fields:', err.message);
    }
  }

  if (!userEmail) {
    throw new ApiError(400, 'Google authentication failed: Email address was not provided');
  }

  const finalEmail = userEmail.trim().toLowerCase();

  // Admin portal requires @gmail.com; worker portal accepts any valid email
  if (portalRole === USER_ROLES.ADMIN) {
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!gmailRegex.test(finalEmail)) {
      throw new ApiError(400, 'Access restricted: Only @gmail.com accounts are permitted for administrator sign in');
    }
  }

  // Find existing user by googleId, email, or username
  let user = await User.findOne({
    $or: [
      ...(userGoogleId ? [{ googleId: userGoogleId }] : []),
      { email: finalEmail },
      { username: finalEmail },
    ],
  }).populate('clinic', 'name location');

  if (user) {
    // Enforce portal–role match for existing users
    if (user.role !== portalRole) {
      const portalName = portalRole === USER_ROLES.ADMIN ? 'Administrator' : 'Worker';
      const correctPortal = user.role === USER_ROLES.ADMIN ? 'Admin portal' : 'Worker portal';
      throw new ApiError(
        403,
        `This Google account is registered as ${user.role === USER_ROLES.ADMIN ? 'an Administrator' : 'a Worker'}. Please sign in via the ${correctPortal}.`
      );
    }

    let updated = false;
    if (!user.googleId && userGoogleId) { user.googleId = userGoogleId; updated = true; }
    if (!user.avatar && userAvatar) { user.avatar = userAvatar; updated = true; }
    if (updated) await user.save();
  } else {
    // Provision a new account for this Google user based on the portal role
    if (portalRole === USER_ROLES.ADMIN) {
      let clinic = await Clinic.findOne({ name: 'Central Health Hub' });
      if (!clinic) {
        clinic = await Clinic.create({
          name: 'Central Health Hub',
          location: 'Metropolitan Medical Sector',
        });
      }

      const baseUsername = finalEmail.split('@')[0];
      let uniqueUsername = baseUsername;
      let counter = 1;
      while (await User.findOne({ username: uniqueUsername })) {
        uniqueUsername = `${baseUsername}${counter}`;
        counter++;
      }

      user = await User.create({
        username: uniqueUsername,
        email: finalEmail,
        fullName: userName || baseUsername,
        googleId: userGoogleId || `google_${Date.now()}`,
        avatar: userAvatar || '',
        clinic: clinic._id,
        clinicName: clinic.name,
        role: USER_ROLES.ADMIN,
      });

      user.clinic = clinic;
    } else {
      // Worker Google sign-in: account must pre-exist (workers register manually)
      throw new ApiError(
        404,
        'No worker account found for this Google email. Please register as a worker first, then sign in.'
      );
    }
  }

  const token = user.generateAccessToken();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          full_name: user.fullName,
          role: user.role,
          mobile_no: user.mobileNo || null,
          address: user.address || null,
          clinic_id: user.clinic?._id || null,
          clinic_name: user.clinic?.name || user.clinicName || null,
          avatar: user.avatar || null,
        },
      },
      'Google Sign-in successful'
    )
  );
});

/**
 * GET /api/v1/auth/admins
 * Returns active administrators for worker registration selection.
 */
const listAdmins = asyncHandler(async (_req, res) => {
  const admins = await User.find({ role: USER_ROLES.ADMIN, isActive: true })
    .select('_id fullName username email clinic clinicName')
    .populate('clinic', 'name location')
    .sort({ fullName: 1 });

  const formatted = admins.map((a) => ({
    id: a._id,
    full_name: a.fullName,
    username: a.username,
    email: a.email || null,
    clinic_id: a.clinic?._id || null,
    clinic_name: a.clinic?.name || a.clinicName || null,
  }));

  return res.status(200).json(new ApiResponse(200, formatted));
});

/**
 * POST /api/v1/auth/register-worker
 * Worker self-registration. Creates account with status='pending'.
 * Notifies the chosen admin via email. Does NOT return a JWT.
 */
const registerWorker = asyncHandler(async (req, res) => {
  const { name, fullName, mobileNo, email, password, clinicId, clinicName, adminId, adminName, address } = req.body;
  const finalName = (name || fullName || '').trim();
  const finalMobile = (mobileNo || '').trim();
  const finalEmail = (email || '').trim().toLowerCase();
  const finalAddress = (address || '').trim();

  if (!finalName) throw new ApiError(400, 'Full name is required');
  if (!finalMobile) throw new ApiError(400, 'Mobile number is required');
  if (!finalEmail) throw new ApiError(400, 'Email address is required');
  if (!password || password.length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters long');
  }
  if (!finalAddress) throw new ApiError(400, 'Residential or facility address is required');

  // Format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(finalEmail)) {
    throw new ApiError(400, 'Please provide a valid email address');
  }

  // Validate that the email domain actually exists (MX record check)
  const domainCheck = await validateEmailDomain(finalEmail);
  if (!domainCheck.valid) {
    throw new ApiError(400, domainCheck.reason);
  }

  // Check for duplicate
  const existingUser = await User.findOne({
    $or: [{ email: finalEmail }, { username: finalEmail }],
  });
  if (existingUser) {
    throw new ApiError(409, 'An account with this email address already exists');
  }

  // Validate Clinic
  let clinic = null;
  if (clinicId) {
    clinic = await Clinic.findById(clinicId);
  }
  if (!clinic && clinicName) {
    clinic = await Clinic.findOne({ name: { $regex: new RegExp(`^${clinicName.trim()}$`, 'i') } });
  }
  if (!clinic) {
    throw new ApiError(400, 'Please select a valid registered clinic');
  }

  // Validate Supervising Admin - MUST be the administrator chosen by the worker
  if (!adminId && !adminName) {
    throw new ApiError(400, 'Please select a supervising administrator from the dropdown');
  }

  let supervisor = null;
  if (adminId) {
    supervisor = await User.findOne({ _id: adminId, role: USER_ROLES.ADMIN });
  }
  if (!supervisor && adminName) {
    supervisor = await User.findOne({ fullName: adminName, role: USER_ROLES.ADMIN });
  }

  if (!supervisor) {
    throw new ApiError(404, 'The selected supervising administrator could not be found. Please select an active administrator.');
  }

  if (!supervisor.email) {
    throw new ApiError(400, `The selected administrator "${supervisor.fullName}" does not have an active email address.`);
  }

  // Generate unique username
  const baseUsername = finalEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
  let uniqueUsername = baseUsername || `worker_${Date.now()}`;
  let counter = 1;
  while (await User.findOne({ username: uniqueUsername })) {
    uniqueUsername = `${baseUsername}${counter}`;
    counter++;
  }

  // Create worker with accountStatus='pending' (no token issued)
  const worker = await User.create({
    username: uniqueUsername,
    email: finalEmail,
    fullName: finalName,
    mobileNo: finalMobile,
    address: finalAddress,
    clinic: clinic._id,
    clinicName: clinic.name,
    supervisorAdmin: supervisor?._id || null,
    supervisorAdminName: supervisor?.fullName || adminName || '',
    role: USER_ROLES.WORKER,
    accountStatus: 'pending', // Must be approved by admin
    passwordHash: password,   // pre-save hook will hash this
  });

  // Notify the SPECIFIC selected admin about the pending request
  const dashboardUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/admin?tab=pending`;
  let emailResult = null;
  try {
    emailResult = await sendWorkerRequestToAdmin({
      adminEmail: supervisor.email, // Sent to the SELECTED admin's email!
      adminName: supervisor.fullName,
      workerName: finalName,
      workerEmail: finalEmail,
      workerMobile: finalMobile,
      clinicName: clinic.name,
      dashboardUrl,
    });
  } catch (err) {
    console.error(`[registerWorker] Failed to notify selected admin (${supervisor.email}):`, err.message);
  }

  return res.status(202).json(
    new ApiResponse(
      202,
      {
        pending_approval: true,
        worker_id: worker._id,
        worker_name: worker.fullName,
        worker_email: worker.email,
        clinic_name: clinic.name,
        supervisor_name: supervisor?.fullName || adminName || null,
        supervisor_email: supervisor?.email || null,
        admin_notified: Boolean(emailResult?.success),
        email_preview_url: emailResult?.previewUrl || null,
      },
      'Registration request submitted successfully. Your administrator has been notified to review and approve your account.'
    )
  );
});

/**
 * GET /api/v1/auth/pending-workers
 * Returns workers with accountStatus='pending' supervised by the requesting admin.
 */
const getPendingWorkers = asyncHandler(async (req, res) => {
  const adminId = req.user._id;

  const pending = await User.find({
    role: USER_ROLES.WORKER,
    accountStatus: 'pending',
    supervisorAdmin: adminId,
  })
    .populate('clinic', 'name location')
    .sort({ createdAt: -1 });

  const formatted = pending.map((w) => ({
    id: w._id,
    full_name: w.fullName,
    email: w.email,
    mobile_no: w.mobileNo || null,
    address: w.address || null,
    clinic_id: w.clinic?._id || null,
    clinic_name: w.clinic?.name || w.clinicName || null,
    requested_at: w.createdAt,
    account_status: w.accountStatus,
  }));

  return res.status(200).json(new ApiResponse(200, formatted, 'Pending worker requests fetched'));
});

/**
 * POST /api/v1/auth/workers/:id/approve
 * Admin approves a pending worker registration.
 */
const approveWorker = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user._id;

  const worker = await User.findOne({
    _id: id,
    role: USER_ROLES.WORKER,
    supervisorAdmin: adminId,
  }).populate('clinic', 'name');

  if (!worker) {
    throw new ApiError(404, 'Worker not found or you are not authorised to manage this worker');
  }

  if (worker.accountStatus === 'active') {
    throw new ApiError(400, 'This worker account is already active');
  }

  worker.accountStatus = 'active';
  worker.rejectionReason = '';
  await worker.save();

  // Send approval email to the worker, CCing the approving admin
  const loginUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/worker/login`;
  let emailResult = null;
  try {
    emailResult = await sendWorkerApprovalEmail({
      workerEmail: worker.email,
      workerName: worker.fullName,
      clinicName: worker.clinic?.name || worker.clinicName,
      loginUrl,
      adminEmail: req.user.email,
    });
  } catch (err) {
    console.error('[approveWorker] Email failed:', err.message);
  }

  return res.status(200).json(
    new ApiResponse(200, {
      id: worker._id,
      full_name: worker.fullName,
      account_status: worker.accountStatus,
      email_preview_url: emailResult?.previewUrl || null,
    }, `${worker.fullName}'s account has been approved. They will receive a confirmation email.`)
  );
});

/**
 * POST /api/v1/auth/workers/:id/reject
 * Admin rejects a pending worker registration with an optional reason.
 */
const rejectWorker = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user._id;
  const reason = (req.body.reason || '').trim();

  const worker = await User.findOne({
    _id: id,
    role: USER_ROLES.WORKER,
    supervisorAdmin: adminId,
  }).populate('clinic', 'name');

  if (!worker) {
    throw new ApiError(404, 'Worker not found or you are not authorised to manage this worker');
  }

  if (worker.accountStatus === 'rejected') {
    throw new ApiError(400, 'This worker registration has already been rejected');
  }

  worker.accountStatus = 'rejected';
  worker.rejectionReason = reason;
  await worker.save();

  // Send rejection email to the worker, CCing the reviewing admin
  const reapplyUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/worker/register`;
  let emailResult = null;
  try {
    emailResult = await sendWorkerRejectionEmail({
      workerEmail: worker.email,
      workerName: worker.fullName,
      reason,
      reapplyUrl,
      adminEmail: req.user.email,
    });
  } catch (err) {
    console.error('[rejectWorker] Email failed:', err.message);
  }

  return res.status(200).json(
    new ApiResponse(200, {
      id: worker._id,
      full_name: worker.fullName,
      account_status: worker.accountStatus,
      rejection_reason: reason,
      email_preview_url: emailResult?.previewUrl || null,
    }, `${worker.fullName}'s registration request has been rejected.`)
  );
});

export {
  login,
  logout,
  getMe,
  listWorkers,
  createUser,
  registerAdmin,
  googleAuth,
  listAdmins,
  registerWorker,
  getPendingWorkers,
  approveWorker,
  rejectWorker,
};
