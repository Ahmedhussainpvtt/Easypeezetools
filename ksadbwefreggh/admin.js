(() => {
  const API =
    window.EASYPEEZE_ADMIN_API ||
    "https://easypeeze-tools-u4rcttr3nq-el.a.run.app";
  const TOKEN_KEY = "easypeeze_admin_token";
  const EMAIL_KEY = "easypeeze_admin_email";
  const EXPIRES_KEY = "easypeeze_admin_expires";
  const IDLE_MS = 10 * 60 * 1000;

  const $ = (id) => document.getElementById(id);
  let usersCache = [];
  let sortKey = "email";
  let sortDir = "asc";
  let currentCustomerEmail = "";
  let sessionTimer = null;
  let memoryToken = "";
  let memoryEmail = "";
  let lastActivity = 0;
  let lastHeartbeat = 0;
  let pendingChallengeId = "";
  let pendingEmail = "";
  let otpHoldIdle = false;

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const icon = (id) => `<svg aria-hidden="true"><use href="#${id}" /></svg>`;

  function safePhotoUrl(raw) {
    const s = String(raw || "").trim();
    if (!s.startsWith("https://")) return "";
    try {
      const host = new URL(s).hostname.toLowerCase();
      if (!host.endsWith("googleusercontent.com")) return "";
      return s;
    } catch (_e) {
      return "";
    }
  }

  function setAvatar(el, url, initialsText) {
    if (!el) return;
    const photo = safePhotoUrl(url);
    const ini = initialsText || " - ";
    if (!photo) {
      el.classList.remove("avatar--photo");
      el.textContent = ini;
      return;
    }
    el.classList.add("avatar--photo");
    el.innerHTML = `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer" />`;
  }

  function avatarHtml(u) {
    const ini = esc(initials(u.name, u.email));
    const photo = safePhotoUrl(u.photoUrl);
    if (!photo) return `<span class="avatar">${ini}</span>`;
    return `<span class="avatar avatar--photo"><img src="${esc(photo)}" alt="" referrerpolicy="no-referrer" /></span>`;
  }

  function toast(message, tone = "info") {
    const stack = $("toast-stack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = `toast toast--${tone}`;
    el.innerHTML = `${
      tone === "error" ? icon("i-alert") : tone === "ok" ? icon("i-check") : ""
    }<span>${esc(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => el.remove(), tone === "error" ? 6000 : 3500);
  }

  function token() {
    return memoryToken || "";
  }

  function isSessionAlive() {
    if (!token()) return false;
    if (!lastActivity) return false;
    return Date.now() - lastActivity < IDLE_MS;
  }

  function clearSessionTimer() {
    if (sessionTimer) {
      clearTimeout(sessionTimer);
      sessionTimer = null;
    }
  }

  function armSessionTimer() {
    clearSessionTimer();
    if (!token()) return;
    if (otpHoldIdle) return;
    const wait = Math.max(0, IDLE_MS - (Date.now() - lastActivity));
    sessionTimer = setTimeout(() => {
      expireSession("Session expired - please log in again", "idle");
    }, wait);
  }

  function markActivity() {
    if (!token()) return;
    lastActivity = Date.now();
    armSessionTimer();
    if (Date.now() - lastHeartbeat < 60_000) return;
    lastHeartbeat = Date.now();
    const tok = token();
    fetch(`${API}/admin/me`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${tok}` }
    })
      .then((r) => {
        if (r.status === 401 && token()) {
          expireSession("Session expired - please log in again", "session");
        }
      })
      .catch(() => {});
  }

  function revokeOnServer(tok, reason) {
    if (!tok) return;
    try {
      fetch(`${API}/admin/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${tok}`
        },
        body: JSON.stringify({ token: tok, reason: reason || "leave" }),
        keepalive: true
      }).catch(() => {});
    } catch (_e) {
      /* ignore */
    }
  }

  function expireSession(message, reason) {
    clearSession(reason || "session");
    showLogin();
    if (message) {
      const err = $("login-error");
      if (err) {
        err.textContent = message;
        err.hidden = false;
      }
      toast(message, "error");
    }
  }

  function setSession(tok, email) {
    memoryToken = tok || "";
    memoryEmail = email || "";
    lastActivity = Date.now();
    lastHeartbeat = 0;
    armSessionTimer();
  }

  function clearSession(reason) {
    clearSessionTimer();
    const tok = memoryToken;
    memoryToken = "";
    memoryEmail = "";
    lastActivity = 0;
    lastHeartbeat = 0;
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(EMAIL_KEY);
      sessionStorage.removeItem(EXPIRES_KEY);
    } catch (_e) {
      /* ignore */
    }
    revokeOnServer(tok, reason);
  }

  function actionIntent(path, method) {
    const p = String(path || "").split("?")[0].replace(/\/+$/, "");
    const m = String(method || "GET").toUpperCase();
    if (p === "/admin/paid-users.csv") return "export-users";
    if (p === "/admin/grant-access") return "grant-access";
    if (p === "/admin/update-user") return "update-user";
    if (p === "/admin/revoke-access" || p === "/admin/revokeaccess" || p === "/admin/revoke") {
      return "revoke-access";
    }
    if (p === "/admin/user-plans" && m === "POST") return "user-plans";
    if (p === "/admin/migrate-plans") return "migrate-plans";
    if (p === "/admin/blog" && m === "DELETE") return "blog-delete";
    if (p === "/admin/blog") return "blog";
    if (p === "/admin/blog/delete" || p === "/admin/delete-blog" || p === "/admin/deleteblog") {
      return "blog-delete";
    }
    if (p === "/admin/fanout") return "fanout";
    if (p === "/admin/release-device") return "release-device";
    return "";
  }

  function normalizeActionOtp(raw) {
    return String(raw || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function confirmUi({ title, message, okLabel, danger }) {
    return new Promise((resolve) => {
      const dlg = $("confirm-dialog");
      const form = $("confirm-form");
      const cancel = $("confirm-cancel");
      const ok = $("confirm-ok");
      if (!dlg || !form || !cancel || !ok) {
        resolve(false);
        return;
      }
      $("confirm-title").textContent = title || "Please confirm";
      $("confirm-message").textContent = message || "";
      ok.textContent = okLabel || "Continue";
      ok.classList.toggle("btn-danger", !!danger);
      ok.classList.toggle("btn-primary", !danger);
      const finish = (yes) => {
        form.removeEventListener("submit", onOk);
        cancel.removeEventListener("click", onNo);
        dlg.close();
        resolve(yes);
      };
      const onNo = () => finish(false);
      const onOk = (e) => {
        e.preventDefault();
        finish(true);
      };
      cancel.addEventListener("click", onNo);
      form.addEventListener("submit", onOk);
      dlg.showModal();
      ok.focus();
    });
  }

  function otpDialogEls() {
    return {
      dlg: $("otp-action-dialog"),
      busy: $("otp-busy"),
      form: $("otp-action-form"),
      input: $("otp-action-input"),
      err: $("otp-action-error"),
      cancel: $("otp-action-cancel")
    };
  }

  function closeOtpDialog() {
    const { dlg, busy, form } = otpDialogEls();
    otpHoldIdle = false;
    lastActivity = Date.now();
    armSessionTimer();
    if (busy) busy.hidden = true;
    if (form) form.hidden = true;
    if (dlg && dlg.open) dlg.close();
  }

  function showOtpSending() {
    const { dlg, busy, form } = otpDialogEls();
    if (!dlg || !busy) return;
    otpHoldIdle = true;
    clearSessionTimer();
    if (form) form.hidden = true;
    busy.hidden = false;
    if (!dlg.open) dlg.showModal();
  }

  function promptActionOtp() {
    return new Promise((resolve, reject) => {
      const { dlg, busy, form, input, err, cancel } = otpDialogEls();
      if (!dlg || !form || !input) {
        reject(new Error("Code required"));
        return;
      }
      otpHoldIdle = true;
      clearSessionTimer();
      if (busy) busy.hidden = true;
      form.hidden = false;
      input.value = "";
      if (err) err.hidden = true;
      const finish = (fn) => {
        form.removeEventListener("submit", onSubmit);
        cancel.removeEventListener("click", onCancel);
        closeOtpDialog();
        fn();
      };
      const onCancel = () => finish(() => reject(new Error("Code required")));
      const onSubmit = (e) => {
        e.preventDefault();
        const otp = normalizeActionOtp(input.value);
        input.value = "";
        if (!otp) {
          if (err) {
            err.textContent = "Enter the code from email";
            err.hidden = false;
          }
          return;
        }
        finish(() => resolve(otp));
      };
      cancel.addEventListener("click", onCancel);
      form.addEventListener("submit", onSubmit);
      if (!dlg.open) dlg.showModal();
      input.focus();
    });
  }

  async function sendStepUp(intent) {
    const tok = token();
    const res = await fetch(`${API}/admin/step-up`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${tok}`
      },
      body: JSON.stringify({ intent })
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401 && /unauthorized/i.test(String(j.error || ""))) {
      expireSession("Session expired - please log in again", "session");
      throw new Error("session expired");
    }
    if (!res.ok || j.ok === false) throw new Error(j.error || `HTTP ${res.status}`);
    if (!j.challengeId) throw new Error("sign-in code required");
    return j;
  }

  async function api(path, opts = {}) {
    if (!isSessionAlive()) {
      expireSession("Session expired - please log in again", "idle");
      throw new Error("session expired");
    }
    const method = String(opts.method || "GET").toUpperCase();
    const headers = Object.assign(
      { Accept: "application/json", "Content-Type": "application/json" },
      opts.headers || {}
    );
    const tok = token();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    const intent = actionIntent(path, method);
    if (path !== "/admin/step-up" && intent) {
      showOtpSending();
      let step;
      try {
        step = await sendStepUp(intent);
      } catch (ex) {
        closeOtpDialog();
        throw ex;
      }
      const otp = await promptActionOtp();
      let bodyObj = {};
      if (opts.body) {
        try {
          bodyObj = JSON.parse(opts.body);
        } catch (_e) {
          bodyObj = {};
        }
      }
      bodyObj.challengeId = step.challengeId;
      bodyObj.otp = otp;
      opts = Object.assign({}, opts, {
        method: method === "GET" ? "POST" : method,
        body: JSON.stringify(bodyObj)
      });
    }
    let res;
    try {
      res = await fetch(`${API}${path}`, { ...opts, headers });
    } catch (_e) {
      throw new Error("Could not reach the server. Try again.");
    }
    markActivity();
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      const plain = String(text || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
      data = { ok: false, error: plain || "bad response" };
    }
    if (res.status === 401) {
      const msg = String(data?.error || "");
      if (/code required|expired code|invalid or expired/i.test(msg)) {
        throw new Error(msg);
      }
      expireSession("Session expired - please log in again", "session");
      throw new Error(msg || "unauthorized");
    }
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
  }

  function startLoginIntro() {
    window.dispatchEvent(new CustomEvent("admin-login-replay"));
  }

  function showLogin() {
    resetLoginSteps();
    startLoginIntro();
    $("login-view").classList.remove("hidden");
    $("app-view").classList.add("hidden");
  }
  function showApp() {
    $("login-view").classList.add("hidden");
    $("app-view").classList.remove("hidden");
    $("admin-email-label").textContent = memoryEmail || "";
    $("admin-initials").textContent = initials("", memoryEmail);
    syncShellLayout();
  }

  function initials(name, email) {
    const src = (name || email || "?").trim();
    const parts = src.split(/[\s@._-]+/).filter(Boolean);
    const a = (parts[0] || "?").slice(0, 1);
    const b = (parts[1] || parts[0] || "?").slice(0, 1);
    return (a + b).toUpperCase();
  }

  function planLabel(slice) {
    if (!slice || slice.plan === "none") return " - ";
    const st = slice.status && slice.status !== "none" ? ` · ${slice.status}` : "";
    return `${slice.plan}${st}`;
  }

  function planCell(slice) {
    const label = planLabel(slice);
    let cls = "plan-pill";
    if (label === " - ") cls += " plan-pill--none";
    else if (slice.status === "expired") cls += " plan-pill--expired";
    return `<span class="${cls}">${esc(label)}</span>`;
  }

  const STATE_BADGE = {
    active: { cls: "badge-ok", text: "Active" },
    expired: { cls: "badge-warn", text: "Expired" },
    none: { cls: "badge-off", text: "Free" }
  };

  /** `state` is authoritative; `active` is kept for older API responses. */
  function stateCell(u) {
    const key = u.state || (u.active ? "active" : "none");
    const badge = STATE_BADGE[key] || STATE_BADGE.none;
    return `<span class="badge ${badge.cls}">${badge.text}</span>`;
  }

  const STATE_RANK = { none: 0, expired: 1, active: 2 };

  function cmpText(a, b) {
    return String(a || "").toLowerCase().localeCompare(String(b || "").toLowerCase(), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  }

  function verParts(s) {
    const nums = String(s || "").match(/\d+/g);
    if (!nums) return [0, 0, 0];
    return [Number(nums[0] || 0), Number(nums[1] || 0), Number(nums[2] || 0)];
  }

  function cmpVersion(a, b) {
    const pa = verParts(a);
    const pb = verParts(b);
    for (let i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return cmpText(a, b);
  }

  function sortValue(u, key) {
    if (key === "name") return u.name || "";
    if (key === "email") return u.email || "";
    if (key === "phone") return u.phone || "";
    if (key === "status") return STATE_RANK[u.state] || 0;
    if (key === "kharchlog") return `${u.kharchlog?.plan || ""} ${u.kharchlog?.status || ""}`;
    if (key === "pdfbuddy") return `${u.pdfbuddy?.plan || ""} ${u.pdfbuddy?.status || ""}`;
    if (key === "version") return u.appVersion || "";
    return "";
  }

  function sortedUsers(list) {
    const copy = list.slice();
    const dir = sortDir === "desc" ? -1 : 1;
    copy.sort((a, b) => {
      const ka = sortValue(a, sortKey);
      const kb = sortValue(b, sortKey);
      let r = 0;
      if (sortKey === "status") r = Number(ka) - Number(kb);
      else if (sortKey === "version") r = cmpVersion(ka, kb);
      else r = cmpText(ka, kb);
      if (r === 0) r = cmpText(a.email, b.email);
      return r * dir;
    });
    return copy;
  }

  function syncSortHeaders() {
    document.querySelectorAll("#tab-customers th[data-sort]").forEach((th) => {
      const key = th.getAttribute("data-sort");
      th.setAttribute("aria-sort", key === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : "none");
    });
  }

  /** Placeholder rows so the table never flashes an empty/"not found" state. */
  function showTableLoading() {
    $("users-empty").hidden = true;
    const widths = ["70%", "85%", "55%", "60%", "65%", "65%", "40%", "40%"];
    $("users-tbody").innerHTML = Array.from({ length: 5 })
      .map(
        () =>
          `<tr>${widths
            .map((w) => `<td><span class="skeleton-line" style="width:${w}"></span></td>`)
            .join("")}</tr>`
      )
      .join("");
  }

  function renderUsers(list) {
    const q = ($("search-users").value || "").trim().toLowerCase();
    const filtered = !q
      ? list
      : list.filter((u) =>
          [
            u.email,
            u.name,
            u.phone,
            u.state,
            u.appVersion,
            u.kharchlog?.plan,
            u.kharchlog?.status,
            u.pdfbuddy?.plan,
            u.pdfbuddy?.status
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
        );
    const rows = sortedUsers(filtered);
    syncSortHeaders();
    $("table-count").textContent = String(rows.length);
    const tbody = $("users-tbody");
    tbody.innerHTML = "";
    $("users-empty").hidden = rows.length > 0;
    for (const u of rows) {
      const mail = esc(u.email);
      const tr = document.createElement("tr");
      tr.setAttribute("data-open", u.email);
      tr.innerHTML = `
        <td data-label="Name">
          <div class="name-cell">
            ${avatarHtml(u)}
            <a class="name-link" href="#" data-open="${mail}">${esc(u.name || " - ")}</a>
          </div>
        </td>
        <td data-label="Email" class="cell-mono">${mail}</td>
        <td data-label="Phone" class="cell-mono">${esc(u.phone || " - ")}</td>
        <td data-label="Status">${stateCell(u)}</td>
        <td data-label="Kharch Log">${planCell(u.kharchlog)}</td>
        <td data-label="Pdf Buddy">${planCell(u.pdfbuddy)}</td>
        <td data-label="Version" class="cell-mono">${esc(u.appVersion || " - ")}</td>
        <td data-label="Actions" class="col-actions">
          <div class="row-actions">
            <button type="button" class="icon-btn" title="Edit ${mail}" aria-label="Edit ${mail}" data-edit="${mail}">${icon(
        "i-edit"
      )}</button>
            <button type="button" class="icon-btn icon-btn--danger" title="Remove ${mail}" aria-label="Remove ${mail}" data-del="${mail}">${icon(
        "i-trash"
      )}</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    }
  }

  function dash(v) {
    const s = String(v || "").trim();
    return s || " - ";
  }

  function formatWhen(iso) {
    if (!iso) return " - ";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return String(iso).replace("T", " ").slice(0, 19);
    }
    const pad = (n) => String(n).padStart(2, "0");
    let h = d.getHours();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${h}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ampm}`;
  }

  function syncShellLayout() {
    const customer = !$("customer-view").classList.contains("hidden");
    const customersTab = !$("tab-customers").classList.contains("hidden");
    $("app-view").classList.toggle("is-customer", customer);
    $("app-view").classList.toggle("is-list", !customer && customersTab);
  }

  function setCustomerMode(on) {
    $("customer-view").classList.toggle("hidden", !on);
    $("app-main").classList.toggle("hidden", on);
    syncShellLayout();
  }

  function closeCustomer() {
    currentCustomerEmail = "";
    setCustomerMode(false);
  }

  function renderLoginHistory(rows) {
    const list = Array.isArray(rows) ? rows : [];
    $("cv-login-count").textContent = String(list.length);
    $("cv-login-empty").hidden = list.length > 0;
    const tbody = $("cv-login-tbody");
    tbody.innerHTML = "";
    list.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="S.No">${i + 1}</td>
        <td data-label="Login time">${esc(formatWhen(row.at))}</td>
        <td data-label="IP address" class="cell-mono">${esc(dash(row.ip))}</td>
        <td data-label="Platform">${esc(dash(row.platform))}</td>
        <td data-label="App version">${esc(dash(row.appVersion))}</td>`;
      tbody.appendChild(tr);
    });
  }

  function isoDate(v) {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function syncSubExpiry(prefix) {
    const plan = $(`${prefix}-plan`).value;
    const none = plan === "none";
    const life = plan === "lifetime";
    const exp = $(`${prefix}-exp`);
    exp.disabled = none || life;
    if (life || none) exp.value = "";
    ["start", "amount", "payid", "order", "provider"].forEach((k) => {
      const el = $(`${prefix}-${k}`);
      if (el) el.disabled = none;
    });
  }

  function fillSubFields(prefix, slice) {
    const plan = slice && slice.plan && slice.plan !== "none" ? slice.plan : "none";
    const sel = $(`${prefix}-plan`);
    if (plan === "yearly" && !sel.querySelector('option[value="yearly"]')) {
      const o = document.createElement("option");
      o.value = "yearly";
      o.textContent = "Yearly (legacy)";
      sel.appendChild(o);
    }
    if (sel.querySelector(`option[value="${plan}"]`)) sel.value = plan;
    else sel.value = "none";
    $(`${prefix}-status`).textContent = dash(slice && slice.status && slice.status !== "none" ? slice.status : "free");
    $(`${prefix}-granted`).textContent = dash(slice && slice.grantedBy);
    $(`${prefix}-start`).value = isoDate(slice && slice.startsAt);
    $(`${prefix}-exp`).value = isoDate(slice && slice.expiresAt);
    $(`${prefix}-amount`).value = slice && slice.amountInr ? String(slice.amountInr) : "";
    $(`${prefix}-payid`).value = (slice && slice.paymentId) || "";
    $(`${prefix}-order`).value = (slice && slice.orderId) || "";
    const provider = (slice && slice.paymentProvider) || "manual";
    const prov = $(`${prefix}-provider`);
    if (prov.querySelector(`option[value="${provider}"]`)) prov.value = provider;
    else prov.value = "manual";
    syncSubExpiry(prefix);
  }

  function productPayload(prefix) {
    const plan = $(`${prefix}-plan`).value;
    if (plan === "none") return { plan: "none" };
    const amountRaw = $(`${prefix}-amount`).value.trim();
    return {
      plan,
      startsAt: $(`${prefix}-start`).value || undefined,
      expiresAt: plan === "yearly" ? $(`${prefix}-exp`).value || undefined : undefined,
      amountInr: amountRaw ? Number(amountRaw) : undefined,
      paymentId: $(`${prefix}-payid`).value.trim(),
      orderId: $(`${prefix}-order`).value.trim(),
      paymentProvider: $(`${prefix}-provider`).value
    };
  }

  function fillCustomerView(user) {
    const name = user.name || user.email || "Customer";
    $("customer-view-title").textContent = name;
    setAvatar($("cv-avatar"), user.photoUrl, initials(user.name, user.email));
    $("cv-name").textContent = name;
    const key = user.state || "none";
    const badge = STATE_BADGE[key] || STATE_BADGE.none;
    $("cv-state").className = `badge ${badge.cls}`;
    $("cv-state").textContent = badge.text;
    $("cv-first").value = user.firstName || "";
    $("cv-last").value = user.lastName || "";
    $("cv-email").value = user.email || "";
    $("cv-phone").value = user.phone || "";
    $("cv-first-seen").textContent = formatWhen(user.firstSeen);
    $("cv-last-seen").textContent = formatWhen(user.lastSeen);
    $("cv-country").textContent = countryLabel(user.countryIso);
    $("cv-notes").value = user.notes || "";
    renderLoginHistory(user.loginHistory);
    fillSubFields("cv-kh", user.kharchlog);
    fillSubFields("cv-pdf", user.pdfbuddy);
  }

  function countryLabel(iso) {
    const code = String(iso || "").trim().toUpperCase();
    if (!code) return " - ";
    try {
      const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
      return name ? `${name} (${code})` : code;
    } catch {
      return code;
    }
  }

  async function openCustomer(email) {
    currentCustomerEmail = email;
    setCustomerMode(true);
    $("customer-view-title").textContent = email;
    try {
      const data = await api(`/admin/user?email=${encodeURIComponent(email)}`);
      fillCustomerView(data.user || { email });
    } catch (ex) {
      toast(ex.message || "Could not load customer", "error");
      closeCustomer();
    }
  }

  function setKpis(stats) {
    $("kpi-total").textContent = stats?.total ?? " - ";
    $("kpi-active").textContent = stats?.active ?? " - ";
    $("kpi-expired").textContent = stats?.expired ?? " - ";
    $("kpi-inactive").textContent = stats?.inactive ?? " - ";
    $("kpi-kharch").textContent = stats?.kharchlogActive ?? " - ";
    $("kpi-pdf").textContent = stats?.pdfbuddyActive ?? " - ";
  }

  async function loadUsers() {
    const btn = $("btn-refresh");
    btn.disabled = true;
    showTableLoading();
    try {
      const data = await api("/admin/users");
      usersCache = data.users || [];
      setKpis(data.stats || {});
      renderUsers(usersCache);
    } finally {
      btn.disabled = false;
    }
  }

  function fillProductStatus(prefix, slice) {
    const planEl = $(`${prefix}-plan`);
    const metaEl = $(`${prefix}-meta`);
    const card = planEl.closest(".product-status");
    if (!slice || slice.plan === "none" || !slice.plan) {
      planEl.textContent = "No plan";
      metaEl.textContent = "Free / not granted";
      card.dataset.state = "none";
      return;
    }
    const plan = String(slice.plan);
    const status = String(slice.status || "none");
    planEl.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
    if (status === "active") {
      metaEl.textContent = slice.expiresAt
        ? `Active · expires ${String(slice.expiresAt).slice(0, 10)}`
        : "Active";
      card.dataset.state = "active";
    } else if (status === "expired") {
      metaEl.textContent = slice.expiresAt
        ? `Expired · ${String(slice.expiresAt).slice(0, 10)}`
        : "Expired";
      card.dataset.state = "expired";
    } else {
      metaEl.textContent = status;
      card.dataset.state = "none";
    }
  }

  /** Kharch Log is lifetime-only; Pdf Buddy offers yearly + lifetime. */
  function syncPlanOptions(preferred) {
    const product = $("u-product").value;
    const planEl = $("u-plan");
    const want =
      product === "kharchlog"
        ? "lifetime"
        : preferred === "yearly"
          ? "yearly"
          : preferred === "lifetime"
            ? "lifetime"
            : planEl.value || "lifetime";
    const options =
      product === "kharchlog"
        ? [["lifetime", "Lifetime"]]
        : [
            ["lifetime", "Lifetime"],
            ["yearly", "Yearly"]
          ];
    planEl.innerHTML = options
      .map(([v, label]) => `<option value="${v}">${label}</option>`)
      .join("");
    planEl.value = want === "yearly" && product !== "kharchlog" ? "yearly" : "lifetime";
  }

  function openUserModal(user) {
    const editing = !!(user && user.email);
    const summary = $("user-modal-summary");
    const emailWrap = $("u-email-wrap");
    const emailInput = $("u-email");
    const title = $("user-modal-title");
    const eyebrow = $("user-modal-eyebrow");
    const saveBtn = $("user-save-btn");

    eyebrow.textContent = editing ? "Customer" : "New customer";
    title.textContent = editing ? "Edit customer" : "Grant access";
    saveBtn.textContent = editing ? "Grant / update" : "Grant access";

    emailInput.value = user?.email || "";
    emailInput.readOnly = editing;
    // required only when creating - otherwise a hidden field can block submit
    emailInput.required = !editing;
    emailWrap.hidden = editing;
    emailWrap.classList.toggle("is-hidden", editing);

    $("u-name").value = user?.name || "";
    $("u-notes").value = user?.notes || "";
    $("user-modal-error").hidden = true;

    if (editing) {
      summary.hidden = false;
      $("u-avatar").textContent = initials(user.name, user.email);
      $("u-display-name").textContent = user.name || " - ";
      $("u-display-email").textContent = user.email;
      const key = user.state || (user.active ? "active" : "none");
      const badge = STATE_BADGE[key] || STATE_BADGE.none;
      const stateEl = $("u-display-state");
      stateEl.className = `badge ${badge.cls}`;
      stateEl.textContent = badge.text;
      fillProductStatus("u-kh", user.kharchlog);
      fillProductStatus("u-pdf", user.pdfbuddy);

      const kh = user.kharchlog || {};
      const pdf = user.pdfbuddy || {};
      if (kh.status === "active" && pdf.status !== "active") {
        $("u-product").value = "pdfbuddy";
        syncPlanOptions(pdf.plan === "yearly" ? "yearly" : "lifetime");
      } else {
        $("u-product").value = "kharchlog";
        syncPlanOptions("lifetime");
      }
    } else {
      summary.hidden = true;
      $("u-product").value = "kharchlog";
      syncPlanOptions("lifetime");
    }

    $("user-modal").showModal();
    (editing ? $("u-name") : emailInput).focus();
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text)
    );
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /** Never send plaintext password - hash matches Cloud Run adminPasswordHash(). */
  async function passwordHashForLogin(email, password) {
    const e = String(email || "").trim().toLowerCase();
    return sha256Hex(`easypeeze-admin-v1\n${e}\n${password}`);
  }

  function collectDeviceInfo() {
    let screenStr = "";
    try {
      screenStr = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth || ""}`;
    } catch (_e) {}
    return {
      deviceName: navigator.platform || "",
      platform: navigator.platform || "",
      vendor: navigator.vendor || "",
      userAgent: navigator.userAgent || "",
      language: navigator.language || "",
      languages: navigator.languages ? Array.from(navigator.languages) : [],
      screen: screenStr,
      timezone: (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
        } catch (_e) {
          return "";
        }
      })(),
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      maxTouchPoints: navigator.maxTouchPoints || null,
      cookieEnabled: typeof navigator.cookieEnabled === "boolean" ? navigator.cookieEnabled : null,
      clientTime: new Date().toISOString()
    };
  }

  function resetLoginSteps() {
    pendingChallengeId = "";
    pendingEmail = "";
    const otpBox = $("login-step-otp");
    const passBox = $("login-step-password");
    const otpInput = $("login-otp");
    if (otpBox) otpBox.classList.add("hidden");
    if (passBox) passBox.classList.remove("hidden");
    if (otpInput) otpInput.value = "";
    const emailInput = $("login-email");
    if (emailInput) emailInput.readOnly = false;
  }

  let loginWired = false;
  function wireLoginControls() {
    if (loginWired) return;
    loginWired = true;

    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!target || !target.closest) return;
      if (target.closest("#login-skip")) {
        window.dispatchEvent(new CustomEvent("admin-login-skip"));
        return;
      }
      const toggle = target.closest("#login-password-toggle");
      if (!toggle) return;
      const input = $("login-password");
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.setAttribute("aria-pressed", show ? "true" : "false");
      toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
      const eyeShow = toggle.querySelector(".eye-show");
      const eyeHide = toggle.querySelector(".eye-hide");
      if (eyeShow) eyeShow.classList.toggle("hidden", show);
      if (eyeHide) eyeHide.classList.toggle("hidden", !show);
      input.focus();
    });

    document.addEventListener("submit", async (e) => {
      if (!e.target || e.target.id !== "login-form") return;
      e.preventDefault();
    const btn = $("login-btn");
    const err = $("login-error");
    err.hidden = true;
    btn.disabled = true;
    btn.classList.add("is-busy");
    btn.setAttribute("aria-busy", "true");
    try {
      if (pendingChallengeId) {
        const otp = normalizeActionOtp($("login-otp").value);
        $("login-otp").value = "";
        if (!otp) throw new Error("Enter the code from email");
        const data = await fetch(`${API}/admin/login-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            challengeId: pendingChallengeId,
            otp,
            device: collectDeviceInfo()
          })
        }).then(async (r) => {
          const j = await r.json().catch(() => ({}));
          if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
          return j;
        });
        resetLoginSteps();
        setSession(data.token, data.email);
        showApp();
        await loadUsers();
        return;
      }
      const email = $("login-email").value.trim();
      const password = $("login-password").value;
      const passwordHash = await passwordHashForLogin(email, password);
      $("login-password").value = "";
      const data = await fetch(`${API}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, passwordHash, device: collectDeviceInfo() })
      }).then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
        return j;
      });
      if (!data.otpRequired || !data.challengeId) {
        throw new Error("Sign-in code required");
      }
      pendingChallengeId = String(data.challengeId);
      pendingEmail = email;
      $("login-email").readOnly = true;
      $("login-step-password").classList.add("hidden");
      $("login-step-otp").classList.remove("hidden");
      $("login-otp").focus();
    } catch (ex) {
      err.textContent = ex.message || "Login failed";
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-busy");
      btn.removeAttribute("aria-busy");
    }
  });
  }

  document.addEventListener("admin-login-ready", wireLoginControls);
  wireLoginControls();

  $("logout-btn").addEventListener("click", () => {
    expireSession("", "manual");
    const err = $("login-error");
    if (err) {
      err.textContent = "";
      err.hidden = true;
    }
  });

  $("customer-back").addEventListener("click", () => closeCustomer());
  $("cv-update").addEventListener("click", async () => {
    if (!currentCustomerEmail) return;
    const btn = $("cv-update");
    if (btn.classList.contains("is-busy")) return;
    const nextEmail = ($("cv-email").value || "").trim();
    if (!nextEmail || nextEmail.indexOf("@") < 1) {
      toast("Enter a valid email", "error");
      return;
    }
    btn.disabled = true;
    btn.classList.add("is-busy");
    btn.setAttribute("aria-busy", "true");
    try {
      const data = await api("/admin/update-user", {
        method: "POST",
        body: JSON.stringify({
          email: currentCustomerEmail,
          nextEmail,
          firstName: $("cv-first").value.trim(),
          lastName: $("cv-last").value.trim(),
          phone: $("cv-phone").value.trim(),
          notes: $("cv-notes").value.trim(),
          kharchlog: productPayload("cv-kh"),
          pdfbuddy: productPayload("cv-pdf")
        })
      });
      const email = data.email || nextEmail;
      await loadUsers();
      await openCustomer(email);
      toast("Updated", "ok");
    } catch (ex) {
      toast(ex.message || "Update failed", "error");
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-busy");
      btn.removeAttribute("aria-busy");
    }
  });

  $("cv-release-device").addEventListener("click", async () => {
    if (!currentCustomerEmail) return;
    const btn = $("cv-release-device");
    if (btn.classList.contains("is-busy")) return;
    const ok = await confirmUi({
      title: "Release device",
      message: `Release the device lock for ${currentCustomerEmail}? Their current phone will be signed out. They can sign in on a new phone after this.`,
      okLabel: "Release",
      danger: true
    });
    if (!ok) return;
    btn.disabled = true;
    btn.classList.add("is-busy");
    btn.setAttribute("aria-busy", "true");
    try {
      const data = await api("/admin/release-device", {
        method: "POST",
        body: JSON.stringify({ email: currentCustomerEmail })
      });
      toast(
        data.hadLock
          ? "Device lock released. They can sign in on a new phone."
          : "No active device lock. They can sign in on a new phone.",
        "ok"
      );
    } catch (ex) {
      toast(ex.message || "Release failed", "error");
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-busy");
      btn.removeAttribute("aria-busy");
    }
  });

  document.querySelectorAll(".customer-subtab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".customer-subtab").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const panel = btn.dataset.cpanel;
      $("cv-panel-login").classList.toggle("hidden", panel !== "login");
      $("cv-panel-sub").classList.toggle("hidden", panel !== "sub");
    });
  });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const tab = btn.dataset.tab;
      $("tab-customers").classList.toggle("hidden", tab !== "customers");
      $("tab-blog").classList.toggle("hidden", tab !== "blog");
      $("tab-notice").classList.toggle("hidden", tab !== "notice");
      syncShellLayout();
    });
  });
  $("cv-kh-plan").addEventListener("change", () => syncSubExpiry("cv-kh"));
  $("cv-pdf-plan").addEventListener("change", () => syncSubExpiry("cv-pdf"));

  $("btn-refresh").addEventListener("click", () =>
    loadUsers()
      .then(() => toast("Customers refreshed", "ok"))
      .catch((ex) => toast(ex.message, "error"))
  );
  $("search-users").addEventListener("input", () => renderUsers(usersCache));
  const customersHead = document.querySelector("#tab-customers thead");
  if (customersHead) {
    customersHead.addEventListener("click", (e) => {
      const th = e.target.closest("th[data-sort]");
      if (!th) return;
      const key = th.getAttribute("data-sort");
      if (!key) return;
      if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
      else {
        sortKey = key;
        sortDir = "asc";
      }
      renderUsers(usersCache);
    });
  }
  $("btn-new-user").addEventListener("click", () => openUserModal(null));

  $("users-tbody").addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del]");
    const edit = e.target.closest("[data-edit]");
    const open = e.target.closest("[data-open]");
    if (del) {
      const email = del.getAttribute("data-del");
      const ok = await confirmUi({
        title: "Remove customer",
        message: `Remove ${email}? This deletes their license records.`,
        okLabel: "Delete",
        danger: true
      });
      if (!ok) return;
      try {
        await api("/admin/revoke-access", {
          method: "POST",
          body: JSON.stringify({ email })
        });
        await loadUsers();
        toast(`Removed ${email}`, "ok");
      } catch (ex) {
        toast(ex.message, "error");
      }
      return;
    }
    if (edit) {
      e.preventDefault();
      openCustomer(edit.getAttribute("data-edit"));
      return;
    }
    if (open) {
      e.preventDefault();
      openCustomer(open.getAttribute("data-open"));
    }
  });

  $("u-product").addEventListener("change", () => syncPlanOptions());
  $("user-cancel").addEventListener("click", () => $("user-modal").close());
  $("user-cancel-btn").addEventListener("click", () => $("user-modal").close());
  $("user-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("user-modal-error");
    const save = $("user-save-btn");
    err.hidden = true;
    save.disabled = true;
    try {
      const email = $("u-email").value.trim();
      const product = $("u-product").value;
      const planType = $("u-plan").value;
      await api("/admin/grant-access", {
        method: "POST",
        body: JSON.stringify({
          email,
          name: $("u-name").value.trim(),
          product,
          planType,
          notes: $("u-notes").value.trim()
        })
      });
      $("user-modal").close();
      await loadUsers();
      if (currentCustomerEmail && currentCustomerEmail === email) {
        await openCustomer(email);
      }
      toast(`Granted ${planType} on ${product} to ${email}`, "ok");
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      save.disabled = false;
    }
  });

  /** Shared inline status line for the blog forms. */
  function setFormMsg(el, text, tone) {
    el.textContent = text;
    el.className = tone === "error" ? "form-error" : "form-msg";
    el.hidden = false;
  }

  function syncNoticePreview() {
    const h1 = ($("notice-h1").value || "").trim() || "We Are Live on playstore";
    const h2 = ($("notice-h2").value || "").trim() || "Download it from playstore now";
    $("notice-preview-h1").textContent = h1;
    $("notice-preview-h2").textContent = h2;
  }
  $("notice-h1").addEventListener("input", syncNoticePreview);
  $("notice-h2").addEventListener("input", syncNoticePreview);

  const NOTICE_COUNTRIES = (() => {
    const codes = [
      "AF","AL","DZ","AS","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT","AZ","BS","BH","BD","BB","BY",
      "BE","BZ","BJ","BM","BT","BO","BA","BW","BR","BN","BG","BF","BI","KH","CM","CA","CV","KY","CF","TD",
      "CL","CN","CO","KM","CG","CD","CR","CI","HR","CU","CY","CZ","DK","DJ","DM","DO","EC","EG","SV","GQ",
      "ER","EE","SZ","ET","FJ","FI","FR","GA","GM","GE","DE","GH","GI","GR","GL","GD","GU","GT","GN","GW",
      "GY","HT","HN","HK","HU","IS","IN","ID","IR","IQ","IE","IL","IT","JM","JP","JO","KZ","KE","KI","KP",
      "KR","KW","KG","LA","LV","LB","LS","LR","LY","LI","LT","LU","MO","MG","MW","MY","MV","ML","MT","MH",
      "MR","MU","MX","FM","MD","MC","MN","ME","MA","MZ","MM","NA","NR","NP","NL","NZ","NI","NE","NG","MK",
      "NO","OM","PK","PW","PS","PA","PG","PY","PE","PH","PL","PT","PR","QA","RO","RU","RW","KN","LC","VC",
      "WS","SM","ST","SA","SN","RS","SC","SL","SG","SK","SI","SB","SO","ZA","SS","ES","LK","SD","SR","SE",
      "CH","SY","TW","TJ","TZ","TH","TL","TG","TO","TT","TN","TR","TM","UG","UA","AE","GB","US","UY","UZ",
      "VU","VE","VN","YE","ZM","ZW"
    ];
    let names;
    try {
      names = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      names = null;
    }
    return codes
      .map((iso) => ({
        iso,
        name: (names && names.of(iso)) || iso,
        search: `${iso} ${(names && names.of(iso)) || ""}`.toLowerCase()
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  const noticeCountrySelected = new Set(NOTICE_COUNTRIES.map((c) => c.iso));

  function noticeCountrySelection() {
    const selected = NOTICE_COUNTRIES.map((c) => c.iso).filter((iso) => noticeCountrySelected.has(iso));
    const all = selected.length === NOTICE_COUNTRIES.length;
    return { all, countries: selected };
  }

  function syncNoticeCountrySummary() {
    const { all, countries } = noticeCountrySelection();
    const el = $("notice-countries-summary");
    if (!el) return;
    if (all) el.textContent = "All countries selected";
    else if (!countries.length) el.textContent = "No countries selected";
    else if (countries.length <= 4) el.textContent = `${countries.length} selected: ${countries.join(", ")}`;
    else el.textContent = `${countries.length} countries selected`;
  }

  function renderNoticeCountries(filter = "") {
    const list = $("notice-country-list");
    if (!list) return;
    const needle = String(filter || "").trim().toLowerCase();
    list.innerHTML = NOTICE_COUNTRIES.map((c) => {
      const hidden = needle && !c.search.includes(needle);
      const checked = noticeCountrySelected.has(c.iso) ? "checked" : "";
      return `<label class="country-picker__item${hidden ? " hidden" : ""}">
        <input type="checkbox" data-country="${c.iso}" ${checked} />
        <span>${esc(c.name)} <span class="muted">(${esc(c.iso)})</span></span>
      </label>`;
    }).join("");
  }

  renderNoticeCountries();
  syncNoticeCountrySummary();

  $("notice-country-list")?.addEventListener("change", (e) => {
    const input = e.target.closest("input[data-country]");
    if (!input) return;
    if (input.checked) noticeCountrySelected.add(input.dataset.country);
    else noticeCountrySelected.delete(input.dataset.country);
    syncNoticeCountrySummary();
  });

  $("notice-country-search")?.addEventListener("input", (e) => {
    renderNoticeCountries(e.target.value);
  });

  $("notice-countries-all")?.addEventListener("click", () => {
    NOTICE_COUNTRIES.forEach((c) => noticeCountrySelected.add(c.iso));
    renderNoticeCountries($("notice-country-search")?.value || "");
    syncNoticeCountrySummary();
  });

  $("notice-countries-none")?.addEventListener("click", () => {
    noticeCountrySelected.clear();
    renderNoticeCountries($("notice-country-search")?.value || "");
    syncNoticeCountrySummary();
  });

  $("notice-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const h1 = $("notice-h1").value.trim();
    const h2 = $("notice-h2").value.trim();
    const { all, countries } = noticeCountrySelection();
    if (!all && !countries.length) {
      toast("Select at least one country", "error");
      return;
    }
    const scope = all
      ? "all installs"
      : countries.length === 1
        ? `users in ${countries[0]}`
        : `users in ${countries.length} countries`;
    const ok = await confirmUi({
      title: "Send notice",
      message: `Send this notice to ${scope}?`,
      okLabel: "Send"
    });
    if (!ok) return;
    const msg = $("notice-msg");
    const btn = $("notice-form").querySelector('button[type="submit"]');
    msg.hidden = true;
    btn.disabled = true;
    try {
      await api("/admin/fanout", {
        method: "POST",
        body: JSON.stringify({
          h1,
          h2,
          allCountries: all,
          countries: all ? [] : countries
        })
      });
      setFormMsg(msg, all ? "Sent to all" : `Sent to ${countries.join(", ")}`, "ok");
      toast("Sent", "ok");
    } catch (ex) {
      setFormMsg(msg, ex.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  $("blog-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("blog-msg");
    const btn = $("blog-form").querySelector('button[type="submit"]');
    msg.hidden = true;
    btn.disabled = true;
    try {
      const data = await api("/admin/blog", {
        method: "POST",
        body: JSON.stringify({
          title: $("blog-title").value.trim(),
          slug: $("blog-slug").value.trim() || undefined,
          summary: $("blog-summary").value.trim(),
          body: $("blog-body").value
        })
      });
      setFormMsg(msg, data.url ? `Published: ${data.url}` : "Published", "ok");
      toast("Blog post published", "ok");
      $("blog-form").reset();
    } catch (ex) {
      setFormMsg(msg, ex.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  $("blog-delete-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const slug = $("blog-del-slug").value.trim();
    const ok = await confirmUi({
      title: "Delete blog post",
      message: `Delete blog slug "${slug}"?`,
      okLabel: "Delete",
      danger: true
    });
    if (!ok) return;
    const msg = $("blog-del-msg");
    const btn = $("blog-delete-form").querySelector('button[type="submit"]');
    msg.hidden = true;
    btn.disabled = true;
    try {
      await api("/admin/blog/delete", {
        method: "POST",
        body: JSON.stringify({ slug })
      });
      setFormMsg(msg, "Deleted", "ok");
      toast(`Deleted "${slug}"`, "ok");
      $("blog-delete-form").reset();
    } catch (ex) {
      setFormMsg(msg, ex.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  async function boot() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(EMAIL_KEY);
      sessionStorage.removeItem(EXPIRES_KEY);
    } catch (_e) {
      /* ignore */
    }
    showLogin();
  }

  ["pointerdown", "keydown", "click", "scroll", "touchstart"].forEach((ev) => {
    document.addEventListener(ev, () => markActivity(), { passive: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!token()) return;
    if (otpHoldIdle) return;
    if (Date.now() - lastActivity > IDLE_MS) {
      expireSession("Session expired - please log in again", "idle");
    }
  });

  boot();
})();
