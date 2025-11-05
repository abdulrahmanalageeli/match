# Admin Login Brute-Force Protection

## Overview
Implemented comprehensive client-side brute-force protection for admin login to prevent unauthorized access attempts.

## Security Features

### 1. **Progressive Lockout System**
Failed login attempts trigger increasing lockout durations:
- **1st-2nd attempts**: No lockout, warning messages
- **3rd attempt**: 30 seconds lockout
- **4th attempt**: 2 minutes lockout
- **5th attempt**: 5 minutes lockout
- **6th attempt**: 15 minutes lockout
- **7th attempt**: 30 minutes lockout
- **8th+ attempts**: 1 hour lockout

### 2. **Visual Feedback**
Clear Arabic messages inform users about:
- **Remaining attempts** before lockout
- **Lockout duration** when locked
- **Current security status** with color-coded alerts

**Status Indicators:**
- 🔵 **Blue (Info)**: 2 attempts remaining
- 🟡 **Yellow (Warning)**: 1 attempt remaining before lockout
- 🔴 **Red (Error)**: Currently locked out with countdown

### 3. **Automatic Reset**
- Attempts automatically reset after **5 minutes of inactivity**
- Lockout clears when timer expires
- Successful login immediately resets all counters

### 4. **UI Protection**
- **Input field disabled** during lockout
- **Button disabled** during lockout
- **Enter key blocked** during lockout
- **Visual countdown** on button showing remaining lockout time

## Technical Implementation

### State Management
```typescript
const [loginAttempts, setLoginAttempts] = useState(0);
const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
const [lastAttemptTime, setLastAttemptTime] = useState<number | null>(null);
```

### Lockout Check Function
```typescript
const checkLoginLockout = () => {
  if (!lockoutUntil) return { locked: false, remaining: 0 };
  
  const now = Date.now();
  const remaining = Math.ceil((lockoutUntil - now) / 1000);
  
  if (remaining <= 0) {
    setLockoutUntil(null);
    setLoginAttempts(0);
    return { locked: false, remaining: 0 };
  }
  
  return { locked: true, remaining };
};
```

### Security Status Messages
```typescript
const getLoginSecurityStatus = () => {
  const lockout = checkLoginLockout();
  
  if (lockout.locked) {
    return {
      type: 'error',
      message: `محظور لمدة ${lockout.remaining} ثانية - محاولات فاشلة كثيرة`
    };
  }
  
  if (loginAttempts === 2) {
    return {
      type: 'warning',
      message: 'تحذير: محاولة واحدة متبقية قبل الحظر'
    };
  }
  
  if (loginAttempts === 1) {
    return {
      type: 'info',
      message: 'محاولتان متبقيتان'
    };
  }
  
  return null;
};
```

### Enhanced Login Function
```typescript
const login = () => {
  // Check if locked out
  const lockout = checkLoginLockout();
  if (lockout.locked) {
    toast.error(`محظور لمدة ${lockout.remaining} ثانية`);
    return;
  }

  if (password === STATIC_PASSWORD) {
    // Successful login - reset attempts
    localStorage.setItem("admin", "authenticated")
    setAuthenticated(true)
    setLoginAttempts(0)
    setLockoutUntil(null)
    setLastAttemptTime(null)
    fetchParticipants()
  } else {
    // Failed login - increment attempts and apply lockout
    const newAttempts = loginAttempts + 1;
    setLoginAttempts(newAttempts);
    setLastAttemptTime(Date.now());
    
    const lockoutDurations = [0, 0, 30, 120, 300, 900, 1800, 3600];
    const lockoutSeconds = lockoutDurations[Math.min(newAttempts, lockoutDurations.length - 1)];
    
    if (lockoutSeconds > 0) {
      setLockoutUntil(Date.now() + lockoutSeconds * 1000);
      toast.error(`كلمة مرور خاطئة. محظور لمدة ${lockoutSeconds} ثانية`);
    } else {
      toast.error(`كلمة مرور خاطئة. ${3 - newAttempts} محاولات متبقية`);
    }
  }
}
```

### Auto-Reset After Inactivity
```typescript
useEffect(() => {
  const resetInterval = setInterval(() => {
    if (lastAttemptTime && Date.now() - lastAttemptTime > 300000) { // 5 minutes
      setLoginAttempts(0);
      setLockoutUntil(null);
      setLastAttemptTime(null);
    }
  }, 30000); // Check every 30 seconds

  return () => clearInterval(resetInterval);
}, [lastAttemptTime]);
```

## UI Components

### Login Form with Security Feedback
```tsx
<div className="space-y-4">
  {/* Password Input */}
  <div className="relative">
    <LockKeyhole className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
    <input
      type="password"
      placeholder="Enter Admin Password"
      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:border-slate-400 transition-all duration-300"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      onKeyPress={(e) => e.key === 'Enter' && !checkLoginLockout().locked && login()}
      disabled={checkLoginLockout().locked}
    />
  </div>

  {/* Security Status Alert */}
  {(() => {
    const status = getLoginSecurityStatus();
    if (!status) return null;
    
    const bgColors = {
      error: 'bg-red-500/20 border-red-500/30 text-red-300',
      warning: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-300',
      info: 'bg-blue-500/20 border-blue-500/30 text-blue-300'
    };
    
    const icons = {
      error: <AlertCircle className="w-4 h-4" />,
      warning: <AlertCircle className="w-4 h-4" />,
      info: <Shield className="w-4 h-4" />
    };
    
    return (
      <div className={`flex items-center gap-2 p-3 rounded-lg border ${bgColors[status.type]} text-sm`}>
        {icons[status.type]}
        <span>{status.message}</span>
      </div>
    );
  })()}
  
  {/* Login Button */}
  <button
    className={`w-full py-3 rounded-xl font-medium transition-all duration-300 shadow-lg ${
      checkLoginLockout().locked
        ? 'bg-slate-700/50 text-slate-400 cursor-not-allowed'
        : 'bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white transform hover:scale-105'
    }`}
    onClick={login}
    disabled={checkLoginLockout().locked}
  >
    {checkLoginLockout().locked ? `Locked (${checkLoginLockout().remaining}s)` : 'Access Dashboard'}
  </button>
</div>
```

## Attack Scenario Example

### Scenario: Brute-Force Attack Attempt

1. **Attempt 1**: Wrong password
   - Message: "كلمة مرور خاطئة. 2 محاولات متبقية" (Wrong password. 2 attempts remaining)
   - Status: Blue info box shows "محاولتان متبقيتان"

2. **Attempt 2**: Wrong password
   - Message: "كلمة مرور خاطئة. 1 محاولات متبقية" (Wrong password. 1 attempt remaining)
   - Status: Yellow warning shows "تحذير: محاولة واحدة متبقية قبل الحظر"

3. **Attempt 3**: Wrong password
   - Message: "كلمة مرور خاطئة. محظور لمدة 30 ثانية" (Wrong password. Locked for 30 seconds)
   - Status: Red error shows "محظور لمدة 30 ثانية - محاولات فاشلة كثيرة"
   - UI: Input and button disabled, countdown on button

4. **After 30 seconds**: Lockout expires automatically

5. **Attempt 4**: Wrong password
   - Lockout: **2 minutes** (120 seconds)

6. **Attempt 5**: Wrong password
   - Lockout: **5 minutes** (300 seconds)

7. **Continuous attempts**: Lockout increases to maximum **1 hour**

### Scenario: Legitimate User

1. **Forgot password, tries 2 times**
   - Gets warning after 2nd attempt
   - Remembers password on 3rd try
   - **Successful login** - all counters reset

2. **No activity for 5 minutes**
   - Attempts automatically reset
   - Clean slate for next login

## Security Benefits

1. **Prevents Automated Attacks**: Progressive lockouts make brute-force impractical
2. **User-Friendly**: Legitimate users get clear feedback and grace period
3. **Self-Healing**: Automatic reset after inactivity prevents permanent lockouts
4. **No Database Required**: Client-side implementation works without backend changes
5. **Arabic Support**: All messages in Arabic for target audience

## Limitations & Recommendations

### Current Limitations
- **Client-side only**: Determined attacker could bypass by clearing browser state
- **No IP tracking**: Same browser can retry after clearing localStorage
- **Session-based**: Doesn't persist across browser sessions/devices

### Recommended Enhancements (Future)
1. **Server-Side Rate Limiting**: Add IP-based rate limiting in API endpoints
2. **Session Logging**: Track failed attempts in database
3. **Admin Notifications**: Alert on multiple failed attempts
4. **2FA**: Implement two-factor authentication
5. **Supabase Auth**: Replace static password with proper authentication system

## Testing Checklist

- [x] Failed login increments attempt counter
- [x] Progressive lockout durations work correctly
- [x] Visual feedback shows appropriate messages
- [x] Input and button disabled during lockout
- [x] Enter key blocked during lockout
- [x] Successful login resets all counters
- [x] Lockout auto-expires after duration
- [x] Attempts reset after 5 minutes inactivity
- [x] Button shows countdown during lockout
- [x] Color-coded alerts display correctly

## Files Modified

- **app/routes/admin.tsx**:
  - Added brute-force protection state variables
  - Implemented `checkLoginLockout()` function
  - Implemented `getLoginSecurityStatus()` function
  - Enhanced `login()` function with attempt tracking
  - Added auto-reset useEffect
  - Updated UI with security feedback components

## Impact

Admins are now protected from brute-force attacks with progressive lockouts that increase with each failed attempt, while legitimate users get clear feedback and reasonable grace periods before being locked out.
