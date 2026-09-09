(() => {
  const API =
    window.EASYPEEZE_ADMIN_API ||
    "https://kharchlog-license-u4rcttr3nq-el.a.run.app";
  const TOKEN_KEY = "easypeeze_admin_token";
  const EMAIL_KEY = "easypeeze_admin_email";

  const $ = (id) => document.getElementById(id);
  let usersCache = [];

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }
  function setSession(tok, email) {
    sessionStorage.setItem(TOKEN_KEY, tok);
    sessionStorage.setItem(EMAIL_KEY, email || "");
  }
  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
  }

  async function api(path, opts = {}) {
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
      clearSession();
      showLogin();
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
    $("admin-email-label").textContent =
      sessionStorage.getItem(EMAIL_KEY) || "";
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

  function renderUsers(list) {
    const q = ($("search-users").value || "").trim().toLowerCase();
    const filtered = !q
      ? list
      : list.filter((u) =>
          [u.email, u.name, u.phone, u.kharchlog?.plan, u.pdfbuddy?.plan]
            .join(" ")
            .toLowerCase()
            .includes(q)
        );
    $("table-count").textContent = String(filtered.length);
    const tbody = $("users-tbody");
    tbody.innerHTML = "";
    $("users-empty").hidden = filtered.length > 0;
    for (const u of filtered) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="name-cell">
            <span class="avatar">${initials(u.name, u.email)}</span>
            <a class="name-link" href="#" data-edit="${u.email}">${u.name || "—"}</a>
          </div>
        </td>
        <td>${u.email}</td>
        <td>${u.phone || "—"}</td>
        <td><span class="badge ${u.active ? "badge-ok" : "badge-off"}">${
          u.active ? "● ACTIVE" : "○ INACTIVE"
        }</span></td>
        <td><span class="plan-pill">${planLabel(u.kharchlog)}</span></td>
        <td><span class="plan-pill">${planLabel(u.pdfbuddy)}</span></td>
        <td>
          <div class="row-actions">
            <button type="button" class="icon-btn" title="Edit" data-edit="${u.email}">✎</button>
            <button type="button" class="icon-btn" title="Remove" data-del="${u.email}">🗑</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    }
  }

  function setKpis(stats) {
    $("kpi-total").textContent = stats?.total ?? "—";
    $("kpi-active").textContent = stats?.active ?? "—";
    $("kpi-inactive").textContent = stats?.inactive ?? "—";
    $("kpi-kharch").textContent = stats?.kharchlogActive ?? "—";
    $("kpi-pdf").textContent = stats?.pdfbuddyActive ?? "—";
  }

  async function loadUsers() {
    const data = await api("/admin/users");
    usersCache = data.users || [];
    setKpis(data.stats || {});
    renderUsers(usersCache);
  }

  function openUserModal(user) {
    $("user-modal-title").textContent = user ? "Edit customer" : "New customer";
    $("u-email").value = user?.email || "";
    $("u-email").readOnly = !!user;
    $("u-name").value = user?.name || "";
    $("u-product").value = "kharchlog";
    $("u-plan").value = "lifetime";
    $("u-notes").value = user?.notes || "";
    $("user-modal-error").hidden = true;
    $("user-modal").showModal();
  }

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("login-btn");
    const err = $("login-error");
    err.hidden = true;
    btn.disabled = true;
    try {
      const data = await fetch(`${API}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          email: $("login-email").value.trim(),
          password: $("login-password").value
        })
      }).then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
        return j;
      });
      setSession(data.token, data.email);
      $("login-password").value = "";
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

  $("btn-refresh").addEventListener("click", () => loadUsers().catch(alert));
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
      } catch (ex) {
        alert(ex.message);
      }
    }
  });

  $("user-cancel").addEventListener("click", () => $("user-modal").close());
  $("user-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("user-modal-error");
    err.hidden = true;
    try {
      await api("/admin/grant-access", {
        method: "POST",
        body: JSON.stringify({
          email: $("u-email").value.trim(),
          name: $("u-name").value.trim(),
          product: $("u-product").value,
          planType: $("u-plan").value,
          notes: $("u-notes").value.trim()
        })
      });
      $("user-modal").close();
      await loadUsers();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });

  $("blog-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("blog-msg");
    msg.hidden = true;
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
      msg.textContent = data.url ? `Published: ${data.url}` : "Published";
      msg.hidden = false;
      $("blog-form").reset();
    } catch (ex) {
      msg.textContent = ex.message;
      msg.style.color = "#dc2626";
      msg.hidden = false;
    }
  });

  $("blog-delete-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const slug = $("blog-del-slug").value.trim();
    if (!confirm(`Delete blog slug "${slug}"?`)) return;
    const msg = $("blog-del-msg");
    msg.hidden = true;
    try {
      await api("/admin/blog/delete", {
        method: "POST",
        body: JSON.stringify({ slug })
      });
      msg.textContent = "Deleted";
      msg.style.color = "#059669";
      msg.hidden = false;
      $("blog-delete-form").reset();
    } catch (ex) {
      msg.textContent = ex.message;
      msg.style.color = "#dc2626";
      msg.hidden = false;
    }
  });

  async function boot() {
    if (!token()) {
      showLogin();
      return;
    }
    showApp();
    try {
      await api("/admin/me");
      await loadUsers();
    } catch {
      clearSession();
      showLogin();
    }
  }

  boot();
})();
