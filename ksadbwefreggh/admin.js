(() => {
  const API =
    window.EASYPEEZE_ADMIN_API ||
    "https://kharchlog-license-u4rcttr3nq-el.a.run.app";
  const TOKEN_KEY = "easypeeze_admin_token";
  const EMAIL_KEY = "easypeeze_admin_email";
  const EXPIRES_KEY = "easypeeze_admin_expires";
  const SESSION_MS = 30 * 60 * 1000;

  const $ = (id) => document.getElementById(id);
  let usersCache = [];
  let sessionTimer = null;

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const icon = (id) => `<svg aria-hidden="true"><use href="#${id}" /></svg>`;

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
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function sessionExpiresAt() {
    const raw = Number(sessionStorage.getItem(EXPIRES_KEY) || 0);
    return Number.isFinite(raw) ? raw : 0;
  }

  function isSessionAlive() {
    const tok = token();
    if (!tok) return false;
    const exp = sessionExpiresAt();
    // Older sessions without expiry metadata are treated as expired.
    if (!exp) return false;
    return Date.now() < exp;
  }

  function clearSessionTimer() {
    if (sessionTimer) {
      clearTimeout(sessionTimer);
      sessionTimer = null;
    }
  }

  function armSessionTimer() {
    clearSessionTimer();
    const exp = sessionExpiresAt();
    if (!exp) return;
    const wait = Math.max(0, exp - Date.now());
    sessionTimer = setTimeout(() => {
      expireSession("Session expired — sign in again");
    }, wait);
  }

  function expireSession(message) {
    clearSession();
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

  function setSession(tok, email, expiresAtMs) {
    const exp = Number(expiresAtMs) || Date.now() + SESSION_MS;
    sessionStorage.setItem(TOKEN_KEY, tok);
    sessionStorage.setItem(EMAIL_KEY, email || "");
    sessionStorage.setItem(EXPIRES_KEY, String(exp));
    armSessionTimer();
  }

  function clearSession() {
    clearSessionTimer();
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
    sessionStorage.removeItem(EXPIRES_KEY);
  }

  async function api(path, opts = {}) {
    if (!isSessionAlive()) {
      expireSession("Session expired — sign in again");
      throw new Error("session expired");
    }
    const headers = Object.assign(
      { Accept: "application/json", "Content-Type": "application/json" },
      opts.headers || {}
    );
    const tok = token();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    const res = await fetch(`${API}${path}`, { ...opts, headers });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { ok: false, error: text || "bad response" };
    }
    if (res.status === 401) {
      expireSession("Session expired — sign in again");
      throw new Error(data?.error || "unauthorized");
    }
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data;
  }

  function showLogin() {
    $("login-view").classList.remove("hidden");
    $("app-view").classList.add("hidden");
  }
  function showApp() {
    $("login-view").classList.add("hidden");
    $("app-view").classList.remove("hidden");
    const email = sessionStorage.getItem(EMAIL_KEY) || "";
    $("admin-email-label").textContent = email;
    $("admin-initials").textContent = initials("", email);
  }

  function initials(name, email) {
    const src = (name || email || "?").trim();
    const parts = src.split(/[\s@._-]+/).filter(Boolean);
    const a = (parts[0] || "?").slice(0, 1);
    const b = (parts[1] || parts[0] || "?").slice(0, 1);
    return (a + b).toUpperCase();
  }

  function planLabel(slice) {
    if (!slice || slice.plan === "none") return "—";
    const st = slice.status && slice.status !== "none" ? ` · ${slice.status}` : "";
    return `${slice.plan}${st}`;
  }

  function planCell(slice) {
    const label = planLabel(slice);
    let cls = "plan-pill";
    if (label === "—") cls += " plan-pill--none";
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

  /** Placeholder rows so the table never flashes an empty/"not found" state. */
  function showTableLoading() {
    $("users-empty").hidden = true;
    const widths = ["70%", "85%", "55%", "60%", "65%", "65%", "40%"];
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
            u.kharchlog?.plan,
            u.kharchlog?.status,
            u.pdfbuddy?.plan,
            u.pdfbuddy?.status
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
        );
    $("table-count").textContent = String(filtered.length);
    const tbody = $("users-tbody");
    tbody.innerHTML = "";
    $("users-empty").hidden = filtered.length > 0;
    for (const u of filtered) {
      const mail = esc(u.email);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="Name">
          <div class="name-cell">
            <span class="avatar">${esc(initials(u.name, u.email))}</span>
            <a class="name-link" href="#" data-edit="${mail}">${esc(u.name || "—")}</a>
          </div>
        </td>
        <td data-label="Email" class="cell-mono">${mail}</td>
        <td data-label="Phone" class="cell-mono">${esc(u.phone || "—")}</td>
        <td data-label="Status">${stateCell(u)}</td>
        <td data-label="Kharch Log">${planCell(u.kharchlog)}</td>
        <td data-label="Pdf Buddy">${planCell(u.pdfbuddy)}</td>
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

  function setKpis(stats) {
    $("kpi-total").textContent = stats?.total ?? "—";
    $("kpi-active").textContent = stats?.active ?? "—";
    $("kpi-expired").textContent = stats?.expired ?? "—";
    $("kpi-inactive").textContent = stats?.inactive ?? "—";
    $("kpi-kharch").textContent = stats?.kharchlogActive ?? "—";
    $("kpi-pdf").textContent = stats?.pdfbuddyActive ?? "—";
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
    // required only when creating — otherwise a hidden field can block submit
    emailInput.required = !editing;
    emailWrap.hidden = editing;
    emailWrap.classList.toggle("is-hidden", editing);

    $("u-name").value = user?.name || "";
    $("u-notes").value = user?.notes || "";
    $("user-modal-error").hidden = true;

    if (editing) {
      summary.hidden = false;
      $("u-avatar").textContent = initials(user.name, user.email);
      $("u-display-name").textContent = user.name || "—";
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

  /** Never send plaintext password — hash matches Cloud Run adminPasswordHash(). */
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

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("login-btn");
    const err = $("login-error");
    err.hidden = true;
    btn.disabled = true;
    try {
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
      setSession(
        data.token,
        data.email,
        data.expiresAt || Date.now() + SESSION_MS
      );
      showApp();
      await loadUsers();
    } catch (ex) {
      err.textContent = ex.message || "Login failed";
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("logout-btn").addEventListener("click", () => {
    clearSession();
    showLogin();
  });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const tab = btn.dataset.tab;
      $("tab-customers").classList.toggle("hidden", tab !== "customers");
      $("tab-blog").classList.toggle("hidden", tab !== "blog");
    });
  });

  $("btn-refresh").addEventListener("click", () =>
    loadUsers()
      .then(() => toast("Customers refreshed", "ok"))
      .catch((ex) => toast(ex.message, "error"))
  );
  $("search-users").addEventListener("input", () => renderUsers(usersCache));
  $("btn-new-user").addEventListener("click", () => openUserModal(null));

  $("users-tbody").addEventListener("click", async (e) => {
    const edit = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-del]");
    if (edit) {
      e.preventDefault();
      const email = edit.getAttribute("data-edit");
      openUserModal(usersCache.find((u) => u.email === email) || { email });
      return;
    }
    if (del) {
      const email = del.getAttribute("data-del");
      if (!confirm(`Remove ${email}? This deletes their license records.`)) return;
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
    if (!confirm(`Delete blog slug "${slug}"?`)) return;
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
    if (!isSessionAlive()) {
      clearSession();
      showLogin();
      return;
    }
    armSessionTimer();
    showApp();
    try {
      await api("/admin/me");
      await loadUsers();
    } catch {
      expireSession("Session expired — sign in again");
    }
  }

  boot();
})();
