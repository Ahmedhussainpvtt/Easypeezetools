(() => {
  // EP Business Voice notices (Notice tab). Customers, subscriptions and deletes live on the shared
  // Customers list / customer page. Calls go through the Easy Peeze API (/admin/voice/*), which asks
  // for the emailed OTP on every change and then talks to the EP Voice API server to server.
  const $ = (id) => document.getElementById(id);
  const A = () => window.EP_ADMIN;
  let busy = false;

  async function call(path, opts = {}) {
    if (!A()) throw new Error("Please log in again");
    return A().api(`/admin/voice${path}`, opts);
  }

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
      const data = await call("/notice", { method: "POST", body: JSON.stringify({ title, body, email }) });
      A().setFormMsg(msg, one ? `Sent to ${data.sent} phone(s)` : "Sent to everyone", "ok");
      A().toast("Notice sent", "ok");
    } catch (ex) {
      A().setFormMsg(msg, ex.message, "error");
    } finally {
      busy = false;
    }
  });
})();
