const API_BASE = "https://forkdebsoc.onrender.com/api/auth";
// For Vercel deployment with same-origin API routing:
// const API_BASE = "/api/auth";

const showAlert = (alertBox, msg, type) => {
  if (!alertBox) return;
  alertBox.innerText = msg;
  alertBox.className = `p-3 mb-4 text-xs rounded border ${type === "error"
    ? "border-red-900/60 bg-red-950/40 text-red-300"
    : "border-green-900/60 bg-green-950/40 text-green-300"
    }`;
  alertBox.classList.remove("hidden");
};

document.addEventListener("DOMContentLoaded", () => {
  localStorage.removeItem("debsoc_token");
  const form = document.getElementById("register-form");
  const alertBox = document.getElementById("auth-alert");
  const pageTitle = document.getElementById("page-title");
  const pageSubtitle = document.getElementById("page-subtitle");
  const submitBtn = document.getElementById("submit-btn");
  const toggleBtn = document.getElementById("toggle-mode-btn");
  const toggleText = document.getElementById("toggle-text");
  const nameField = document.getElementById("field-displayName");
  const userField = document.getElementById("field-username");
  const otpField = document.getElementById("field-otp");
  const displayNameInput = document.getElementById("reg-displayName");
  const usernameInput = document.getElementById("reg-username");
  const emailInput = document.getElementById("reg-email");
  const passwordInput = document.getElementById("reg-password");
  const otpInput = document.getElementById("reg-otp");

  // Forgot password elements (all optional — feature no-ops if not present in the HTML)
  const forgotPasswordLink = document.getElementById("forgot-password-link");
  const forgotForm = document.getElementById("forgot-password-form");
  const forgotAlertBox = document.getElementById("forgot-password-alert");
  const forgotSubmitBtn = document.getElementById("forgot-submit-btn");
  const backToLoginBtn = document.getElementById("back-to-login-btn");
  const forgotEmailField = document.getElementById("field-forgot-email");
  const forgotOtpField = document.getElementById("field-forgot-otp");
  const forgotPasswordField = document.getElementById("field-forgot-newpassword");
  const forgotEmailInput = document.getElementById("forgot-email");
  const forgotOtpInput = document.getElementById("forgot-otp");
  const forgotNewPasswordInput = document.getElementById("forgot-newpassword");

  if (!form || !alertBox || !submitBtn || !toggleBtn || !emailInput || !passwordInput) {
    return;
  }

  let isRegisterMode = true;
  let isAwaitingOtp = false;
  let pendingEmail = "";

  // --- Forgot password flow (separate mini state machine, only wired up if the HTML exists) ---
  if (forgotPasswordLink && forgotForm && forgotAlertBox && forgotSubmitBtn) {
    let forgotStep = "email"; // "email" -> "otp" -> "password"
    let forgotEmail = "";
    let forgotOtp = "";

    const showForgotAlert = (msg, type) => showAlert(forgotAlertBox, msg, type);

    const setForgotStep = (step) => {
      forgotStep = step;
      if (forgotEmailField) forgotEmailField.classList.toggle("hidden", step !== "email");
      if (forgotOtpField) forgotOtpField.classList.toggle("hidden", step !== "otp");
      if (forgotPasswordField) forgotPasswordField.classList.toggle("hidden", step !== "password");

      if (step === "email") forgotSubmitBtn.innerText = "Send Reset Code";
      if (step === "otp") forgotSubmitBtn.innerText = "Verify Code";
      if (step === "password") forgotSubmitBtn.innerText = "Reset Password";
    };

    const openForgotPassword = () => {
      form.classList.add("hidden");
      forgotForm.classList.remove("hidden");
      forgotAlertBox.classList.add("hidden");
      forgotStep = "email";
      forgotEmail = "";
      forgotOtp = "";
      if (forgotEmailInput) forgotEmailInput.value = "";
      if (forgotOtpInput) forgotOtpInput.value = "";
      if (forgotNewPasswordInput) forgotNewPasswordInput.value = "";
      setForgotStep("email");
    };

    const closeForgotPassword = () => {
      forgotForm.classList.add("hidden");
      form.classList.remove("hidden");
      forgotAlertBox.classList.add("hidden");
    };

    forgotPasswordLink.addEventListener("click", (e) => {
      e.preventDefault();
      openForgotPassword();
    });

    if (backToLoginBtn) {
      backToLoginBtn.addEventListener("click", (e) => {
        e.preventDefault();
        closeForgotPassword();
      });
    }

    forgotForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      forgotAlertBox.classList.add("hidden");

      try {
        if (forgotStep === "email") {
          forgotEmail = (forgotEmailInput?.value || "").trim();
          if (!forgotEmail) {
            showForgotAlert("Please enter your email address.", "error");
            return;
          }

          forgotSubmitBtn.disabled = true;
          const res = await fetch(`${API_BASE}/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: forgotEmail })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Could not send reset code.");

          showForgotAlert("A reset code has been sent to your email.", "success");
          setForgotStep("otp");
        } else if (forgotStep === "otp") {
          forgotOtp = (forgotOtpInput?.value || "").trim();
          if (!forgotOtp) {
            showForgotAlert("Please enter the 6-digit code sent to your email.", "error");
            return;
          }

          forgotSubmitBtn.disabled = true;
          const res = await fetch(`${API_BASE}/verify-reset-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: forgotEmail, otp: forgotOtp })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Invalid or expired code.");

          showForgotAlert("Code verified. Choose a new password.", "success");
          setForgotStep("password");
        } else if (forgotStep === "password") {
          const newPassword = forgotNewPasswordInput?.value || "";
          if (!newPassword || newPassword.length < 8) {
            showForgotAlert("Password must be at least 8 characters.", "error");
            return;
          }

          forgotSubmitBtn.disabled = true;
          const res = await fetch(`${API_BASE}/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: forgotEmail, otp: forgotOtp, newPassword })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Could not reset password.");

          showForgotAlert("Password changed! Redirecting to sign in...", "success");
          setTimeout(() => {
            closeForgotPassword();
          }, 1200);
        }
      } catch (err) {
        showForgotAlert(err.message, "error");
      } finally {
        forgotSubmitBtn.disabled = false;
      }
    });
  }

  const setButtonText = (text, disabled = false) => {
    submitBtn.disabled = disabled;
    submitBtn.innerText = text;
  };

  const resetOtpState = () => {
    isAwaitingOtp = false;
    pendingEmail = "";
    if (otpField) otpField.classList.add("hidden");
    if (otpInput) otpInput.value = "";
  };

  const toggleMode = () => {
    isRegisterMode = !isRegisterMode;
    alertBox.classList.add("hidden");
    resetOtpState();

    if (isRegisterMode) {
      pageTitle.innerText = "Create Account";
      pageSubtitle.innerText = "Use your personal or institutional email address.";
      setButtonText("Complete Registration", false);
      toggleText.innerText = "Already registered?";
      toggleBtn.innerText = "Sign In";

      if (nameField) nameField.classList.remove("hidden");
      if (userField) userField.classList.remove("hidden");
      if (displayNameInput) displayNameInput.required = true;
      if (usernameInput) usernameInput.required = true;

      if (forgotPasswordLink) {
        forgotPasswordLink.classList.add("hidden");
      }
    }
    else {
      pageTitle.innerText = "Sign In";
      pageSubtitle.innerText = "Access your DebSoc profile and debate registrations.";
      setButtonText("Sign In", false);
      toggleText.innerText = "Need an account?";
      toggleBtn.innerText = "Register";

      if (nameField) nameField.classList.add("hidden");
      if (userField) userField.classList.add("hidden");
      if (displayNameInput) displayNameInput.required = false;
      if (usernameInput) usernameInput.required = false;

      if (forgotPasswordLink) {
        forgotPasswordLink.classList.remove("hidden");
      }
    }
  };

  toggleBtn.addEventListener("click", toggleMode);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertBox.classList.add("hidden");

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (isAwaitingOtp) {
      const otp = (otpInput?.value || "").trim();
      if (!otp) {
        showAlert(alertBox, "Please enter the 6-digit OTP sent to your email.", "error");
        return;
      }

      setButtonText("Verifying OTP...", true);

      try {
        const res = await fetch(`${API_BASE}/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: pendingEmail, otp })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Verification failed");

        localStorage.setItem("debsoc_user", JSON.stringify(data.user));

        showAlert(alertBox, "Verification successful! Redirecting...", "success");
        setTimeout(() => {
          window.location.href = "index.html";
        }, 800);
      } catch (err) {
        showAlert(alertBox, err.message, "error");
      } finally {
        setButtonText("Verify OTP", false);
      }
      return;
    }

    const isLoginMode = !isRegisterMode;
    setButtonText(isLoginMode ? "Signing In..." : "Sending OTP...", true);

    try {
      const endpoint = isLoginMode ? `${API_BASE}/login` : `${API_BASE}/register`;
      const payload = isLoginMode
        ? { email, password }
        : {
          displayName: displayNameInput.value.trim(),
          username: usernameInput.value.trim(),
          email,
          password
        };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed.");

      if (isLoginMode) {
        localStorage.setItem("debsoc_user", JSON.stringify(data.user));

        showAlert(alertBox, "Login successful! Redirecting...", "success");
        setTimeout(() => {
          window.location.href = "index.html";
        }, 800);
      } else {
        pendingEmail = email;
        isAwaitingOtp = true;
        if (otpField) otpField.classList.remove("hidden");
        if (otpInput) otpInput.focus();
        setButtonText("Verify OTP", false);
        showAlert(alertBox, "OTP sent to your email. Enter the code to finish registration.", "success");
      }
    } catch (err) {
      showAlert(alertBox, err.message, "error");
    } finally {
      if (isLoginMode) {
        setButtonText("Sign In", false);
      }
      if (!isLoginMode && !isAwaitingOtp) {
        setButtonText("Complete Registration", false);
      }
    }
  });
});