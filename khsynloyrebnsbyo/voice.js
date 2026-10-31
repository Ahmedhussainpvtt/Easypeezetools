(() => {
  // EP Business Voice tab. Uses the Super Admin session; the EP Voice API verifies it with Easy Peeze.
  const VOICE_API = window.EPVOICE_ADMIN_API || "https://epvoice-api-273130308560.us-central1.run.app";
  const $ = (id) => document.getElementById(id);
  const A = () => window.EP_ADMIN;
  let rows = [];
  let loaded = false;
  let busy = false;

  async function call(path, opts = {}) {
    const tok = A()?.token();
    if (!tok) throw new Error("Please log in again");
    const res = await fetch(`${VOICE_API}${path}`, {
      ...opts,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${tok}`,
        ...(opts.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      A()?.expire();
      throw new Error("Session expired - please log in again");
    }
    if (!res.ok || data.ok === false) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  const esc = (v) => (A() ? A().esc(v) : String(v ?? ""));
  const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

  function when(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function ago(iso) {
    if (!iso) return "never";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return "just now";
    const m = Math.round(ms / 60_000);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} h ago`;
    return when(iso);
  }

  function subBadge(lic) {
    if (lic.active) return `<span class="badge badge-ok">Active ${esc(lic.plan)}</span>`;
    if (lic.status === "expired") return `<span class="badge badge-warn">Expired</span>`;
    return `<span class="badge badge-off">None</span>`;
  }

  function render() {
    const q = ($("voice-search").value || "").trim().toLowerCase();
    const list = rows.filter((r) =>
      !q || [r.name, r.email, r.businessName, r.license.plan].some((v) => String(v || "").toLowerCase().includes(q))
    );
    $("voice-count").textContent = String(list.length);
    $("voice-empty").hidden = list.length > 0;
    $("voice-tbody").innerHTML = list.map((r) => `
      <tr>
        <td>${esc(r.name || "-")}</td>
        <td>${esc(r.email)}</td>
        <td>${esc(r.businessName || "-")}</td>
        <td>${subBadge(r.license)}</td>
        <td>${when(r.license.expiresAt)}</td>
        <td>${r.deviceActive ? esc(r.deviceModel || "Signed in") : '<span class="muted">Signed out</span>'}</td>
        <td>${r.twilio.connected ? `<span class="badge badge-ok">${r.twilio.numbers.length} number(s)</span>` : '<span class="badge badge-off">Not connected</span>'}</td>
        <td>${ago(r.lastSeenAt)}</td>
        <td class="col-actions">
          <button type="button" class="btn btn-outline btn-sm" data-voice-extend="${esc(r.email)}">+1 month</button>
          ${r.license.active ? `<button type="button" class="btn btn-danger btn-sm" data-voice-revoke="${esc(r.email)}">Revoke</button>` : ""}
        </td>
      </tr>`).join("");
  }

  async function load() {
    try {
      const data = await call("/admin/customers");
      rows = data.customers || [];
      const t = data.totals || {};
      $("vkpi-users").textContent = String(t.users ?? 0);
      $("vkpi-active").textContent = String(t.active ?? 0);
      $("vkpi-expired").textContent = String(t.expired ?? 0);
      $("vkpi-connected").textContent = String(t.connected ?? 0);
      $("vkpi-mrr").textContent = inr(t.mrrInr);
      $("voice-price-note").textContent =
        `Monthly plan at ${inr(data.priceInr)} per phone. Extending an active plan adds to its end date.`;
      loaded = true;
      render();
    } catch (ex) {
      A()?.toast(ex.message, "error");
    }
  }

  async function grant(email, months) {
    const data = await call("/admin/grant", { method: "POST", body: JSON.stringify({ email, months }) });
    A()?.toast(`${email} active until ${when(data.license.expiresAt)}`, "ok");
    await load();
  }

  window.addEventListener("ep-admin-tab", (e) => {
    if (e.detail === "voice" && !loaded) load();
  });

  $("voice-refresh")?.addEventListener("click", load);
  $("voice-search")?.addEventListener("input", render);

  $("voice-tbody")?.addEventListener("click", async (e) => {
    const ext = e.target.closest("[data-voice-extend]");
    const rev = e.target.closest("[data-voice-revoke]");
    if ((!ext && !rev) || busy) return;
    const email = (ext || rev).dataset.voiceExtend || (ext || rev).dataset.voiceRevoke;
    const ok = await A().confirmUi(ext
      ? { title: "Extend subscription", message: `Add 1 month for ${email}?`, okLabel: "Extend" }
      : { title: "Revoke subscription", message: `Stop EP Business Voice for ${email} now? Their phone stops working right away.`, okLabel: "Revoke", danger: true });
    if (!ok) return;
    busy = true;
    try {
      if (ext) await grant(email, 1);
      else {
        await call("/admin/revoke", { method: "POST", body: JSON.stringify({ email }) });
        A().toast(`Revoked ${email}`, "ok");
        await load();
      }
    } catch (ex) {
      A().toast(ex.message, "error");
    } finally {
      busy = false;
    }
  });

  $("voice-grant-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const email = $("voice-grant-email").value.trim().toLowerCase();
    const months = Math.max(1, Math.min(24, parseInt($("voice-grant-months").value, 10) || 1));
    const ok = await A().confirmUi({
      title: "Save subscription",
      message: `Give ${email} ${months} month(s) of EP Business Voice?`,
      okLabel: "Save"
    });
    if (!ok) return;
    busy = true;
    const msg = $("voice-grant-msg");
    msg.hidden = true;
    try {
      await grant(email, months);
      A().setFormMsg(msg, "Saved", "ok");
      $("voice-grant-form").reset();
    } catch (ex) {
      A().setFormMsg(msg, ex.message, "error");
    } finally {
      busy = false;
    }
  });

  $("voice-notice-target")?.addEventListener("change", (e) => {
    $("voice-notice-email-wrap").hidden = e.target.value !== "one";
  });

  $("voice-notice-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const title = $("voice-notice-title").value.trim();
    const body = $("voice-notice-body").value.trim();
    const one = $("voice-notice-target").value === "one";
    const email = one ? $("voice-notice-email").value.trim().toLowerCase() : "";
    if (one && !email) {
      A().toast("Enter the customer email", "error");
      return;
    }
    const ok = await A().confirmUi({
      title: "Send notice",
      message: one ? `Send this notice to ${email}?` : "Send this notice to everyone with EP Business Voice?",
      okLabel: "Send"
    });
    if (!ok) return;
    busy = true;
    const msg = $("voice-notice-msg");
    msg.hidden = true;
    try {
      const data = await call("/admin/notice", { method: "POST", body: JSON.stringify({ title, body, email }) });
      A().setFormMsg(msg, one ? `Sent to ${data.sent} phone(s)` : "Sent to everyone", "ok");
      A().toast("Notice sent", "ok");
    } catch (ex) {
      A().setFormMsg(msg, ex.message, "error");
    } finally {
      busy = false;
    }
  });
})();
