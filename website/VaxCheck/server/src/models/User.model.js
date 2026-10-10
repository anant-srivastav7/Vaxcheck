/**
 * models/User.model.js
 *
 * Admin or Health Worker account.
 * Passwords are hashed with bcrypt before save.
 * JWT token generation lives here as an instance method.
 */

import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { USER_ROLES } from '../constants.js';

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      index: true,
    },
    mobileNo: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    clinicName: {
      type: String,
      trim: true,
      default: '',
    },
    googleId: {
      type: String,
      sparse: true,
      index: true,
    },
    avatar: {
      type: String,
      default: '',
    },
    passwordHash: {
      type: String,
      required: function () {
        return !this.googleId;
      },
      select: false, // never returned in queries by default
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.WORKER,
    },
    clinic: {
      type: Schema.Types.ObjectId,
      ref: 'Clinic',
      default: null,
    },
    supervisorAdmin: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    supervisorAdminName: {
      type: String,
      trim: true,
      default: '',
    },
    /**
     * accountStatus tracks the lifecycle of a user account:
     *  - 'pending'  : Worker submitted a registration request; awaiting admin approval
     *  - 'active'   : Account is active and can log in
     *  - 'rejected' : Registration request was rejected by admin
     */
    accountStatus: {
      type: String,
      enum: ['pending', 'active', 'rejected'],
      default: 'active', // Admins are always active immediately; workers default set to 'pending' in controller
    },
    /** Reason provided by admin when rejecting a worker registration request */
    rejectionReason: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

/** Hash password before creating / updating */
userSchema.pre('save', async function (next) {
  if (!this.passwordHash || !this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  next();
});

/** Compare plain-text candidate password to the stored hash */
userSchema.methods.isPasswordCorrect = async function (candidatePassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

/** Generate a signed JWT for this user */
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      username: this.username,
      role: this.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '7d' }
  );
};

export const User = mongoose.model('User', userSchema);
